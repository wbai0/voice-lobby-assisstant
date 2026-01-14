//! 跨平台 OCR 模块
//! macOS: 使用 Vision API (Swift)
//! Windows: 尝试使用 Tesseract CLI，如果不可用则跳过 OCR

use crate::adb;
use std::process::Command;
use std::fs;
use std::path::PathBuf;

/// OCR 识别结果
#[derive(Debug, Clone)]
pub struct OcrResult {
    pub text: String,
    pub success: bool,
}

/// 获取临时文件路径
fn get_temp_path(filename: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(filename);
    path
}

/// 检查 Tesseract 是否可用
#[cfg(target_os = "windows")]
fn get_tesseract_path() -> Option<String> {
    // 检查常见安装路径
    let common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ];
    
    for path in common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    
    // 检查 PATH
    if let Ok(output) = Command::new("where").arg("tesseract").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path.lines().next().unwrap_or("").to_string());
            }
        }
    }
    
    None
}

/// 对设备截图进行 OCR 识别
pub fn ocr_screen(device: &str) -> OcrResult {
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_temp.png");
    
    // 截图
    let output = match Command::new(&adb_path)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return OcrResult {
                text: format!("截图失败: {}", e),
                success: false,
            };
        }
    };

    if output.stdout.is_empty() {
        return OcrResult {
            text: "截图为空".to_string(),
            success: false,
        };
    }

    if let Err(e) = fs::write(&temp_png, &output.stdout) {
        return OcrResult {
            text: format!("保存截图失败: {}", e),
            success: false,
        };
    }

    let result = platform_ocr(&temp_png);
    let _ = fs::remove_file(&temp_png);
    result
}

/// 检测是否在新人榜页面（通过 OCR）
pub fn is_on_newbie_list(device: &str) -> bool {
    // Windows: 尝试 Tesseract，如果不可用则跳过检测
    #[cfg(target_os = "windows")]
    {
        if get_tesseract_path().is_none() {
            // Tesseract 不可用，跳过检测
            return true;
        }
    }
    
    let result = ocr_screen(device);
    if !result.success {
        // OCR 失败时，在 Windows 上返回 true（跳过检测），macOS 上返回 false
        #[cfg(target_os = "windows")]
        return true;
        #[cfg(not(target_os = "windows"))]
        return false;
    }

    let text = &result.text;
    text.contains("新星用户") || text.contains("萌新榜") || text.contains("刷新一下")
}

/// 在屏幕上查找指定文字的位置（返回中心坐标）
pub fn find_text_position(device: &str, target_text: &str) -> Option<(i32, i32)> {
    // Windows: 如果 Tesseract 不可用，直接返回 None
    #[cfg(target_os = "windows")]
    {
        if get_tesseract_path().is_none() {
            let _ = (device, target_text);
            return None;
        }
    }
    
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_find.png");
    
    let output = match Command::new(&adb_path)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return None,
    };

    if output.stdout.is_empty() {
        return None;
    }

    if fs::write(&temp_png, &output.stdout).is_err() {
        return None;
    }

    let result = platform_find_text(&temp_png, target_text);
    let _ = fs::remove_file(&temp_png);
    result
}

// ============ macOS 实现 ============

#[cfg(target_os = "macos")]
fn platform_ocr(image_path: &PathBuf) -> OcrResult {
    let swift_script = r#"
import Vision
import AppKit
import Foundation

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("ERROR: Cannot load image")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

guard let observations = request.results else {
    print("ERROR: No results")
    exit(1)
}

for observation in observations {
    if let topCandidate = observation.topCandidates(1).first {
        print(topCandidate.string)
    }
}
"#;

    let script_path = get_temp_path("pico_ocr.swift");
    if let Err(e) = fs::write(&script_path, swift_script) {
        return OcrResult {
            text: format!("创建脚本失败: {}", e),
            success: false,
        };
    }

    let output = Command::new("swift")
        .arg(&script_path)
        .arg(image_path)
        .output();

    let _ = fs::remove_file(&script_path);

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            
            if stdout.contains("ERROR:") || !o.status.success() {
                OcrResult {
                    text: format!("OCR 失败: {}", stderr),
                    success: false,
                }
            } else {
                OcrResult {
                    text: stdout,
                    success: true,
                }
            }
        }
        Err(e) => OcrResult {
            text: format!("执行 OCR 失败: {}", e),
            success: false,
        },
    }
}

#[cfg(target_os = "macos")]
fn platform_find_text(image_path: &PathBuf, target_text: &str) -> Option<(i32, i32)> {
    let swift_script = format!(r#"
import Vision
import AppKit
import Foundation

let imagePath = CommandLine.arguments[1]
let targetText = "{}"

guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {{
    exit(1)
}}

let imageWidth = CGFloat(cgImage.width)
let imageHeight = CGFloat(cgImage.height)

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

guard let observations = request.results else {{
    exit(1)
}}

for observation in observations {{
    if let topCandidate = observation.topCandidates(1).first {{
        if topCandidate.string.contains(targetText) {{
            let box = observation.boundingBox
            let centerX = Int((box.origin.x + box.width / 2) * imageWidth)
            let centerY = Int((1.0 - box.origin.y - box.height / 2) * imageHeight)
            print("\(centerX),\(centerY)")
            exit(0)
        }}
    }}
}}
exit(1)
"#, target_text);

    let script_path = get_temp_path("pico_ocr_find.swift");
    if fs::write(&script_path, &swift_script).is_err() {
        return None;
    }

    let output = Command::new("swift")
        .arg(&script_path)
        .arg(image_path)
        .output();

    let _ = fs::remove_file(&script_path);

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let parts: Vec<&str> = stdout.split(',').collect();
            if parts.len() == 2 {
                if let (Ok(x), Ok(y)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                    return Some((x, y));
                }
            }
            None
        }
        _ => None,
    }
}

// ============ Windows 实现 (Tesseract CLI) ============

#[cfg(target_os = "windows")]
fn platform_ocr(image_path: &PathBuf) -> OcrResult {
    let tesseract = match get_tesseract_path() {
        Some(p) => p,
        None => {
            return OcrResult {
                text: "Tesseract 未安装".to_string(),
                success: false,
            };
        }
    };

    // 使用 Tesseract 进行 OCR
    let output = Command::new(&tesseract)
        .args([
            image_path.to_str().unwrap_or(""),
            "stdout",
            "-l", "chi_sim+eng",
            "--psm", "3",
        ])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                OcrResult {
                    text: String::from_utf8_lossy(&o.stdout).to_string(),
                    success: true,
                }
            } else {
                OcrResult {
                    text: String::from_utf8_lossy(&o.stderr).to_string(),
                    success: false,
                }
            }
        }
        Err(e) => OcrResult {
            text: format!("执行 Tesseract 失败: {}", e),
            success: false,
        },
    }
}

#[cfg(target_os = "windows")]
fn platform_find_text(image_path: &PathBuf, target_text: &str) -> Option<(i32, i32)> {
    let tesseract = get_tesseract_path()?;

    // 使用 Tesseract 的 TSV 输出获取文字位置
    let output = Command::new(&tesseract)
        .args([
            image_path.to_str().unwrap_or(""),
            "stdout",
            "-l", "chi_sim+eng",
            "--psm", "3",
            "tsv",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let tsv = String::from_utf8_lossy(&output.stdout);
    
    // 解析 TSV 输出，查找目标文字
    for line in tsv.lines().skip(1) {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() >= 12 {
            let text = cols[11];
            if text.contains(target_text) {
                // 列: level, page_num, block_num, par_num, line_num, word_num, left, top, width, height, conf, text
                if let (Ok(left), Ok(top), Ok(width), Ok(height)) = (
                    cols[6].parse::<i32>(),
                    cols[7].parse::<i32>(),
                    cols[8].parse::<i32>(),
                    cols[9].parse::<i32>(),
                ) {
                    let center_x = left + width / 2;
                    let center_y = top + height / 2;
                    return Some((center_x, center_y));
                }
            }
        }
    }

    None
}

// ============ 其他平台 ============

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_ocr(_image_path: &PathBuf) -> OcrResult {
    OcrResult {
        text: "不支持的平台".to_string(),
        success: false,
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_find_text(_image_path: &PathBuf, _target_text: &str) -> Option<(i32, i32)> {
    None
}
