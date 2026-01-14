//! 测试 OCR 新人榜检测
//! 
//! 用法: cargo run --bin test_ocr
//! 
//! 需要先连接 ADB 设备，并确保模拟器在运行

use std::process::Command;

fn get_adb_path() -> String {
    #[cfg(target_os = "macos")]
    {
        let paths = [
            "/opt/homebrew/bin/adb",
            "/usr/local/bin/adb",
            "/Applications/MuMuPlayer.app/Contents/MacOS/MuMuEmulator.app/Contents/MacOS/tools/adb",
        ];
        for path in paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }
    "adb".to_string()
}

fn get_connected_device() -> Option<String> {
    let adb = get_adb_path();
    let output = Command::new(&adb).args(["devices"]).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    for line in stdout.lines() {
        if line.contains("device") && !line.contains("List") && !line.contains("offline") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(addr) = parts.first() {
                return Some(addr.to_string());
            }
        }
    }
    None
}

fn ocr_screen(device: &str) -> (bool, String) {
    let adb = get_adb_path();
    let temp_png = std::env::temp_dir().join("test_ocr_temp.png");
    
    // 截图并直接保存（不做 CRLF 转换，因为 macOS 不需要）
    println!("正在截图...");
    let output = match Command::new(&adb)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output()
    {
        Ok(o) => o,
        Err(e) => return (false, format!("截图失败: {}", e)),
    };

    if output.stdout.is_empty() {
        return (false, "截图为空".to_string());
    }

    // 直接保存原始数据
    if let Err(e) = std::fs::write(&temp_png, &output.stdout) {
        return (false, format!("保存截图失败: {}", e));
    }
    
    println!("截图已保存到: {:?}", temp_png);

    // macOS OCR
    #[cfg(target_os = "macos")]
    {
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

        let script_path = std::env::temp_dir().join("test_ocr.swift");
        if let Err(e) = std::fs::write(&script_path, swift_script) {
            return (false, format!("创建脚本失败: {}", e));
        }

        println!("正在执行 OCR...");
        let output = Command::new("swift")
            .arg(&script_path)
            .arg(&temp_png)
            .output();

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&temp_png);

        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                
                if stdout.contains("ERROR:") || !o.status.success() {
                    (false, format!("OCR 失败: {}", stderr))
                } else {
                    (true, stdout)
                }
            }
            Err(e) => (false, format!("执行 OCR 失败: {}", e)),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = std::fs::remove_file(&temp_png);
        (false, "仅支持 macOS".to_string())
    }
}

fn is_on_newbie_list(text: &str) -> bool {
    text.contains("新星用户萌新榜") && text.contains("刷新一下发现新用户")
}

fn main() {
    println!("=== OCR 新人榜检测测试 ===\n");
    
    // 查找设备
    let device = match get_connected_device() {
        Some(d) => d,
        None => {
            println!("错误: 未找到已连接的 ADB 设备");
            println!("请先启动模拟器并连接 ADB");
            return;
        }
    };
    
    println!("已连接设备: {}\n", device);
    
    // 执行 OCR
    let (success, text) = ocr_screen(&device);
    
    if !success {
        println!("OCR 失败: {}", text);
        return;
    }
    
    println!("=== OCR 识别结果 ===");
    println!("{}", text);
    println!("===================\n");
    
    // 检测新人榜
    let on_newbie_list = is_on_newbie_list(&text);
    
    println!("=== 检测结果 ===");
    println!("包含 '新星用户萌新榜': {}", text.contains("新星用户萌新榜"));
    println!("包含 '刷新一下发现新用户': {}", text.contains("刷新一下发现新用户"));
    println!();
    
    if on_newbie_list {
        println!("✅ 当前在新人榜页面");
    } else {
        println!("❌ 当前不在新人榜页面");
    }
}
