use crate::state::AppState;
use anyhow::Result;
use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Global ADB path that can be overridden by user
static CUSTOM_ADB_PATH: Mutex<Option<String>> = Mutex::new(None);

/// Create a Command with hidden window on Windows
fn create_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    
    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW = 0x08000000
        cmd.creation_flags(0x08000000);
    }
    
    cmd
}

#[derive(Serialize, Clone)]
pub struct MumuInstance {
    pub index: i32,
    pub name: String,
    pub port: u16,
    pub running: bool,
    pub display_name: String,
}

#[derive(Serialize, Clone)]
pub struct AdbInfo {
    pub path: String,
    pub found: bool,
    pub is_custom: bool,
    pub bundled_path: Option<String>,
    pub exe_path: Option<String>,
}

/// Get bundled ADB path based on current executable location
fn get_bundled_adb_path() -> Option<String> {
    let exe_path = std::env::current_exe().ok()?;
    
    #[cfg(target_os = "macos")]
    {
        // On macOS: App.app/Contents/MacOS/app -> App.app/Contents/Resources/adb/adb
        let resources_dir = exe_path
            .parent()? // MacOS
            .parent()? // Contents
            .join("Resources")
            .join("adb")
            .join("adb");
        if resources_dir.exists() {
            return Some(resources_dir.to_string_lossy().to_string());
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // On Windows: app.exe -> adb/adb.exe (same directory)
        let adb_path = exe_path
            .parent()?
            .join("adb")
            .join("adb.exe");
        if adb_path.exists() {
            return Some(adb_path.to_string_lossy().to_string());
        }
    }
    
    None
}

/// Get bundled ADB path for debugging (returns the expected path even if not exists)
fn get_bundled_adb_path_debug() -> Option<String> {
    let exe_path = std::env::current_exe().ok()?;
    
    #[cfg(target_os = "macos")]
    {
        let resources_dir = exe_path
            .parent()?
            .parent()?
            .join("Resources")
            .join("adb")
            .join("adb");
        return Some(resources_dir.to_string_lossy().to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        let adb_path = exe_path
            .parent()?
            .join("adb")
            .join("adb.exe");
        return Some(adb_path.to_string_lossy().to_string());
    }
    
    #[allow(unreachable_code)]
    None
}

/// Get ADB path - auto detect from MuMu installation or common locations
fn get_adb_path() -> String {
    // Check if user has set a custom path
    if let Ok(guard) = CUSTOM_ADB_PATH.lock() {
        if let Some(ref path) = *guard {
            return path.clone();
        }
    }
    
    // Try bundled ADB first
    if let Some(bundled) = get_bundled_adb_path() {
        return bundled;
    }
    
    detect_adb_path()
}

/// Public version for debugging
pub fn get_adb_path_public() -> String {
    get_adb_path()
}

/// Detect ADB path from known locations
fn detect_adb_path() -> String {
    #[cfg(target_os = "macos")]
    {
        // Check common system paths FIRST (more reliable)
        let system_paths = [
            "/opt/homebrew/bin/adb",
            "/usr/local/bin/adb",
            "/usr/bin/adb",
        ];
        for path in system_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
        
        // Fallback to MuMu installation
        let mumu_paths = [
            "/Applications/MuMuPlayer.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
            "/Applications/MuMu Player.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
            "/Applications/MuMuPlayerPro.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
        ];
        for path in mumu_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Check MuMu installation paths
        let mumu_paths = [
            "C:\\Program Files\\Netease\\MuMuPlayerGlobal-12.0\\shell\\adb.exe",
            "C:\\Program Files\\Netease\\MuMuPlayer-12.0\\shell\\adb.exe",
            "C:\\Program Files (x86)\\Netease\\MuMuPlayerGlobal-12.0\\shell\\adb.exe",
            "C:\\Program Files (x86)\\Netease\\MuMuPlayer-12.0\\shell\\adb.exe",
            "D:\\Program Files\\Netease\\MuMuPlayerGlobal-12.0\\shell\\adb.exe",
            "D:\\Program Files\\Netease\\MuMuPlayer-12.0\\shell\\adb.exe",
        ];
        for path in mumu_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
        
        // Check common system paths
        let system_paths = [
            "C:\\platform-tools\\adb.exe",
            "C:\\Android\\platform-tools\\adb.exe",
        ];
        for path in system_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }
    
    // Fallback to PATH
    "adb".to_string()
}

/// Execute ADB command and return output
fn adb_cmd(args: &[&str]) -> Result<String> {
    let adb = get_adb_path();
    let output = create_command(&adb)
        .args(args)
        .output()?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Connect to device
pub fn connect(port: u16) -> Result<String> {
    let addr = format!("127.0.0.1:{}", port);
    adb_cmd(&["connect", &addr])?;
    Ok(format!("已连接 {}", addr))
}

/// Disconnect from device
pub fn disconnect(port: u16) -> Result<()> {
    let addr = format!("127.0.0.1:{}", port);
    adb_cmd(&["disconnect", &addr])?;
    Ok(())
}

/// Check if device is connected
pub fn is_connected(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    let emulator_addr = format!("emulator-{}", port);
    if let Ok(output) = adb_cmd(&["devices"]) {
        (output.contains(&addr) || output.contains(&emulator_addr)) && output.contains("device")
    } else {
        false
    }
}

/// Scan for MuMu emulator instances using mumutool
pub fn scan_mumu_instances() -> Vec<MumuInstance> {
    let mut instances = Vec::new();

    // Try using mumutool first (most reliable)
    #[cfg(target_os = "macos")]
    {
        let mumutool_paths = [
            "/Applications/MuMuPlayer.app/Contents/MacOS/mumutool",
            "/Applications/MuMu Player.app/Contents/MacOS/mumutool",
        ];
        
        for tool_path in mumutool_paths {
            if std::path::Path::new(tool_path).exists() {
                if let Ok(output) = Command::new(tool_path).args(["info", "all"]).output() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // Parse JSON response
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                        if let Some(results) = json.get("return")
                            .and_then(|r| r.get("results"))
                            .and_then(|r| r.as_array())
                        {
                            for item in results {
                                let index = item.get("index").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("MuMu").to_string();
                                let port = item.get("adb_port").and_then(|v| v.as_u64()).unwrap_or(5555) as u16;
                                let state = item.get("state").and_then(|v| v.as_str()).unwrap_or("");
                                let running = state == "running";
                                
                                if running {
                                    instances.push(MumuInstance {
                                        index,
                                        name: format!("127.0.0.1:{}", port),
                                        port,
                                        running,
                                        display_name: format!("{} (端口 {})", name, port),
                                    });
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    // Fallback: check adb devices if mumutool didn't find anything
    if instances.is_empty() {
        if let Ok(output) = adb_cmd(&["devices"]) {
            for line in output.lines() {
                if line.contains("device") && !line.contains("List") && !line.contains("offline") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(addr) = parts.first() {
                        let addr_str = addr.to_string();
                        
                        let (port, display) = if addr_str.starts_with("emulator-") {
                            let port_str = addr_str.replace("emulator-", "");
                            let port = port_str.parse::<u16>().unwrap_or(5554);
                            (port, format!("模拟器 ({})", addr_str))
                        } else if addr_str.contains(':') {
                            let port = addr_str.split(':').last()
                                .and_then(|p| p.parse::<u16>().ok())
                                .unwrap_or(5555);
                            (port, format!("模拟器 (端口 {})", port))
                        } else {
                            continue;
                        };
                        
                        instances.push(MumuInstance {
                            index: instances.len() as i32,
                            name: addr_str,
                            port,
                            running: true,
                            display_name: display,
                        });
                    }
                }
            }
        }
    }

    instances
}

/// Tap at coordinates
pub fn tap(device: &str, x: i32, y: i32) -> Result<()> {
    let adb = get_adb_path();
    create_command(&adb)
        .args(["-s", device, "shell", "input", "tap", &x.to_string(), &y.to_string()])
        .output()?;
    Ok(())
}

/// Press the back button
pub fn press_back(device: &str) -> Result<()> {
    let adb = get_adb_path();
    create_command(&adb)
        .args(["-s", device, "shell", "input", "keyevent", "KEYCODE_BACK"])
        .output()?;
    Ok(())
}

/// Input text into focused field
pub fn input_text(device: &str, text: &str) -> Result<()> {
    let adb = get_adb_path();
    
    // For text with spaces, we need to use a different approach
    // Option 1: Use broadcast with ADB_INPUT_TEXT (requires app support)
    // Option 2: Input character by character for special chars
    // Option 3: Use base64 encoding (complex)
    
    // Simple approach: split by spaces and input each word, then add space
    // But this is slow. Better: escape spaces properly for the shell
    
    // The issue is that `adb shell input text "hello world"` doesn't work
    // because the shell interprets the space. We need to escape it.
    
    // Use single quotes and escape properly for bash -> adb shell
    // Replace space with '\ ' (escaped space in shell)
    let escaped_text = text
        .replace('\\', "\\\\\\\\")  // Escape backslash
        .replace(' ', "\\ ")         // Escape space with backslash
        .replace('"', "\\\"")
        .replace('\'', "'\\''")
        .replace('&', "\\&")
        .replace('|', "\\|")
        .replace(';', "\\;")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('<', "\\<")
        .replace('>', "\\>");
    
    // Use the escaped text directly without quotes
    create_command(&adb)
        .args(["-s", device, "shell", "input", "text", &escaped_text])
        .output()?;
    Ok(())
}

/// Get screen size from device
pub fn get_screen_size(device: &str) -> (i32, i32) {
    let adb = get_adb_path();
    if let Ok(output) = create_command(&adb).args(["-s", device, "shell", "wm", "size"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Parse "Physical size: 1080x1920" or "Physical size: 2160x3840"
        if let Some(size_part) = stdout.split(':').nth(1) {
            let parts: Vec<&str> = size_part.trim().split('x').collect();
            if parts.len() == 2 {
                if let (Ok(w), Ok(h)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                    return (w, h);
                }
            }
        }
    }
    (1080, 1920) // Default
}

/// Page type detected from screenshot
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PageType {
    NewbieList,  // 新人榜页面 (橙色顶部)
    Chat,        // 聊天页面 (白色顶部)
    Unknown,     // 无法识别
}

/// Detect current page using UI Automator
/// Returns PageType based on UI elements found
pub fn detect_page(device: &str) -> PageType {
    // Use UI Automator to detect page
    match crate::ui_automator::dump_ui_hierarchy(device) {
        Ok(xml) => {
            // Check for newbie list title
            if xml.contains("新星用户萌新榜") {
                return PageType::NewbieList;
            }
            // Check for chat page elements
            if xml.contains("com.pico.live:id/tvSend") && xml.contains("com.pico.live:id/etInput") {
                return PageType::Chat;
            }
            PageType::Unknown
        }
        Err(_) => PageType::Unknown,
    }
}

/// Tauri command to detect current page
#[tauri::command]
pub fn cmd_detect_page(state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    let page = detect_page(&device);
    let result = match page {
        PageType::NewbieList => "newbie_list",
        PageType::Chat => "chat",
        PageType::Unknown => "unknown",
    };
    Ok(result.to_string())
}

// Tauri commands
#[tauri::command]
pub fn cmd_adb_connect(port: u16, state: State<'_, AppState>) -> Result<String, String> {
    // First check if device is already connected with emulator format
    let emulator_addr = format!("emulator-{}", port);
    let ip_addr = format!("127.0.0.1:{}", port);
    
    // Check which format the device is using
    let device_addr = if let Ok(output) = adb_cmd(&["devices"]) {
        if output.contains(&emulator_addr) {
            emulator_addr.clone()
        } else {
            // Try to connect with IP format
            let _ = connect(port);
            ip_addr.clone()
        }
    } else {
        let _ = connect(port);
        ip_addr.clone()
    };
    
    // Fetch and cache screen size on connect
    let screen_size = get_screen_size(&device_addr);
    *state.screen_size.lock().unwrap() = Some(screen_size);
    state.add_log(&format!("📐 屏幕尺寸: {}x{}", screen_size.0, screen_size.1));
    
    *state.connected_device.lock().unwrap() = Some(device_addr.clone());
    *state.connected_port.lock().unwrap() = Some(port);
    state.add_log(&format!("✅ ADB 已连接: {}", device_addr));
    Ok(format!("已连接 {}", device_addr))
}

#[tauri::command]
pub fn cmd_adb_disconnect(state: State<'_, AppState>) -> Result<String, String> {
    // Just clear local state, don't actually disconnect ADB
    // ADB can handle multiple connections, and disconnect can cause emulator freeze
    {
        let mut device = state.connected_device.lock().unwrap();
        *device = None;
    }
    {
        let mut port = state.connected_port.lock().unwrap();
        *port = None;
    }
    {
        let mut screen_size = state.screen_size.lock().unwrap();
        *screen_size = None;
    }
    
    state.add_log("🔌 已切换连接状态");
    Ok("已断开".to_string())
}

#[tauri::command]
pub fn cmd_adb_status(state: State<'_, AppState>) -> (bool, Option<u16>) {
    let port = *state.connected_port.lock().unwrap();
    if let Some(p) = port {
        (is_connected(p), Some(p))
    } else {
        (false, None)
    }
}

#[tauri::command]
pub fn cmd_adb_scan_instances() -> Vec<MumuInstance> {
    scan_mumu_instances()
}

#[tauri::command]
pub fn cmd_adb_get_info() -> AdbInfo {
    let is_custom = CUSTOM_ADB_PATH.lock().map(|g| g.is_some()).unwrap_or(false);
    let path = get_adb_path();
    let found = if path == "adb" || path == "adb.exe" {
        // Check if adb is in PATH
        #[cfg(target_os = "windows")]
        {
            Command::new("where")
                .arg("adb")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        #[cfg(not(target_os = "windows"))]
        {
            Command::new("which")
                .arg("adb")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    } else {
        std::path::Path::new(&path).exists()
    };
    
    let bundled_path = get_bundled_adb_path_debug();
    let exe_path = std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string());
    
    AdbInfo { path, found, is_custom, bundled_path, exe_path }
}

#[tauri::command]
pub fn cmd_adb_set_path(path: String, state: State<'_, AppState>) -> Result<String, String> {
    // Validate the path exists
    if !path.is_empty() && !std::path::Path::new(&path).exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if let Ok(mut guard) = CUSTOM_ADB_PATH.lock() {
        if path.is_empty() {
            *guard = None;
            state.add_log("🔧 已重置 ADB 路径为自动检测");
            Ok("已重置为自动检测".to_string())
        } else {
            *guard = Some(path.clone());
            state.add_log(&format!("🔧 已设置 ADB 路径: {}", path));
            Ok(format!("已设置: {}", path))
        }
    } else {
        Err("设置失败".to_string())
    }
}

/// Open a room by room_id using router scheme
pub fn open_room(device: &str, room_id: &str) -> Result<()> {
    let adb = get_adb_path();
    let uri = format!("router://openRoom?room_id={}", room_id);
    create_command(&adb)
        .args(["-s", device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", &uri])
        .output()?;
    Ok(())
}

#[tauri::command]
pub fn cmd_open_room(room_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if room_id.trim().is_empty() {
        return Err("请输入房间 ID".to_string());
    }
    
    open_room(&device, &room_id).map_err(|e| e.to_string())?;
    state.add_log(&format!("跳转房间: {}", room_id));
    Ok(format!("已跳转到房间 {}", room_id))
}

/// Open chat with user by uid using router scheme
pub fn open_chat(device: &str, uid: &str) -> Result<()> {
    let adb = get_adb_path();
    let uri = format!("router://openChat?uid={}", uid);
    create_command(&adb)
        .args(["-s", device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", &uri])
        .output()?;
    Ok(())
}

#[tauri::command]
pub fn cmd_open_chat(uid: String, state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if uid.trim().is_empty() {
        return Err("请输入用户 ID".to_string());
    }
    
    open_chat(&device, &uid).map_err(|e| e.to_string())?;
    state.add_log(&format!("打开聊天: {}", uid));
    Ok(format!("已打开与用户 {} 的聊天", uid))
}

/// Open user homepage by uid using router scheme
pub fn open_user(device: &str, uid: &str) -> Result<()> {
    let adb = get_adb_path();
    let uri = format!("router://openUser?uid={}", uid);
    create_command(&adb)
        .args(["-s", device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", &uri])
        .output()?;
    Ok(())
}

#[tauri::command]
pub fn cmd_open_user(uid: String, state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if uid.trim().is_empty() {
        return Err("请输入用户 ID".to_string());
    }
    
    open_user(&device, &uid).map_err(|e| e.to_string())?;
    state.add_log(&format!("打开用户主页: {}", uid));
    Ok(format!("已打开用户 {} 的主页", uid))
}

/// Open message list page
pub fn open_message_list(device: &str) -> Result<()> {
    let adb = get_adb_path();
    create_command(&adb)
        .args(["-s", device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "router://openMessageList"])
        .output()?;
    Ok(())
}

#[tauri::command]
pub fn cmd_open_message_list(state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    open_message_list(&device).map_err(|e| e.to_string())?;
    state.add_log("打开消息列表");
    Ok("已打开消息列表".to_string())
}

/// Open any router scheme (for debugging)
pub fn open_route(device: &str, route: &str) -> Result<()> {
    let adb = get_adb_path();
    let uri = if route.starts_with("router://") {
        route.to_string()
    } else {
        format!("router://{}", route)
    };
    create_command(&adb)
        .args(["-s", device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", &uri])
        .output()?;
    Ok(())
}

#[tauri::command]
pub fn cmd_open_route(route: String, state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    if route.trim().is_empty() {
        return Err("请输入 route".to_string());
    }
    
    open_route(&device, &route).map_err(|e| e.to_string())?;
    state.add_log(&format!("调试路由: {}", route));
    Ok(format!("已执行: {}", route))
}

/// Navigate to "我的" tab by tapping the bottom-right area
/// Since there's no direct route for this tab, we use coordinate-based tap
pub fn tap_me_tab(device: &str, screen_width: i32, screen_height: i32) -> Result<()> {
    // 4 tabs at bottom: 娱乐(0), 约玩(1), 消息(2), 我的(3)
    // Tab 3 (我的) is at the rightmost position
    // X position: 7/8 of screen width (center of 4th quarter)
    // Y position: near bottom, about 97% of screen height
    let x = screen_width * 7 / 8;
    let y = screen_height * 97 / 100;
    tap(device, x, y)
}

#[tauri::command]
pub fn cmd_tap_me_tab(state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    let screen_size = state.screen_size.lock().unwrap()
        .ok_or("未获取屏幕尺寸，请重新连接")?;
    
    tap_me_tab(&device, screen_size.0, screen_size.1).map_err(|e| e.to_string())?;
    state.add_log(&format!("点击「我的」Tab ({}x{})", screen_size.0, screen_size.1));
    Ok("已点击「我的」Tab".to_string())
}

/// Tap on "新星用户榜" menu item in the "我的" tab
/// Based on screenshot: it's in the menu list, around 78-80% from top
pub fn tap_nova_user_list(device: &str, screen_width: i32, screen_height: i32) -> Result<()> {
    // "新星用户榜" is below 公会中心, 主播任务, 主播工具中心
    // From screenshot analysis: approximately 78% from top
    // X position: center of screen
    let x = screen_width / 2;
    let y = screen_height * 78 / 100;
    tap(device, x, y)
}

#[tauri::command]
pub fn cmd_tap_nova_user_list(state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    let screen_size = state.screen_size.lock().unwrap()
        .ok_or("未获取屏幕尺寸，请重新连接")?;
    
    tap_nova_user_list(&device, screen_size.0, screen_size.1).map_err(|e| e.to_string())?;
    state.add_log("点击「新星用户榜」");
    Ok("已点击「新星用户榜」".to_string())
}

/// Generic tap at coordinates (exposed for debugging)
#[tauri::command]
pub fn cmd_tap_at(x: i32, y: i32, state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    tap(&device, x, y).map_err(|e| e.to_string())?;
    state.add_log(&format!("点击坐标: ({}, {})", x, y));
    Ok(format!("已点击 ({}, {})", x, y))
}

/// Navigate to "我的" tab and then tap "新星用户榜"
/// Flow: openMessageList -> UIAutomator find 我的 -> UIAutomator find 新星用户榜
pub fn navigate_to_nova_list(device: &str, screen_width: i32, screen_height: i32) -> Result<()> {
    use crate::ui_automator;
    
    // Step 1: Open message list to get to a known state
    open_route(device, "openMessageList")?;
    std::thread::sleep(std::time::Duration::from_secs(3));
    
    // Step 2: Find and click "我的" tab using UIAutomator
    match ui_automator::find_me_tab(device) {
        Ok(Some((x, y))) => { tap(device, x, y)?; }
        _ => {
            // Fallback to fixed coordinates
            let x = screen_width * 7 / 8;
            let y = screen_height * 97 / 100;
            tap(device, x, y)?;
        }
    }
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    // Step 3: Find and click "新星用户榜" using UIAutomator
    match ui_automator::find_nova_user_list(device) {
        Ok(Some((x, y))) => { tap(device, x, y)?; }
        _ => {
            // Fallback to fixed coordinates
            let x = screen_width / 2;
            let y = screen_height * 78 / 100;
            tap(device, x, y)?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn cmd_navigate_to_nova_list(state: State<'_, AppState>) -> Result<String, String> {
    let device = state.connected_device.lock().unwrap()
        .clone()
        .ok_or("请先连接 ADB")?;
    
    let screen_size = state.screen_size.lock().unwrap()
        .ok_or("未获取屏幕尺寸，请重新连接")?;
    
    state.add_log("开始导航到「新星用户榜」...");
    navigate_to_nova_list(&device, screen_size.0, screen_size.1).map_err(|e| e.to_string())?;
    state.add_log("已导航到「新星用户榜」");
    Ok("已导航到「新星用户榜」".to_string())
}

#[derive(Serialize)]
pub struct DiagnosticResult {
    pub adb_connected: bool,
    pub device_id: Option<String>,
    pub screen_size: Option<(i32, i32)>,
    pub orientation: Option<i32>,
    pub orientation_ok: bool,
    pub animator_scale: Option<String>,
    pub ui_dump_ok: bool,
    pub ui_dump_error: Option<String>,
    pub page_type: Option<String>,
    pub issues: Vec<String>,
}

#[tauri::command]
pub fn cmd_run_diagnostics(state: State<'_, AppState>) -> DiagnosticResult {
    let mut issues = Vec::new();
    
    // 1. Check ADB connection
    let device = state.connected_device.lock().unwrap().clone();
    let adb_connected = device.is_some();
    if !adb_connected {
        issues.push("未连接 ADB 设备".to_string());
    }
    
    let device_id = device.clone();
    let screen_size = *state.screen_size.lock().unwrap();
    
    if screen_size.is_none() {
        issues.push("未获取屏幕尺寸".to_string());
    }
    
    // Early return if no device
    let Some(ref dev) = device else {
        return DiagnosticResult {
            adb_connected,
            device_id,
            screen_size,
            orientation: None,
            orientation_ok: false,
            animator_scale: None,
            ui_dump_ok: false,
            ui_dump_error: Some("未连接设备".to_string()),
            page_type: None,
            issues,
        };
    };
    
    // 2. Check orientation
    let orientation = get_orientation(dev);
    let orientation_ok = orientation == Some(0);
    if !orientation_ok {
        issues.push(format!("屏幕方向不正确 (当前: {:?}, 需要: 0/竖屏)", orientation));
    }
    
    // 3. Check animator scale (only warn if UI dump failed)
    let animator_scale = get_animator_scale(dev);
    
    // 4. Try UI dump
    let (ui_dump_ok, ui_dump_error) = match crate::ui_automator::dump_ui_hierarchy(dev) {
        Ok(_) => (true, None),
        Err(e) => {
            issues.push(format!("UI Dump 失败: {}", e));
            // Only warn about animator scale if dump failed
            if animator_scale.as_deref() != Some("0.0") && animator_scale.as_deref() != Some("0") {
                issues.push(format!("动画缩放未关闭 (当前: {:?})，可能导致 UI Dump 失败", animator_scale));
            }
            (false, Some(e))
        }
    };
    
    // 5. Detect page type
    let page_type = if ui_dump_ok {
        Some(format!("{:?}", detect_page(dev)))
    } else {
        None
    };
    
    DiagnosticResult {
        adb_connected,
        device_id,
        screen_size,
        orientation,
        orientation_ok,
        animator_scale,
        ui_dump_ok,
        ui_dump_error,
        page_type,
        issues,
    }
}

fn get_orientation(device: &str) -> Option<i32> {
    let adb = get_adb_path();
    let output = create_command(&adb)
        .args(["-s", device, "shell", "dumpsys", "input"])
        .output()
        .ok()?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("SurfaceOrientation:") {
            return line.split(':').nth(1)?.trim().parse().ok();
        }
    }
    None
}

fn get_animator_scale(device: &str) -> Option<String> {
    let adb = get_adb_path();
    let output = create_command(&adb)
        .args(["-s", device, "shell", "settings", "get", "global", "animator_duration_scale"])
        .output()
        .ok()?;
    
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
