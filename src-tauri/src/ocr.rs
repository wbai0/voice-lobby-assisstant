//! 跨平台 OCR 模块
//! macOS: 使用 shortcuts 命令调用系统 OCR
//! Windows: 使用 PowerShell 调用 Windows OCR API

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

/// 对设备截图进行 OCR 识别
pub fn ocr_screen(device: &str) -> OcrResult {
    // 先截图保存到临时文件
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

    // 直接保存原始数据（macOS 不需要 CRLF 转换）
    if let Err(e) = fs::write(&temp_png, &output.stdout) {
        return OcrResult {
            text: format!("保存截图失败: {}", e),
            success: false,
        };
    }

    // 调用平台特定的 OCR
    let result = platform_ocr(&temp_png);
    
    // 清理临时文件
    let _ = fs::remove_file(&temp_png);
    
    result
}

/// 检测是否在新人榜页面（通过 OCR）
/// 注意：Windows OCR 不稳定，此函数在 Windows 上直接返回 true（跳过检测）
pub fn is_on_newbie_list(device: &str) -> bool {
    // Windows OCR 不稳定，直接跳过检测，假设用户在正确页面
    #[cfg(target_os = "windows")]
    {
        let _ = device; // suppress unused warning
        return true;
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let result = ocr_screen(device);
        if !result.success {
            return false;
        }

        // 检测新人榜特征文字
        let text = &result.text;
        text.contains("新星用户萌新榜") && text.contains("刷新一下发现新用户")
    }
}

/// 在屏幕上查找指定文字的位置（返回中心坐标）
/// 使用 OCR 识别文字并返回其边界框的中心点
/// 注意：Windows OCR 不稳定，此函数在 Windows 上直接返回 None
pub fn find_text_position(device: &str, target_text: &str) -> Option<(i32, i32)> {
    // Windows OCR 不稳定，直接跳过
    #[cfg(target_os = "windows")]
    {
        let _ = (device, target_text); // suppress unused warnings
        return None;
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // 截图保存到临时文件
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

        // 调用平台特定的 OCR 查找
        let result = platform_find_text(&temp_png, target_text);
        
        // 清理临时文件
        let _ = fs::remove_file(&temp_png);
        
        result
    }
}

/// 平台特定的文字位置查找
#[cfg(target_os = "macos")]
fn platform_find_text(image_path: &PathBuf, target_text: &str) -> Option<(i32, i32)> {
    // macOS: 使用 Swift 脚本调用 Vision API，返回边界框
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
            // Vision 坐标系：左下角为原点，需要转换
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

#[cfg(target_os = "windows")]
fn platform_find_text(image_path: &PathBuf, target_text: &str) -> Option<(i32, i32)> {
    // Windows: 使用 PowerShell 调用 Windows OCR API 并返回边界框
    let ps_script = format!(r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]

$imagePath = "{}"
$targetText = "{}"

function Await($WinRtTask, $ResultType) {{
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}}

$fileStream = [System.IO.File]::OpenRead($imagePath)
$randomAccessStream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)

$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($randomAccessStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("zh-Hans-CN"))
if ($ocrEngine -eq $null) {{
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}}

$ocrResult = Await ($ocrEngine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])

foreach ($line in $ocrResult.Lines) {{
    foreach ($word in $line.Words) {{
        if ($word.Text -like "*$targetText*") {{
            $rect = $word.BoundingRect
            $centerX = [int]($rect.X + $rect.Width / 2)
            $centerY = [int]($rect.Y + $rect.Height / 2)
            Write-Output "$centerX,$centerY"
            $fileStream.Close()
            exit 0
        }}
    }}
}}

$fileStream.Close()
exit 1
"#, image_path.display(), target_text);

    let output = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .output();

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

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_find_text(_image_path: &PathBuf, _target_text: &str) -> Option<(i32, i32)> {
    None
}

/// 平台特定的 OCR 实现
#[cfg(target_os = "macos")]
fn platform_ocr(image_path: &PathBuf) -> OcrResult {
    // macOS: 使用 Swift 脚本调用 Vision API
    // 创建一个临时 Swift 脚本
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

    // 执行 Swift 脚本
    let output = Command::new("swift")
        .arg(&script_path)
        .arg(image_path)
        .output();

    // 清理脚本
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

#[cfg(target_os = "windows")]
fn platform_ocr(image_path: &PathBuf) -> OcrResult {
    // Windows: 使用 PowerShell 调用 Windows OCR API
    let ps_script = format!(r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]

$imagePath = "{}"

# 异步方法转同步的辅助函数
function Await($WinRtTask, $ResultType) {{
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}}

# 打开图片文件
$fileStream = [System.IO.File]::OpenRead($imagePath)
$randomAccessStream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)

# 解码图片
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($randomAccessStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

# 创建 OCR 引擎（使用中文）
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("zh-Hans-CN"))
if ($ocrEngine -eq $null) {{
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}}

# 执行 OCR
$ocrResult = Await ($ocrEngine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])

# 输出结果
foreach ($line in $ocrResult.Lines) {{
    Write-Output $line.Text
}}

$fileStream.Close()
"#, image_path.display());

    let output = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            
            if !o.status.success() {
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

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_ocr(_image_path: &PathBuf) -> OcrResult {
    OcrResult {
        text: "不支持的平台".to_string(),
        success: false,
    }
}
