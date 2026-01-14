//! Test script for send_message functionality
//! 
//! Run with: cargo run --bin test_send -- [device] [message]
//! Example: cargo run --bin test_send -- 127.0.0.1:16384 "Hello World"
//! Example: cargo run --bin test_send -- 127.0.0.1:16384 --photo 3
//! Example: cargo run --bin test_send -- 127.0.0.1:16384 --batch 2

use std::process::Command;
use std::thread;
use std::time::Duration;

/// Get ADB path - auto detect from common locations
fn get_adb_path() -> String {
    #[cfg(target_os = "macos")]
    {
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
        
        let mumu_paths = [
            "/Applications/MuMuPlayer.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
            "/Applications/MuMu Player.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
        ];
        for path in mumu_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        let paths = [
            "C:\\Program Files\\Netease\\MuMuPlayerGlobal-12.0\\shell\\adb.exe",
            "C:\\Program Files\\Netease\\MuMuPlayer-12.0\\shell\\adb.exe",
        ];
        for path in paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }
    
    "adb".to_string()
}

/// Execute ADB command and return output
fn adb_cmd(device: &str, args: &[&str]) -> Result<String, String> {
    let adb = get_adb_path();
    let mut cmd_args = vec!["-s", device];
    cmd_args.extend(args);
    
    let output = Command::new(&adb)
        .args(&cmd_args)
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ADB command failed: {}", stderr));
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Check if device is connected
fn check_device(device: &str) -> bool {
    let adb = get_adb_path();
    if let Ok(output) = Command::new(&adb).args(["devices"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains(device) && stdout.contains("device")
    } else {
        false
    }
}

/// Tap element by resource-id
fn tap_by_id(device: &str, resource_id: &str) -> Result<bool, String> {
    let adb = get_adb_path();
    
    let script = format!(
        r#"
        {adb} -s {device} shell uiautomator dump /sdcard/ui.xml 2>/dev/null
        XML=$({adb} -s {device} shell cat /sdcard/ui.xml 2>/dev/null)
        BOUNDS=$(echo "$XML" | grep -o 'resource-id="{resource_id}"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1)
        if [ -z "$BOUNDS" ]; then
            echo "NOT_FOUND"
            exit 1
        fi
        COORDS=$(echo "$BOUNDS" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | sed 's/bounds="//;s/"$//')
        X1=$(echo "$COORDS" | sed 's/\[\([0-9]*\),.*/\1/')
        Y1=$(echo "$COORDS" | sed 's/\[[0-9]*,\([0-9]*\)\].*/\1/')
        X2=$(echo "$COORDS" | sed 's/.*\]\[\([0-9]*\),.*/\1/')
        Y2=$(echo "$COORDS" | sed 's/.*,\([0-9]*\)\]$/\1/')
        CX=$(( (X1 + X2) / 2 ))
        CY=$(( (Y1 + Y2) / 2 ))
        echo "COORDS:$CX,$CY"
        {adb} -s {device} shell input tap $CX $CY
        "#,
        adb = adb,
        device = device,
        resource_id = resource_id
    );
    
    let output = Command::new("bash")
        .args(["-c", &script])
        .output()
        .map_err(|e| format!("Failed to execute script: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.contains("NOT_FOUND") {
        return Ok(false);
    }
    
    Ok(output.status.success())
}

/// Input text into focused field
fn input_text(device: &str, text: &str) -> Result<(), String> {
    let adb = get_adb_path();
    let script = format!("{} -s {} shell input text \"{}\"", adb, device, text);
    Command::new("bash")
        .args(["-c", &script])
        .output()
        .map_err(|e| format!("Failed to input text: {}", e))?;
    Ok(())
}

/// Tap at coordinates
fn tap(device: &str, x: i32, y: i32) -> Result<(), String> {
    let adb = get_adb_path();
    Command::new(&adb)
        .args(["-s", device, "shell", "input", "tap", &x.to_string(), &y.to_string()])
        .output()
        .map_err(|e| format!("Failed to tap: {}", e))?;
    Ok(())
}

/// Get the Nth clickable photo element from the document picker (0-indexed)
fn tap_photo_in_picker(device: &str, index: usize) -> Result<bool, String> {
    let adb = get_adb_path();
    
    // Dump UI hierarchy
    let _ = Command::new(&adb)
        .args(["-s", device, "shell", "uiautomator", "dump", "/sdcard/ui.xml"])
        .output();
    
    // Read XML
    let output = Command::new(&adb)
        .args(["-s", device, "shell", "cat", "/sdcard/ui.xml"])
        .output()
        .map_err(|e| format!("Failed to read UI: {}", e))?;
    
    let xml = String::from_utf8_lossy(&output.stdout);
    
    // Look for thumbnail elements in documentsui
    let mut photo_coords: Vec<(i32, i32)> = Vec::new();
    
    // Find all icon_thumb elements (the actual photo thumbnails)
    for segment in xml.split('<') {
        if segment.contains("com.android.documentsui:id/icon_thumb") || 
           segment.contains("com.android.documentsui:id/thumbnail") {
            if let Some(bounds_start) = segment.find("bounds=\"[") {
                let bounds_str = &segment[bounds_start + 8..];
                if let Some(bounds_end) = bounds_str.find('"') {
                    let bounds = &bounds_str[..bounds_end];
                    let coords: Vec<i32> = bounds
                        .replace('[', " ")
                        .replace(']', " ")
                        .replace(',', " ")
                        .split_whitespace()
                        .filter_map(|s| s.parse().ok())
                        .collect();
                    
                    if coords.len() >= 4 {
                        let cx = (coords[0] + coords[2]) / 2;
                        let cy = (coords[1] + coords[3]) / 2;
                        // Avoid duplicates (thumbnail and icon_thumb have same bounds)
                        if !photo_coords.contains(&(cx, cy)) {
                            photo_coords.push((cx, cy));
                        }
                    }
                }
            }
        }
    }
    
    println!("    Found {} photos in picker", photo_coords.len());
    
    if let Some(&(x, y)) = photo_coords.get(index) {
        println!("    Tapping photo {} at ({}, {})", index + 1, x, y);
        tap(device, x, y)?;
        return Ok(true);
    }
    
    Err(format!("Photo {} not found (only {} photos available)", index + 1, photo_coords.len()))
}

/// Send a text message - the main function being tested
fn send_message(device: &str, message: &str) -> Result<(), String> {
    println!("📝 Sending message: {}", message);
    
    // Step 1: Click input field
    print!("  1. Clicking input field... ");
    let clicked = tap_by_id(device, "com.pico.live:id/etInput")?;
    if !clicked {
        println!("❌ FAILED");
        return Err("Could not find input field (com.pico.live:id/etInput)".to_string());
    }
    println!("✅");
    thread::sleep(Duration::from_millis(300));
    
    // Step 2: Input text
    print!("  2. Inputting text... ");
    input_text(device, message)?;
    println!("✅");
    thread::sleep(Duration::from_millis(400));
    
    // Step 3: Click send button
    print!("  3. Clicking send button... ");
    let sent = tap_by_id(device, "com.pico.live:id/tvSend")?;
    if !sent {
        println!("❌ FAILED");
        return Err("Could not find send button (com.pico.live:id/tvSend)".to_string());
    }
    println!("✅");
    thread::sleep(Duration::from_millis(500));
    
    println!("✅ Message sent successfully!");
    Ok(())
}

/// Send a photo by index (1-based) - the photo function being tested
fn send_photo(device: &str, index: i32) -> Result<(), String> {
    println!("📷 Sending photo #{}", index);
    
    // Step 1: Click photo button
    print!("  1. Clicking photo button... ");
    let clicked = tap_by_id(device, "com.pico.live:id/iv_photo")?;
    if !clicked {
        println!("❌ FAILED");
        return Err("Could not find photo button (com.pico.live:id/iv_photo)".to_string());
    }
    println!("✅");
    thread::sleep(Duration::from_millis(1500)); // Wait for picker to open
    
    // Step 2: Select photo from picker using UI detection
    print!("  2. Selecting photo #{}... ", index);
    let photo_index = (index - 1) as usize; // Convert to 0-indexed
    
    match tap_photo_in_picker(device, photo_index) {
        Ok(true) => {
            println!("✅");
        }
        Ok(false) => {
            println!("❌ FAILED");
            return Err(format!("Photo #{} not found in picker", index));
        }
        Err(e) => {
            println!("❌ FAILED");
            return Err(e);
        }
    }
    
    thread::sleep(Duration::from_millis(1000));
    
    println!("✅ Photo #{} sent successfully!", index);
    thread::sleep(Duration::from_millis(2000));
    Ok(())
}

/// Test result structure
struct TestResult {
    name: String,
    passed: bool,
    message: String,
}

impl TestResult {
    fn pass(name: &str, msg: &str) -> Self {
        Self { name: name.to_string(), passed: true, message: msg.to_string() }
    }
    fn fail(name: &str, msg: &str) -> Self {
        Self { name: name.to_string(), passed: false, message: msg.to_string() }
    }
}

/// Get screen size
fn get_screen_size(device: &str) -> (i32, i32) {
    let adb = get_adb_path();
    if let Ok(output) = Command::new(&adb).args(["-s", device, "shell", "wm", "size"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(size_part) = stdout.split(':').nth(1) {
            let parts: Vec<&str> = size_part.trim().split('x').collect();
            if parts.len() == 2 {
                if let (Ok(w), Ok(h)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                    return (w, h);
                }
            }
        }
    }
    (2160, 3840) // Default
}

/// Click the first "撩" button on the newbie list
fn click_liao_button(device: &str) -> Result<(), String> {
    let (screen_w, screen_h) = get_screen_size(device);
    println!("    Screen size: {}x{}", screen_w, screen_h);
    
    // Base coordinates from 2160x3840 screen (tested with mobile tool)
    let base_x = 1692;
    let base_y = 862;
    
    // Scale to current screen
    let scale_x = screen_w as f64 / 2160.0;
    let scale_y = screen_h as f64 / 3840.0;
    
    let btn_x = (base_x as f64 * scale_x) as i32;
    let btn_y = (base_y as f64 * scale_y) as i32;
    
    println!("    Clicking 撩 button at ({}, {})", btn_x, btn_y);
    tap(device, btn_x, btn_y)?;
    Ok(())
}

/// Click the back button (top-left corner)
fn click_back_button(device: &str) -> Result<(), String> {
    let (screen_w, screen_h) = get_screen_size(device);
    
    // Base coordinates from 2160x3840 screen (tested with mobile tool)
    let base_x = 72;
    let base_y = 216;
    
    // Scale to current screen
    let scale_x = screen_w as f64 / 2160.0;
    let scale_y = screen_h as f64 / 3840.0;
    
    let btn_x = (base_x as f64 * scale_x) as i32;
    let btn_y = (base_y as f64 * scale_y) as i32;
    
    println!("    Clicking back button at ({}, {})", btn_x, btn_y);
    tap(device, btn_x, btn_y)?;
    Ok(())
}

/// Run batch send test: click user -> send message -> back -> repeat
fn run_batch_test(device: &str, count: usize, message: &str) -> Result<(), String> {
    println!("🚀 Starting batch test: {} users", count);
    println!("📋 Make sure you're on the newbie list screen!");
    println!();
    
    for i in 0..count {
        println!("━━━ User {}/{} ━━━", i + 1, count);
        
        // Step 1: Click 撩 button
        print!("  1. Clicking 撩 button... ");
        click_liao_button(device)?;
        println!("✅");
        thread::sleep(Duration::from_millis(2500));
        
        // Step 2: Send message
        print!("  2. Sending message... ");
        match send_message(device, message) {
            Ok(()) => println!("✅"),
            Err(e) => {
                println!("❌ {}", e);
                // Try to go back anyway
                let _ = click_back_button(device);
                thread::sleep(Duration::from_millis(2000));
                continue;
            }
        }
        
        // Step 3: Go back
        print!("  3. Going back... ");
        thread::sleep(Duration::from_millis(500));
        click_back_button(device)?;
        println!("✅");
        thread::sleep(Duration::from_millis(2000));
        
        println!("  ✅ User {} done!", i + 1);
        println!();
        
        // Wait before next user
        if i < count - 1 {
            println!("  ⏳ Waiting 3 seconds...");
            thread::sleep(Duration::from_secs(3));
        }
    }
    
    println!("🎉 Batch test completed! Sent to {} users", count);
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    
    let device = args.get(1).map(|s| s.as_str()).unwrap_or("127.0.0.1:16384");
    
    // Check for --photo flag
    let photo_mode = args.iter().any(|a| a == "--photo");
    let photo_index: Option<i32> = if photo_mode {
        args.iter()
            .position(|a| a == "--photo")
            .and_then(|i| args.get(i + 1))
            .and_then(|s| s.parse().ok())
    } else {
        None
    };
    
    // Check for --batch flag
    let batch_mode = args.iter().any(|a| a == "--batch");
    let batch_count: Option<usize> = if batch_mode {
        args.iter()
            .position(|a| a == "--batch")
            .and_then(|i| args.get(i + 1))
            .and_then(|s| s.parse().ok())
    } else {
        None
    };
    
    let default_msg = format!("test_{}", chrono::Local::now().format("%H%M%S"));
    let test_message = if !photo_mode && !batch_mode {
        args.get(2).map(|s| s.as_str()).unwrap_or(&default_msg)
    } else {
        &default_msg
    };
    
    // If batch mode, run batch test directly
    if batch_mode {
        let count = batch_count.unwrap_or(2);
        println!("╔════════════════════════════════════════════════════════════╗");
        println!("║           Batch Send Test (Rust)                           ║");
        println!("╚════════════════════════════════════════════════════════════╝");
        println!();
        println!("Device: {}", device);
        println!("Count: {}", count);
        println!("Message: {}", test_message);
        println!();
        
        match run_batch_test(device, count, test_message) {
            Ok(()) => std::process::exit(0),
            Err(e) => {
                println!("❌ Batch test failed: {}", e);
                std::process::exit(1);
            }
        }
    }
    
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║           Send Message Test Script (Rust)                  ║");
    println!("╚════════════════════════════════════════════════════════════╝");
    println!();
    
    let mut results: Vec<TestResult> = Vec::new();
    
    // Test 1: ADB Path Detection
    println!("━━━ Test 1: ADB Path Detection ━━━");
    let adb_path = get_adb_path();
    let adb_exists = std::path::Path::new(&adb_path).exists() || adb_path == "adb";
    if adb_exists {
        println!("  ADB path: {}", adb_path);
        results.push(TestResult::pass("ADB Path", &format!("Found at {}", adb_path)));
    } else {
        results.push(TestResult::fail("ADB Path", "ADB not found"));
    }
    println!();
    
    // Test 2: Device Connection
    println!("━━━ Test 2: Device Connection ━━━");
    println!("  Target device: {}", device);
    let connected = check_device(device);
    if connected {
        println!("  Status: ✅ Connected");
        results.push(TestResult::pass("Device Connection", &format!("{} is connected", device)));
    } else {
        println!("  Status: ❌ Not connected");
        println!("  Attempting to connect...");
        let adb = get_adb_path();
        let _ = Command::new(&adb).args(["connect", device]).output();
        thread::sleep(Duration::from_millis(500));
        
        if check_device(device) {
            println!("  Status: ✅ Connected after retry");
            results.push(TestResult::pass("Device Connection", "Connected after retry"));
        } else {
            println!("  Status: ❌ Failed to connect");
            results.push(TestResult::fail("Device Connection", "Could not connect to device"));
        }
    }
    println!();
    
    // Test 3: UI Element Detection
    println!("━━━ Test 3: UI Element Detection ━━━");
    if check_device(device) {
        // Dump UI and check for elements
        let adb = get_adb_path();
        let _ = Command::new(&adb).args(["-s", device, "shell", "uiautomator", "dump", "/sdcard/ui.xml"]).output();
        
        if let Ok(xml) = adb_cmd(device, &["shell", "cat", "/sdcard/ui.xml"]) {
            let has_input = xml.contains("com.pico.live:id/etInput");
            let has_send = xml.contains("com.pico.live:id/tvSend");
            
            println!("  Input field (etInput): {}", if has_input { "✅ Found" } else { "❌ Not found" });
            println!("  Send button (tvSend): {}", if has_send { "✅ Found" } else { "❌ Not found" });
            
            if has_input && has_send {
                results.push(TestResult::pass("UI Elements", "All required elements found"));
            } else {
                results.push(TestResult::fail("UI Elements", "Some elements missing - ensure you're on the chat screen"));
            }
        } else {
            results.push(TestResult::fail("UI Elements", "Could not dump UI hierarchy"));
        }
    } else {
        results.push(TestResult::fail("UI Elements", "Skipped - device not connected"));
    }
    println!();
    
    // Test 4: Send Message or Photo
    if photo_mode {
        println!("━━━ Test 4: Send Photo ━━━");
        if check_device(device) {
            let idx = photo_index.unwrap_or(1);
            match send_photo(device, idx) {
                Ok(()) => {
                    results.push(TestResult::pass("Send Photo", &format!("Sent photo #{}", idx)));
                }
                Err(e) => {
                    println!("  Error: {}", e);
                    results.push(TestResult::fail("Send Photo", &e));
                }
            }
        } else {
            results.push(TestResult::fail("Send Photo", "Skipped - device not connected"));
        }
    } else {
        println!("━━━ Test 4: Send Message ━━━");
        if check_device(device) {
            match send_message(device, test_message) {
                Ok(()) => {
                    results.push(TestResult::pass("Send Message", &format!("Sent: {}", test_message)));
                }
                Err(e) => {
                    println!("  Error: {}", e);
                    results.push(TestResult::fail("Send Message", &e));
                }
            }
        } else {
            results.push(TestResult::fail("Send Message", "Skipped - device not connected"));
        }
    }
    println!();
    
    // Summary
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║                      Test Summary                          ║");
    println!("╚════════════════════════════════════════════════════════════╝");
    
    let passed = results.iter().filter(|r| r.passed).count();
    let total = results.len();
    
    for result in &results {
        let status = if result.passed { "✅ PASS" } else { "❌ FAIL" };
        println!("  {} - {}: {}", status, result.name, result.message);
    }
    
    println!();
    println!("  Result: {}/{} tests passed", passed, total);
    
    if passed == total {
        println!("  🎉 All tests passed!");
        std::process::exit(0);
    } else {
        println!("  ⚠️  Some tests failed");
        std::process::exit(1);
    }
}
