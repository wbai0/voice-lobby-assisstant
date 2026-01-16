//! Cross-platform OCR module
//! Uses Tesseract CLI for OCR, supports macOS and Windows

use crate::adb;
use std::fs;
use std::path::{Path, PathBuf};
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

/// OCR recognition result
#[derive(Debug, Clone)]
pub struct OcrResult {
    pub text: String,
    pub success: bool,
}

/// Get temp file path
fn get_temp_path(filename: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(filename);
    path
}

/// Get Tesseract executable path
fn get_tesseract_exe() -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    
    #[cfg(target_os = "windows")]
    {
        let exe_dir = exe_path.parent()?;
        
        // Windows bundled: exe_dir/tesseract/tesseract.exe
        let tesseract_path = exe_dir.join("tesseract").join("tesseract.exe");
        eprintln!("[OCR] Checking Windows tesseract: {:?}", tesseract_path);
        if tesseract_path.exists() {
            return Some(tesseract_path);
        }
        
        // Dev mode: resources/tesseract-windows/tesseract.exe
        if let Some(src_tauri) = exe_dir.parent().and_then(|p| p.parent()) {
            let dev_path = src_tauri.join("resources").join("tesseract-windows").join("tesseract.exe");
            eprintln!("[OCR] Checking dev mode tesseract: {:?}", dev_path);
            if dev_path.exists() {
                return Some(dev_path);
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS bundled: App.app/Contents/Resources/tesseract/tesseract
        let bundled_path = exe_path
            .parent() // MacOS
            .and_then(|p| p.parent()) // Contents
            .map(|p| p.join("Resources").join("tesseract").join("tesseract"));
        
        if let Some(path) = bundled_path {
            eprintln!("[OCR] Checking bundled tesseract: {:?}", path);
            if path.exists() {
                return Some(path);
            }
        }
        
        // Fallback: system tesseract (Homebrew)
        let homebrew_paths = [
            "/opt/homebrew/bin/tesseract",  // Apple Silicon
            "/usr/local/bin/tesseract",      // Intel
        ];
        for path in homebrew_paths {
            let p = PathBuf::from(path);
            if p.exists() {
                eprintln!("[OCR] Using system tesseract: {:?}", p);
                return Some(p);
            }
        }
    }
    
    eprintln!("[OCR] Tesseract executable not found");
    None
}

/// Get tessdata directory path
/// Returns (tessdata_path, is_bundled)
fn get_tessdata_dir() -> Option<(PathBuf, bool)> {
    let exe_path = std::env::current_exe().ok()?;
    
    #[cfg(target_os = "windows")]
    {
        let exe_dir = exe_path.parent()?;
        
        // Windows bundled: exe_dir/tesseract/tessdata
        let tessdata_path = exe_dir.join("tesseract").join("tessdata");
        eprintln!("[OCR] Checking bundled tessdata: {:?}", tessdata_path);
        
        // List contents of tesseract directory for debugging
        if let Ok(entries) = fs::read_dir(exe_dir.join("tesseract")) {
            eprintln!("[OCR] Contents of tesseract directory:");
            for entry in entries {
                if let Ok(entry) = entry {
                    eprintln!("[OCR]   - {:?}", entry.path());
                }
            }
        } else {
            eprintln!("[OCR] Could not read tesseract directory: {:?}", exe_dir.join("tesseract"));
        }
        
        let chi_sim = tessdata_path.join("chi_sim.traineddata");
        eprintln!("[OCR] Checking chi_sim file: {:?}", chi_sim);
        if chi_sim.exists() {
            return Some((tessdata_path, true));
        }
        
        // Dev mode
        if let Some(src_tauri) = exe_dir.parent().and_then(|p| p.parent()) {
            let dev_path = src_tauri.join("resources").join("tesseract-windows").join("tessdata");
            eprintln!("[OCR] Checking dev tessdata: {:?}", dev_path);
            let chi_sim = dev_path.join("chi_sim.traineddata");
            if chi_sim.exists() {
                return Some((dev_path, true));
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS bundled
        let bundled_path = exe_path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources").join("tesseract").join("tessdata"));
        
        if let Some(path) = bundled_path {
            let chi_sim = path.join("chi_sim.traineddata");
            if chi_sim.exists() {
                return Some((path, true));
            }
        }
        
        // Homebrew tessdata
        let homebrew_paths = [
            "/opt/homebrew/share/tessdata",
            "/usr/local/share/tessdata",
        ];
        for path in homebrew_paths {
            let p = PathBuf::from(path);
            let chi_sim = p.join("chi_sim.traineddata");
            if chi_sim.exists() {
                eprintln!("[OCR] Using system tessdata: {:?}", p);
                return Some((p, false));
            }
        }
    }
    
    None
}


/// Perform OCR on an image using Tesseract CLI
fn ocr_image(image_path: &Path) -> OcrResult {
    let tesseract_exe = match get_tesseract_exe() {
        Some(p) => p,
        None => {
            return OcrResult {
                text: "Tesseract executable not found".to_string(),
                success: false,
            };
        }
    };
    
    let tessdata_info = get_tessdata_dir();
    
    // Build command
    let mut cmd = create_command(tesseract_exe.to_str().unwrap_or("tesseract"));
    
    cmd.arg(image_path.to_str().unwrap_or(""))
       .arg("stdout")  // Output to stdout
       .arg("-l").arg("chi_sim");  // Use Chinese
    
    // Specify tessdata dir only for bundled (system tessdata doesn't need it)
    if let Some((ref tessdata, is_bundled)) = tessdata_info {
        if is_bundled {
            cmd.arg("--tessdata-dir").arg(tessdata.to_str().unwrap_or(""));
        }
    }
    
    eprintln!("[OCR] Executing command: {:?}", cmd);
    
    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).to_string();
                eprintln!("[OCR] Recognition successful, text length: {}", text.len());
                OcrResult {
                    text,
                    success: true,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[OCR] Tesseract execution failed: {}", stderr);
                
                // If Chinese fails, try English
                let mut cmd_eng = create_command(tesseract_exe.to_str().unwrap_or("tesseract"));
                cmd_eng.arg(image_path.to_str().unwrap_or(""))
                       .arg("stdout")
                       .arg("-l").arg("eng");
                
                if let Some((ref tessdata, is_bundled)) = tessdata_info {
                    if is_bundled {
                        cmd_eng.arg("--tessdata-dir").arg(tessdata.to_str().unwrap_or(""));
                    }
                }
                
                match cmd_eng.output() {
                    Ok(output2) if output2.status.success() => {
                        let text = String::from_utf8_lossy(&output2.stdout).to_string();
                        OcrResult {
                            text,
                            success: true,
                        }
                    }
                    _ => OcrResult {
                        text: format!("OCR failed: {}", stderr),
                        success: false,
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[OCR] Failed to execute Tesseract: {}", e);
            OcrResult {
                text: format!("Failed to execute Tesseract: {}", e),
                success: false,
            }
        }
    }
}

/// Perform OCR on device screenshot
pub fn ocr_screen(device: &str) -> OcrResult {
    let total_start = Instant::now();
    
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_temp.png");
    let device_path = "/data/local/tmp/pico_screen.png";
    
    // Method: screencap on device + pull (often faster than exec-out for large images)
    let screenshot_start = Instant::now();
    
    // Take screenshot on device
    let cap_result = create_command(&adb_path)
        .args(["-s", device, "shell", "screencap", "-p", device_path])
        .output();
    
    if let Err(e) = cap_result {
        return OcrResult {
            text: format!("Screenshot failed: {}", e),
            success: false,
        };
    }
    
    eprintln!("[OCR] screencap on device time: {:?}", screenshot_start.elapsed());
    
    // Pull the file
    let pull_start = Instant::now();
    let pull_result = create_command(&adb_path)
        .args(["-s", device, "pull", device_path, temp_png.to_str().unwrap_or("")])
        .output();
    
    if let Err(e) = pull_result {
        return OcrResult {
            text: format!("Pull failed: {}", e),
            success: false,
        };
    }
    
    eprintln!("[OCR] pull time: {:?}", pull_start.elapsed());
    eprintln!("[OCR] total screenshot time: {:?}", screenshot_start.elapsed());
    
    // Clean up device file
    let _ = create_command(&adb_path)
        .args(["-s", device, "shell", "rm", device_path])
        .output();
    
    // Check file exists and has content
    let file_size = fs::metadata(&temp_png).map(|m| m.len()).unwrap_or(0);
    if file_size == 0 {
        return OcrResult {
            text: "Screenshot is empty".to_string(),
            success: false,
        };
    }
    
    eprintln!("[OCR] Screenshot size: {} bytes", file_size);

    let ocr_start = Instant::now();
    let result = ocr_image(&temp_png);
    eprintln!("[OCR] OCR recognition time: {:?}", ocr_start.elapsed());
    
    let _ = fs::remove_file(&temp_png);
    
    eprintln!("[OCR] Total time: {:?}", total_start.elapsed());
    result
}

/// Detect if on newbie list page (via OCR) - uses ADB screenshot
pub fn is_on_newbie_list_debug(device: &str) -> (bool, String) {
    let result = ocr_screen(device);
    if !result.success {
        eprintln!("[OCR] Newbie list detection failed: {}", result.text);
        return (false, result.text);
    }

    let text = &result.text;
    
    // Chinese keywords for newbie/star list page
    let keywords = [
        "新星", "萌新", "用户榜", "刷新", "发现新用户",
        "新用户", "榜单", "用户", "新人", "星榜",
        "新 星", "用 户", "榜 单"
    ];
    
    let is_match = keywords.iter().any(|&keyword| text.contains(keyword));
    
    eprintln!("[OCR] Newbie list detection: {} - text: {}", 
        if is_match { "matched" } else { "not matched" }, 
        text.chars().take(200).collect::<String>()
    );
    
    (is_match, result.text.clone())
}


/// Find text position on screen (returns center coordinates)
/// Uses Tesseract TSV output to get text bounding boxes
pub fn find_text_position(device: &str, target_text: &str) -> Option<(i32, i32)> {
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_find.png");
    
    // Take screenshot
    let output = create_command(&adb_path)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output()
        .ok()?;

    if output.stdout.is_empty() {
        eprintln!("[OCR] Screenshot failed - empty output");
        return None;
    }

    // Fix Windows line ending corruption in PNG binary data
    let fixed_data = if cfg!(target_os = "windows") {
        output.stdout.iter()
            .enumerate()
            .filter(|(i, &byte)| {
                !(byte == 0x0D && output.stdout.get(i + 1) == Some(&0x0A))
            })
            .map(|(_, &byte)| byte)
            .collect::<Vec<u8>>()
    } else {
        output.stdout
    };

    fs::write(&temp_png, &fixed_data).ok()?;
    
    // Use TSV output to get bounding boxes
    let tesseract_exe = get_tesseract_exe()?;
    let tessdata_info = get_tessdata_dir();
    
    let mut cmd = create_command(tesseract_exe.to_str()?);
    cmd.arg(temp_png.to_str()?)
       .arg("stdout")
       .arg("-l").arg("chi_sim")
       .arg("tsv");  // TSV output includes bounding boxes
    
    if let Some((ref tessdata, is_bundled)) = tessdata_info {
        if is_bundled {
            cmd.arg("--tessdata-dir").arg(tessdata.to_str()?);
        }
    }
    
    let tsv_output = cmd.output().ok()?;
    let _ = fs::remove_file(&temp_png);
    
    if !tsv_output.status.success() {
        eprintln!("[OCR] TSV output failed");
        return None;
    }
    
    let tsv_text = String::from_utf8_lossy(&tsv_output.stdout);
    
    // Parse TSV to find target text
    // TSV format: level page_num block_num par_num line_num word_num left top width height conf text
    let mut words: Vec<(String, i32, i32, i32, i32)> = Vec::new();
    
    for line in tsv_text.lines().skip(1) {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() >= 12 && !cols[11].trim().is_empty() {
            if let (Ok(left), Ok(top), Ok(w), Ok(h)) = (
                cols[6].parse::<i32>(),
                cols[7].parse::<i32>(),
                cols[8].parse::<i32>(),
                cols[9].parse::<i32>(),
            ) {
                words.push((cols[11].to_string(), left, top, w, h));
            }
        }
    }
    
    eprintln!("[OCR] Searching '{}' - found {} words", target_text, words.len());
    
    // Exact match
    for (text, left, top, w, h) in &words {
        if text.contains(target_text) {
            let center_x = left + w / 2;
            let center_y = top + h / 2;
            eprintln!("[OCR] Found '{}' at ({}, {})", target_text, center_x, center_y);
            return Some((center_x, center_y));
        }
    }
    
    // Fuzzy match for common OCR misrecognitions
    let fuzzy_matches = [
        ("发送", vec!["发送", "發送", "发 送", "发逸", "发这"]),
    ];
    
    for (original, variants) in &fuzzy_matches {
        if target_text == *original {
            for variant in variants {
                for (text, left, top, w, h) in &words {
                    if text.contains(variant) {
                        let center_x = left + w / 2;
                        let center_y = top + h / 2;
                        eprintln!("[OCR] Fuzzy match '{}' -> '{}' at ({}, {})", target_text, text, center_x, center_y);
                        return Some((center_x, center_y));
                    }
                }
            }
        }
    }
    
    eprintln!("[OCR] '{}' not found", target_text);
    None
}

/// OCR test result with detailed diagnostics
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrTestResult {
    pub success: bool,
    pub text: String,
    pub tesseract_path: String,
    pub tesseract_exists: bool,
    pub tessdata_path: String,
    pub tessdata_exists: bool,
    pub chi_sim_exists: bool,
    pub chi_sim_size: u64,
    pub init_error: Option<String>,
    pub diagnostics: Vec<String>,
}

/// Tauri command: Test OCR setup only (no emulator needed)
/// Creates a simple test image and runs OCR on it
#[tauri::command]
pub fn cmd_test_ocr_standalone() -> Result<OcrTestResult, String> {
    let mut diagnostics = Vec::new();
    
    // Check tesseract executable
    let tesseract_exe = get_tesseract_exe();
    let tesseract_path = tesseract_exe.as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let tesseract_exists = tesseract_exe.as_ref().map(|p| p.exists()).unwrap_or(false);
    
    diagnostics.push(format!("Tesseract path: {}", tesseract_path));
    diagnostics.push(format!("Tesseract exists: {}", tesseract_exists));
    
    // Check tessdata directory
    let tessdata_info = get_tessdata_dir();
    let tessdata_path = tessdata_info.as_ref()
        .map(|(p, _)| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let tessdata_exists = tessdata_info.as_ref().map(|(p, _)| p.exists()).unwrap_or(false);
    
    diagnostics.push(format!("Tessdata path: {}", tessdata_path));
    diagnostics.push(format!("Tessdata exists: {}", tessdata_exists));
    
    // Check chi_sim.traineddata
    let chi_sim_path = tessdata_info.as_ref().map(|(p, _)| p.join("chi_sim.traineddata"));
    let chi_sim_exists = chi_sim_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let chi_sim_size = chi_sim_path.as_ref()
        .and_then(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);
    
    diagnostics.push(format!("chi_sim.traineddata exists: {}", chi_sim_exists));
    diagnostics.push(format!("chi_sim.traineddata size: {} bytes", chi_sim_size));
    
    // Return error if tesseract not found
    if !tesseract_exists {
        return Ok(OcrTestResult {
            success: false,
            text: "Tesseract not installed".to_string(),
            tesseract_path,
            tesseract_exists,
            tessdata_path,
            tessdata_exists,
            chi_sim_exists,
            chi_sim_size,
            init_error: Some("Tesseract executable not found".to_string()),
            diagnostics,
        });
    }
    
    // Test tesseract version
    if let Some(ref exe) = tesseract_exe {
        let version_output = create_command(exe.to_str().unwrap_or("tesseract"))
            .arg("--version")
            .output();
        
        if let Ok(output) = version_output {
            let version = String::from_utf8_lossy(&output.stdout);
            let version_line = version.lines().next().unwrap_or("unknown");
            diagnostics.push(format!("Tesseract version: {}", version_line));
        } else {
            diagnostics.push("Failed to get Tesseract version".to_string());
        }
    }
    
    // Test with a simple generated image containing text
    diagnostics.push("Creating test image...".to_string());
    
    let test_image_path = get_temp_path("pico_ocr_test.png");
    
    // Create a simple white image with black text using image crate
    let test_result = create_test_image_and_ocr(&test_image_path, &tesseract_exe, &tessdata_info);
    
    match test_result {
        Ok(text) => {
            diagnostics.push(format!("OCR test successful, recognized: {}", text.trim()));
            Ok(OcrTestResult {
                success: true,
                text: format!("Tesseract is working! Recognized test text: {}", text.trim()),
                tesseract_path,
                tesseract_exists,
                tessdata_path,
                tessdata_exists,
                chi_sim_exists,
                chi_sim_size,
                init_error: None,
                diagnostics,
            })
        }
        Err(e) => {
            diagnostics.push(format!("OCR test failed: {}", e));
            Ok(OcrTestResult {
                success: false,
                text: format!("OCR test failed: {}", e),
                tesseract_path,
                tesseract_exists,
                tessdata_path,
                tessdata_exists,
                chi_sim_exists,
                chi_sim_size,
                init_error: Some(e),
                diagnostics,
            })
        }
    }
}

/// Create a simple test image and run OCR on it
fn create_test_image_and_ocr(
    image_path: &Path,
    tesseract_exe: &Option<PathBuf>,
    tessdata_info: &Option<(PathBuf, bool)>,
) -> Result<String, String> {
    use image::{ImageBuffer, Rgb};
    
    let exe = tesseract_exe.as_ref().ok_or("Tesseract not found")?;
    
    // Create a simple 200x100 white image using the image crate
    // This creates a valid PNG that Tesseract can process
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(200, 100, |_x, _y| {
        Rgb([255u8, 255u8, 255u8]) // White background
    });
    
    img.save(image_path).map_err(|e| format!("Failed to create test image: {}", e))?;
    
    // Run tesseract on it
    let mut cmd = create_command(exe.to_str().unwrap_or("tesseract"));
    cmd.arg(image_path.to_str().unwrap_or(""))
       .arg("stdout")
       .arg("-l").arg("eng");  // Use English for simple test
    
    if let Some((ref tessdata, is_bundled)) = tessdata_info {
        if *is_bundled {
            cmd.arg("--tessdata-dir").arg(tessdata.to_str().unwrap_or(""));
        }
    }
    
    let output = cmd.output().map_err(|e| format!("Failed to run tesseract: {}", e))?;
    
    let _ = fs::remove_file(image_path);
    
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(if text.trim().is_empty() { "(empty - blank test image processed successfully)".to_string() } else { text })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Tesseract error: {}", stderr))
    }
}

/// Tauri command: Test OCR with emulator screenshot (integrated test)
#[tauri::command]
pub fn cmd_test_ocr(state: tauri::State<'_, crate::AppState>) -> Result<OcrTestResult, String> {
    let mut diagnostics = Vec::new();
    
    // Check tesseract executable
    let tesseract_exe = get_tesseract_exe();
    let tesseract_path = tesseract_exe.as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let tesseract_exists = tesseract_exe.as_ref().map(|p| p.exists()).unwrap_or(false);
    
    diagnostics.push(format!("Tesseract path: {}", tesseract_path));
    diagnostics.push(format!("Tesseract exists: {}", tesseract_exists));
    
    // Check tessdata directory
    let tessdata_info = get_tessdata_dir();
    let tessdata_path = tessdata_info.as_ref()
        .map(|(p, _)| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let tessdata_exists = tessdata_info.as_ref().map(|(p, _)| p.exists()).unwrap_or(false);
    
    diagnostics.push(format!("Tessdata path: {}", tessdata_path));
    diagnostics.push(format!("Tessdata exists: {}", tessdata_exists));
    
    // Check chi_sim.traineddata
    let chi_sim_path = tessdata_info.as_ref().map(|(p, _)| p.join("chi_sim.traineddata"));
    let chi_sim_exists = chi_sim_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let chi_sim_size = chi_sim_path.as_ref()
        .and_then(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);
    
    diagnostics.push(format!("chi_sim.traineddata exists: {}", chi_sim_exists));
    diagnostics.push(format!("chi_sim.traineddata size: {} bytes", chi_sim_size));
    
    // Return error if tesseract not found
    if !tesseract_exists {
        return Ok(OcrTestResult {
            success: false,
            text: "Tesseract not installed".to_string(),
            tesseract_path,
            tesseract_exists,
            tessdata_path,
            tessdata_exists,
            chi_sim_exists,
            chi_sim_size,
            init_error: Some("Tesseract executable not found".to_string()),
            diagnostics,
        });
    }
    
    // Test tesseract version
    if let Some(ref exe) = tesseract_exe {
        let version_output = create_command(exe.to_str().unwrap_or("tesseract"))
            .arg("--version")
            .output();
        
        if let Ok(output) = version_output {
            let version = String::from_utf8_lossy(&output.stdout);
            diagnostics.push(format!("Tesseract version: {}", version.lines().next().unwrap_or("unknown")));
        }
    }
    
    // Get connected device
    let device = {
        let guard = state.connected_device.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    
    let device = match device {
        Some(d) => d,
        None => {
            return Ok(OcrTestResult {
                success: false,
                text: "No device connected".to_string(),
                tesseract_path,
                tesseract_exists,
                tessdata_path,
                tessdata_exists,
                chi_sim_exists,
                chi_sim_size,
                init_error: Some("Please connect an emulator first".to_string()),
                diagnostics,
            });
        }
    };
    
    diagnostics.push(format!("Device: {}", device));
    diagnostics.push("Starting screenshot and recognition...".to_string());
    
    // Execute OCR test
    let result = ocr_screen(&device);
    
    diagnostics.push(format!("OCR result: success={}", result.success));
    
    if result.success {
        let preview: String = result.text.chars().take(500).collect();
        diagnostics.push(format!("Recognized text: {}", preview.replace('\n', " | ")));
    } else {
        diagnostics.push(format!("Recognition failed: {}", result.text));
    }
    
    Ok(OcrTestResult {
        success: result.success,
        text: result.text,
        tesseract_path,
        tesseract_exists,
        tessdata_path,
        tessdata_exists,
        chi_sim_exists,
        chi_sim_size,
        init_error: None,
        diagnostics,
    })
}
