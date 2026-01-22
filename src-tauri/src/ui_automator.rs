//! UI Automator module for finding UI elements on Android devices

// Allow unused functions - they are public API for future use in auto_message
#![allow(dead_code)]

use crate::adb;
use std::process::Command;
use std::time::Instant;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Create a Command with hidden window on Windows
fn create_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd
}

/// Bounds of a UI element [left, top, right, bottom]
#[derive(Debug, Clone)]
pub struct Bounds {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Bounds {
    /// Get center point of the bounds
    pub fn center(&self) -> (i32, i32) {
        ((self.left + self.right) / 2, (self.top + self.bottom) / 2)
    }
}

/// UI Element found via uiautomator
#[derive(Debug, Clone)]
pub struct UiElement {
    pub text: String,
    pub resource_id: String,
    pub class: String,
    pub bounds: Bounds,
    pub clickable: bool,
    pub enabled: bool,
}

/// Parse bounds string like "[1944,3506][2056,3582]" into Bounds struct
fn parse_bounds(bounds_str: &str) -> Option<Bounds> {
    // Format: [left,top][right,bottom]
    let parts: Vec<&str> = bounds_str
        .trim_matches(|c| c == '[' || c == ']')
        .split("][")
        .collect();
    
    if parts.len() != 2 {
        return None;
    }
    
    let left_top: Vec<i32> = parts[0].split(',').filter_map(|s| s.parse().ok()).collect();
    let right_bottom: Vec<i32> = parts[1].split(',').filter_map(|s| s.parse().ok()).collect();
    
    if left_top.len() != 2 || right_bottom.len() != 2 {
        return None;
    }
    
    Some(Bounds {
        left: left_top[0],
        top: left_top[1],
        right: right_bottom[0],
        bottom: right_bottom[1],
    })
}

/// Extract attribute value from XML node string
fn get_attr(node: &str, attr: &str) -> String {
    let pattern = format!("{}=\"", attr);
    if let Some(start) = node.find(&pattern) {
        let value_start = start + pattern.len();
        if let Some(end) = node[value_start..].find('"') {
            return node[value_start..value_start + end].to_string();
        }
    }
    String::new()
}

/// Check if device is in portrait orientation (SurfaceOrientation: 0)
/// On Windows, dumpsys input returns two SurfaceOrientation values - we need the first one (system)
fn check_orientation(device: &str) -> Result<(), String> {
    let adb_path = adb::get_adb_path_public();
    let output = create_command(&adb_path)
        .args(["-s", device, "shell", "dumpsys", "input"])
        .output()
        .map_err(|e| format!("Failed to run dumpsys: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Find first SurfaceOrientation value (system orientation)
    for line in stdout.lines() {
        if line.contains("SurfaceOrientation:") {
            let orientation = line
                .split(':')
                .nth(1)
                .and_then(|s| s.trim().parse::<i32>().ok())
                .unwrap_or(0);
            
            if orientation != 0 {
                return Err("屏幕方向不正确，请将模拟器旋转为竖屏模式".to_string());
            }
            return Ok(()); // Only check first occurrence
        }
    }
    
    Ok(()) // If not found, assume portrait
}

/// Dump UI hierarchy and return raw XML
/// 
/// IMPORTANT: uiautomator dump fails when animations are running.
/// We disable animations first with: `adb shell settings put global animator_duration_scale 0`
/// and restore it to 1 after the dump completes.
pub fn dump_ui_hierarchy(device: &str) -> Result<String, String> {
    // Check orientation first
    check_orientation(device)?;
    
    let start = Instant::now();
    let adb_path = adb::get_adb_path_public();
    
    // Disable animations - uiautomator dump fails when animations are running
    let _ = create_command(&adb_path)
        .args(["-s", device, "shell", "settings", "put", "global", "animator_duration_scale", "0"])
        .output();
    
    // Use exec-out with /dev/tty to get XML directly to stdout
    // This is more reliable than dumping to file and reading it back
    let result = create_command(&adb_path)
        .args(["-s", device, "exec-out", "uiautomator", "dump", "/dev/tty"])
        .output()
        .map_err(|e| format!("Failed to dump UI: {}", e))?;
    
    // Restore animations
    let _ = create_command(&adb_path)
        .args(["-s", device, "shell", "settings", "put", "global", "animator_duration_scale", "1"])
        .output();
    
    let dump_time = start.elapsed();
    eprintln!("[UIAutomator] Dump time: {:?}", dump_time);
    
    let output = String::from_utf8_lossy(&result.stdout).to_string();
    
    // The output contains XML followed by "UI hierchary dumped to: /dev/tty"
    // Extract just the XML part
    let xml = if let Some(pos) = output.find("UI hierchary dumped to:") {
        output[..pos].trim().to_string()
    } else if let Some(pos) = output.find("UI hierarchy dumped to:") {
        // Handle possible spelling variation
        output[..pos].trim().to_string()
    } else {
        // If no marker found, check if it looks like XML
        if output.starts_with("<?xml") {
            output.trim().to_string()
        } else {
            return Err(format!("UI dump failed or returned unexpected output: {}", 
                &output[..output.len().min(200)]));
        }
    };
    
    if xml.is_empty() || !xml.starts_with("<?xml") {
        return Err(format!("UI dump returned invalid XML: {}", &xml[..xml.len().min(200)]));
    }
    
    eprintln!("[UIAutomator] XML length: {} bytes", xml.len());
    
    Ok(xml)
}

/// Find element by resource-id
pub fn find_by_resource_id(device: &str, resource_id: &str) -> Result<Option<UiElement>, String> {
    let xml = dump_ui_hierarchy(device)?;
    Ok(find_element_in_xml(&xml, |node| {
        get_attr(node, "resource-id") == resource_id
    }))
}

/// Find element by text content
pub fn find_by_text(device: &str, text: &str) -> Result<Option<UiElement>, String> {
    let xml = dump_ui_hierarchy(device)?;
    Ok(find_element_in_xml(&xml, |node| {
        get_attr(node, "text") == text
    }))
}

/// Find element by text containing substring
pub fn find_by_text_contains(device: &str, text: &str) -> Result<Option<UiElement>, String> {
    let xml = dump_ui_hierarchy(device)?;
    Ok(find_element_in_xml(&xml, |node| {
        get_attr(node, "text").contains(text)
    }))
}

/// Find element in XML using a predicate
fn find_element_in_xml<F>(xml: &str, predicate: F) -> Option<UiElement>
where
    F: Fn(&str) -> bool,
{
    // Simple XML parsing - find <node ... /> elements
    for node in xml.split("<node ").skip(1) {
        let node_end = node.find("/>").or_else(|| node.find(">"))?;
        let node_str = &node[..node_end];
        
        if predicate(node_str) {
            let bounds_str = get_attr(node_str, "bounds");
            let bounds = parse_bounds(&bounds_str)?;
            
            return Some(UiElement {
                text: get_attr(node_str, "text"),
                resource_id: get_attr(node_str, "resource-id"),
                class: get_attr(node_str, "class"),
                bounds,
                clickable: get_attr(node_str, "clickable") == "true",
                enabled: get_attr(node_str, "enabled") == "true",
            });
        }
    }
    None
}

/// Find element by resource-id in pre-dumped XML
pub fn find_by_resource_id_in_xml(xml: &str, resource_id: &str) -> Option<UiElement> {
    find_element_in_xml(xml, |node| {
        get_attr(node, "resource-id") == resource_id
    })
}

/// Find element by text in pre-dumped XML
pub fn find_by_text_in_xml(xml: &str, text: &str) -> Option<UiElement> {
    find_element_in_xml(xml, |node| {
        get_attr(node, "text") == text
    })
}

/// Find the "发送" (Send) button - dumps UI once and searches
pub fn find_send_button(device: &str) -> Result<Option<(i32, i32)>, String> {
    let start = Instant::now();
    let xml = dump_ui_hierarchy(device)?;
    
    // Try by resource-id first (most reliable)
    if let Some(element) = find_by_resource_id_in_xml(&xml, "com.pico.live:id/tvSend") {
        let (x, y) = element.bounds.center();
        eprintln!("[UIAutomator] Found send button by resource-id at ({}, {}), enabled={}", x, y, element.enabled);
        eprintln!("[UIAutomator] Total find time: {:?}", start.elapsed());
        return Ok(Some((x, y)));
    }
    
    // Fallback: try by text
    if let Some(element) = find_by_text_in_xml(&xml, "发送") {
        let (x, y) = element.bounds.center();
        eprintln!("[UIAutomator] Found send button by text at ({}, {})", x, y);
        eprintln!("[UIAutomator] Total find time: {:?}", start.elapsed());
        return Ok(Some((x, y)));
    }
    
    eprintln!("[UIAutomator] Send button not found");
    Ok(None)
}

/// Find the "撩" (Liao/Chat) button on newbie list - returns first visible one
pub fn find_liao_button(device: &str) -> Result<Option<(i32, i32)>, String> {
    let xml = dump_ui_hierarchy(device)?;
    find_liao_button_in_xml(&xml)
}

/// Find the first visible "撩" button in pre-dumped XML
/// Skips buttons with bounds [0,0][0,0] (invisible/cached items)
pub fn find_liao_button_in_xml(xml: &str) -> Result<Option<(i32, i32)>, String> {
    // Find all "撩" buttons and return the first one with valid bounds
    for node in xml.split("<node ").skip(1) {
        let node_end = match node.find("/>").or_else(|| node.find(">")) {
            Some(end) => end,
            None => continue,
        };
        let node_str = &node[..node_end];
        
        // Check if this is a "撩" button
        if get_attr(node_str, "text") == "撩" {
            let bounds_str = get_attr(node_str, "bounds");
            
            // Skip invisible items with bounds [0,0][0,0]
            if bounds_str == "[0,0][0,0]" {
                continue;
            }
            
            if let Some(bounds) = parse_bounds(&bounds_str) {
                let (x, y) = bounds.center();
                eprintln!("[UIAutomator] Found 撩 button at ({}, {})", x, y);
                return Ok(Some((x, y)));
            }
        }
    }
    
    eprintln!("[UIAutomator] 撩 button not found");
    Ok(None)
}

/// Check if currently on a chat page
pub fn is_on_chat_page(device: &str) -> Result<bool, String> {
    let xml = dump_ui_hierarchy(device)?;
    
    // Check for chat-specific elements
    let has_input = xml.contains("com.pico.live:id/etInput");
    let has_send = xml.contains("com.pico.live:id/tvSend");
    let has_chat_view = xml.contains("com.pico.live:id/input_chat_view");
    
    Ok(has_input && has_send && has_chat_view)
}

/// Check if on newbie/nova list page by looking for "新星用户萌新榜" text
pub fn is_on_newbie_list(device: &str) -> Result<bool, String> {
    let xml = dump_ui_hierarchy(device)?;
    is_on_newbie_list_from_xml(&xml)
}

/// Check if on newbie list from pre-dumped XML
pub fn is_on_newbie_list_from_xml(xml: &str) -> Result<bool, String> {
    // Look for the specific title text "新星用户萌新榜"
    Ok(xml.contains("新星用户萌新榜"))
}

/// Find "我的" tab button by text
pub fn find_me_tab(device: &str) -> Result<Option<(i32, i32)>, String> {
    let xml = dump_ui_hierarchy(device)?;
    find_me_tab_in_xml(&xml)
}

/// Find "我的" tab in pre-dumped XML
pub fn find_me_tab_in_xml(xml: &str) -> Result<Option<(i32, i32)>, String> {
    // Look for text "我的" which is the tab label
    if let Some(element) = find_by_text_in_xml(xml, "我的") {
        let (x, y) = element.bounds.center();
        eprintln!("[UIAutomator] Found 我的 tab at ({}, {})", x, y);
        return Ok(Some((x, y)));
    }
    eprintln!("[UIAutomator] 我的 tab not found");
    Ok(None)
}

/// Find "新星用户榜" menu item by text
pub fn find_nova_user_list(device: &str) -> Result<Option<(i32, i32)>, String> {
    let xml = dump_ui_hierarchy(device)?;
    find_nova_user_list_in_xml(&xml)
}

/// Find "新星用户榜" in pre-dumped XML
pub fn find_nova_user_list_in_xml(xml: &str) -> Result<Option<(i32, i32)>, String> {
    // Look for text "新星用户榜"
    if let Some(element) = find_by_text_in_xml(xml, "新星用户榜") {
        let (x, y) = element.bounds.center();
        eprintln!("[UIAutomator] Found 新星用户榜 at ({}, {})", x, y);
        return Ok(Some((x, y)));
    }
    eprintln!("[UIAutomator] 新星用户榜 not found");
    Ok(None)
}

// Tauri commands

/// Tauri command: Test UI Automator - find send button location
#[tauri::command]
pub fn cmd_test_ui_automator(state: tauri::State<'_, crate::AppState>) -> Result<String, String> {
    let device = {
        let guard = state.connected_device.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    
    let device = device.ok_or("No device connected")?;
    
    let start = Instant::now();
    let xml = dump_ui_hierarchy(&device)?;
    
    // Find send button
    if let Some(element) = find_element_in_xml(&xml, |node| {
        get_attr(node, "resource-id") == "com.pico.live:id/tvSend"
    }) {
        let (x, y) = element.bounds.center();
        Ok(format!(
            "发送按钮位置: ({}, {})\n耗时: {:?}",
            x, y, start.elapsed()
        ))
    } else {
        Ok(format!(
            "未找到发送按钮\n耗时: {:?}",
            start.elapsed()
        ))
    }
}
