use crate::adb::{self, PageType};
use crate::state::{AppState, AutoMessageStatus};
use crate::ui_automator;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Create a Command with hidden window on Windows
fn create_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }
    
    cmd
}

// Cached UI element coordinates (found via UIAutomator on first chat entry per cycle)
static CACHED_SEND_BUTTON: Mutex<Option<(i32, i32)>> = Mutex::new(None);
static CACHED_INPUT_BOX: Mutex<Option<(i32, i32)>> = Mutex::new(None);

/// Content item - either text or photo
#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum ContentItem {
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "photo")]
    Photo { index: i32 },
}

/// Helper struct for logging from background thread
struct BgLogger {
    logs: Arc<Mutex<Vec<String>>>,
}

impl BgLogger {
    fn log(&self, msg: &str) {
        let timestamp = chrono::Local::now().format("[%H:%M:%S]").to_string();
        let mut logs_guard = self.logs.lock().unwrap();
        logs_guard.push(format!("{} {}", timestamp, msg));
        if logs_guard.len() > 200 {
            logs_guard.remove(0);
        }
    }
}

/// Click the first "撩" button on the newbie list (fixed coordinates)
fn click_liao_button(device: &str, screen_size: (i32, i32), _logger: &BgLogger) -> bool {
    let (btn_x, btn_y) = scale_coords(1692, 690, screen_size);
    let _ = adb::tap(device, btn_x, btn_y);
    true
}

/// Click the back button using Android system back key
fn click_back_button(device: &str, _screen_size: (i32, i32)) {
    let _ = adb::press_back(device);
}

/// Check if still on chat page by looking for send button
fn is_on_chat_page(device: &str) -> bool {
    match ui_automator::dump_ui_hierarchy(device) {
        Ok(xml) => xml.contains("com.pico.live:id/tvSend"),
        Err(_) => false,
    }
}

/// Smart back navigation - keeps pressing back until send button is gone
/// Returns true if successfully left chat page, false if failed after max attempts
fn smart_back_to_newbie_list(device: &str, screen_size: (i32, i32), logger: &BgLogger) -> bool {
    const MAX_ATTEMPTS: i32 = 5;
    
    for attempt in 1..=MAX_ATTEMPTS {
        logger.log(&format!("返回尝试 {}/{}", attempt, MAX_ATTEMPTS));
        
        // Press back
        click_back_button(device, screen_size);
        thread::sleep(Duration::from_millis(1500));
        
        // Check if send button is still visible (means still on chat page)
        if !is_on_chat_page(device) {
            logger.log(&format!("✓ 成功返回 (第{}次尝试)", attempt));
            return true;
        }
        
        logger.log("仍在聊天页面，继续返回...");
        thread::sleep(Duration::from_millis(500));
    }
    
    logger.log(&format!("⚠ 返回失败，已尝试{}次", MAX_ATTEMPTS));
    false
}

/// Tap the Nth photo in the document picker (0-indexed)
fn tap_photo_in_picker(device: &str, index: usize, logger: &BgLogger) -> bool {
    let adb = adb::get_adb_path_public();
    let _ = create_command(&adb)
        .args(["-s", device, "shell", "uiautomator", "dump", "/sdcard/ui.xml"])
        .output();
    
    let output = match create_command(&adb)
        .args(["-s", device, "shell", "cat", "/sdcard/ui.xml"])
        .output() 
    {
        Ok(o) => o,
        Err(_) => return false,
    };
    
    let xml = String::from_utf8_lossy(&output.stdout);
    let mut photo_coords: Vec<(i32, i32)> = Vec::new();
    
    for segment in xml.split('<') {
        if segment.contains("com.android.documentsui:id/icon_thumb") || 
           segment.contains("com.android.documentsui:id/thumbnail") {
            if let Some(bounds_start) = segment.find("bounds=\"[") {
                let bounds_str = &segment[bounds_start + 8..];
                if let Some(bounds_end) = bounds_str.find('"') {
                    let bounds = &bounds_str[..bounds_end];
                    let coords: Vec<i32> = bounds
                        .replace(['[', ']', ','], " ")
                        .split_whitespace()
                        .filter_map(|s| s.parse().ok())
                        .collect();
                    if coords.len() >= 4 {
                        let cx = (coords[0] + coords[2]) / 2;
                        let cy = (coords[1] + coords[3]) / 2;
                        if !photo_coords.contains(&(cx, cy)) {
                            photo_coords.push((cx, cy));
                        }
                    }
                }
            }
        }
    }
    
    if let Some(&(x, y)) = photo_coords.get(index) {
        let _ = adb::tap(device, x, y);
        return true;
    }
    
    logger.log(&format!("图片{}未找到", index + 1));
    false
}

/// Scale coordinates from base 2160x3840 screen to actual screen size
fn scale_coords(base_x: i32, base_y: i32, screen_size: (i32, i32)) -> (i32, i32) {
    let (screen_w, screen_h) = screen_size;
    let scale_x = screen_w as f64 / 2160.0;
    let scale_y = screen_h as f64 / 3840.0;
    ((base_x as f64 * scale_x) as i32, (base_y as f64 * scale_y) as i32)
}

/// Try to find send button using UIAutomator (with caching)
/// On first call per cycle, uses UIAutomator to find the button and caches coordinates
fn click_send_button_smart(device: &str, screen_size: (i32, i32), logger: &BgLogger) -> bool {
    // Check cache first
    if let Ok(guard) = CACHED_SEND_BUTTON.lock() {
        if let Some((x, y)) = *guard {
            let _ = adb::tap(device, x, y);
            return true;
        }
    }
    
    logger.log("首次用UIAutomator查找发送按钮...");
    
    // Use UIAutomator to find send button by resource-id
    match ui_automator::find_send_button(device) {
        Ok(Some((x, y))) => {
            // Cache the coordinates
            if let Ok(mut guard) = CACHED_SEND_BUTTON.lock() {
                *guard = Some((x, y));
                logger.log(&format!("发送按钮坐标: ({}, {})", x, y));
            }
            let _ = adb::tap(device, x, y);
            return true;
        }
        Ok(None) => {
            logger.log("UIAutomator未找到发送按钮，使用默认坐标");
        }
        Err(e) => {
            logger.log(&format!("UIAutomator错误: {}, 使用默认坐标", e));
        }
    }
    
    // Fallback to default coordinate
    let (send_x, send_y) = scale_coords(2000, 3544, screen_size);
    
    if let Ok(mut guard) = CACHED_SEND_BUTTON.lock() {
        *guard = Some((send_x, send_y));
    }
    
    let _ = adb::tap(device, send_x, send_y);
    true
}

/// Click input box - use default coordinates (input box is usually at bottom center)
fn click_input_box(device: &str, screen_size: (i32, i32), logger: &BgLogger) -> bool {
    // Check cache first
    if let Ok(guard) = CACHED_INPUT_BOX.lock() {
        if let Some((x, y)) = *guard {
            let _ = adb::tap(device, x, y);
            return true;
        }
    }
    
    // For input box, just use scaled coordinates
    // Input box is typically at bottom center, left of send button
    let (input_x, input_y) = scale_coords(540, 3544, screen_size);
    
    if let Ok(mut guard) = CACHED_INPUT_BOX.lock() {
        *guard = Some((input_x, input_y));
        logger.log(&format!("输入框坐标: ({}, {})", input_x, input_y));
    }
    
    let _ = adb::tap(device, input_x, input_y);
    true
}

/// Clear cached coordinates (call when starting a new cycle)
pub fn clear_ui_cache() {
    if let Ok(mut guard) = CACHED_SEND_BUTTON.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = CACHED_INPUT_BOX.lock() {
        *guard = None;
    }
}

/// Send one content item
fn send_item(device: &str, item: &ContentItem, logger: &BgLogger, screen_size: (i32, i32)) {
    match item {
        ContentItem::Text { content } => {
            if content.trim().is_empty() { return; }
            
            // 智能点击输入框
            click_input_box(device, screen_size, logger);
            thread::sleep(Duration::from_millis(400));
            
            // 输入文字
            if adb::input_text(device, content).is_err() {
                logger.log(&format!("输入失败: {}", content));
                return;
            }
            thread::sleep(Duration::from_millis(300));
            
            // 智能点击发送按钮
            click_send_button_smart(device, screen_size, logger);
            thread::sleep(Duration::from_millis(400));
        }
        ContentItem::Photo { index } => {
            let (photo_x, photo_y) = scale_coords(784, 3744, screen_size);
            let _ = adb::tap(device, photo_x, photo_y);
            thread::sleep(Duration::from_millis(1500));
            
            let photo_index = (*index - 1) as usize;
            if !tap_photo_in_picker(device, photo_index, logger) {
                return;
            }
            thread::sleep(Duration::from_millis(1500));
        }
    }
}

/// Run message sending (unified for test and batch)
fn run_send_loop(
    device: String,
    items: Vec<ContentItem>,
    count: usize,
    delay: f64,
    running: Arc<Mutex<bool>>,
    processed: Arc<Mutex<usize>>,
    total: Arc<Mutex<usize>>,
    logs: Arc<Mutex<Vec<String>>>,
    current_page: Arc<Mutex<String>>,
    ui_detection_in_progress: Arc<Mutex<bool>>,
    is_test: bool,
    screen_size: (i32, i32),
    session_id: Arc<Mutex<u64>>,
    my_session: u64,
) {
    // Helper to check if this session is still valid
    let is_valid = || -> bool {
        *running.lock().unwrap() && *session_id.lock().unwrap() == my_session
    };
    
    // Helper to update current page
    let update_page = |page: PageType| {
        let page_str = match page {
            PageType::NewbieList => "newbie_list",
            PageType::Chat => "chat",
            PageType::Unknown => "unknown",
        };
        *current_page.lock().unwrap() = page_str.to_string();
    };
    
    // Helper to set UI detection progress
    let set_ui_detection_progress = |in_progress: bool| {
        *ui_detection_in_progress.lock().unwrap() = in_progress;
    };
    
    // 检查是否卡在聊天页面（通过检测发送按钮）
    // 如果在聊天页面，尝试返回
    // 返回 true 表示不在聊天页面（可以继续），false 表示无法恢复
    let ensure_not_on_chat = |logger: &BgLogger| -> bool {
        set_ui_detection_progress(true);
        let on_chat = is_on_chat_page(&device);
        set_ui_detection_progress(false);
        
        if !on_chat {
            return true; // 不在聊天页面，OK
        }
        
        logger.log("检测到仍在聊天页面，尝试返回...");
        
        // 尝试返回最多3次
        for attempt in 1..=3 {
            click_back_button(&device, screen_size);
            thread::sleep(Duration::from_millis(1500));
            
            set_ui_detection_progress(true);
            let still_on_chat = is_on_chat_page(&device);
            set_ui_detection_progress(false);
            
            if !still_on_chat {
                logger.log(&format!("✓ 第{}次返回成功", attempt));
                return true;
            }
            logger.log(&format!("第{}次返回后仍在聊天页面", attempt));
        }
        
        false
    };
    
    *running.lock().unwrap() = true;
    *processed.lock().unwrap() = 0;
    *total.lock().unwrap() = count;
    
    let logger = BgLogger { logs };
    
    if is_test {
        logger.log("测试发送");
        for (i, item) in items.iter().enumerate() {
            if !is_valid() { break; }
            send_item(&device, item, &logger, screen_size);
            if i < items.len() - 1 {
                thread::sleep(Duration::from_millis(1000));
            }
        }
        *processed.lock().unwrap() = 1;
        logger.log("测试完成");
    } else {
        const CHECK_INTERVAL: usize = 10;
        
        logger.log(&format!("开始发送 {} 人", count));
        update_page(PageType::NewbieList);
        
        for i in 0..count {
            if !is_valid() {
                logger.log("已取消");
                break;
            }
            
            logger.log(&format!("用户 {}/{}", i + 1, count));
            
            // 每10个人检查一次是否卡在聊天页面
            if i > 0 && i % CHECK_INTERVAL == 0 {
                if !ensure_not_on_chat(&logger) {
                    logger.log("⚠ 无法离开聊天页面，暂停");
                    *running.lock().unwrap() = false;
                    return;
                }
            }
            
            // 点击撩
            click_liao_button(&device, screen_size, &logger);
            thread::sleep(Duration::from_millis(2500));
            update_page(PageType::Chat);
            
            // 发送消息
            for (j, item) in items.iter().enumerate() {
                if !is_valid() { break; }
                send_item(&device, item, &logger, screen_size);
                if j < items.len() - 1 {
                    thread::sleep(Duration::from_millis(800));
                }
            }
            
            // 智能返回 - 检测发送按钮是否消失
            thread::sleep(Duration::from_millis(500));
            if !smart_back_to_newbie_list(&device, screen_size, &logger) {
                logger.log("⚠ 无法返回，暂停");
                *running.lock().unwrap() = false;
                return;
            }
            update_page(PageType::NewbieList);
            
            *processed.lock().unwrap() = i + 1;
            
            if i < count - 1 {
                thread::sleep(Duration::from_secs_f64(delay));
            }
        }
        
        logger.log(&format!("完成 {} 人", *processed.lock().unwrap()));
    }
    
    // Only set running to false if this session is still the current one
    if *session_id.lock().unwrap() == my_session {
        *running.lock().unwrap() = false;
    }
}

// Tauri commands

/// Test send
#[tauri::command]
pub fn cmd_test_in_chat(
    items: Vec<ContentItem>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if *state.auto_message_running.lock().unwrap() {
        return Err("已在运行中".to_string());
    }
    
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if items.is_empty() {
        return Err("请添加发送内容".to_string());
    }
    
    let screen_size = state.screen_size.lock().unwrap()
        .unwrap_or_else(|| adb::get_screen_size(&device));
    
    let logger = BgLogger { logs: Arc::clone(&state.logs) };
    
    for item in items.iter() {
        send_item(&device, item, &logger, screen_size);
    }
    
    Ok("测试完成".to_string())
}

/// Start batch sending - sends N complete message loops
#[tauri::command]
pub fn cmd_start(
    items: Vec<ContentItem>,
    max_users: usize,
    delay: f64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if *state.auto_message_running.lock().unwrap() {
        return Err("已在运行中".to_string());
    }
    
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if items.is_empty() {
        return Err("请添加发送内容".to_string());
    }
    
    // Clear UI cache at start of each new cycle
    // This ensures we re-detect button positions for each batch
    clear_ui_cache();
    
    // Get cached screen size, fallback to fetching if not available
    let screen_size = state.screen_size.lock().unwrap()
        .unwrap_or_else(|| adb::get_screen_size(&device));
    
    // Increment session_id to invalidate any old threads
    let mut session_guard = state.session_id.lock().unwrap();
    *session_guard += 1;
    let my_session = *session_guard;
    drop(session_guard);
    
    let running = Arc::clone(&state.auto_message_running);
    let processed = Arc::clone(&state.auto_message_processed);
    let total = Arc::clone(&state.auto_message_total);
    let logs = Arc::clone(&state.logs);
    let session_id = Arc::clone(&state.session_id);
    let current_page = Arc::clone(&state.current_page);
    let ui_detection_in_progress = Arc::clone(&state.ui_detection_in_progress);
    
    thread::spawn(move || {
        run_send_loop(device, items, max_users, delay, running, processed, total, logs, current_page, ui_detection_in_progress, false, screen_size, session_id, my_session);
    });
    
    Ok(format!("开始发送，目标 {} 人", max_users))
}

/// Stop sending (works for both test and batch)
#[tauri::command]
pub fn cmd_stop(state: State<'_, AppState>) -> Result<String, String> {
    // Increment session_id to invalidate the current running thread
    *state.session_id.lock().unwrap() += 1;
    *state.auto_message_running.lock().unwrap() = false;
    Ok("已停止".to_string())
}

/// Get current status
#[tauri::command]
pub fn cmd_status(state: State<'_, AppState>) -> AutoMessageStatus {
    AutoMessageStatus {
        running: *state.auto_message_running.lock().unwrap(),
        processed: *state.auto_message_processed.lock().unwrap(),
        total: *state.auto_message_total.lock().unwrap(),
        current_page: state.current_page.lock().unwrap().clone(),
        ui_detection_in_progress: *state.ui_detection_in_progress.lock().unwrap(),
    }
}
