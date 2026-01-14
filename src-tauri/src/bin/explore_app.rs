//! App 导航探索工具
//! 
//! 通过 OCR 学习 App 的导航结构（纯 OCR，不依赖 uiautomator）
//! 用法: cargo run --bin explore_app

use std::process::Command;
use std::fs;
use std::thread;
use std::time::Duration;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PageInfo {
    name: String,
    tab_pos: (i32, i32),
    ocr_keywords: Vec<String>,
    sub_pages: Vec<SubPage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubPage {
    name: String,
    entry_text: String,
    ocr_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NavigationMap {
    tabs: Vec<PageInfo>,
    screen_size: (i32, i32),
}

fn get_adb_path() -> String {
    let paths = ["/opt/homebrew/bin/adb", "/usr/local/bin/adb"];
    for path in paths {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    "adb".to_string()
}

fn get_device() -> Option<String> {
    let adb = get_adb_path();
    let output = Command::new(&adb).args(["devices"]).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("device") && !line.contains("List") {
            return line.split_whitespace().next().map(|s| s.to_string());
        }
    }
    None
}

fn tap(device: &str, x: i32, y: i32) {
    let adb = get_adb_path();
    let _ = Command::new(&adb)
        .args(["-s", device, "shell", "input", "tap", &x.to_string(), &y.to_string()])
        .output();
}

fn press_back(device: &str) {
    let adb = get_adb_path();
    let _ = Command::new(&adb)
        .args(["-s", device, "shell", "input", "keyevent", "KEYCODE_BACK"])
        .output();
}

fn get_screen_size(device: &str) -> (i32, i32) {
    let adb = get_adb_path();
    if let Ok(output) = Command::new(&adb).args(["-s", device, "shell", "wm", "size"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(size_part) = stdout.split(':').nth(1) {
            let parts: Vec<&str> = size_part.trim().split('x').collect();
            if parts.len() == 2 {
                if let (Ok(w), Ok(h)) = (parts[0].parse(), parts[1].parse()) {
                    return (w, h);
                }
            }
        }
    }
    (2160, 3840)
}

fn ocr_screen(device: &str) -> Vec<String> {
    let adb = get_adb_path();
    let temp_png = std::env::temp_dir().join("explore_temp.png");
    
    let output = Command::new(&adb)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output().ok();
    
    if let Some(o) = output {
        if !o.stdout.is_empty() {
            let _ = fs::write(&temp_png, &o.stdout);
        }
    }

    let swift_script = r#"
import Vision
import AppKit
import Foundation
let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en"]
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])
guard let observations = request.results else { exit(1) }
for observation in observations {
    if let topCandidate = observation.topCandidates(1).first {
        print(topCandidate.string)
    }
}
"#;

    let script_path = std::env::temp_dir().join("ocr.swift");
    let _ = fs::write(&script_path, swift_script);
    
    let result = Command::new("swift").arg(&script_path).arg(&temp_png).output();
    let _ = fs::remove_file(&script_path);
    let _ = fs::remove_file(&temp_png);

    if let Ok(o) = result {
        String::from_utf8_lossy(&o.stdout).lines().map(|s| s.to_string()).collect()
    } else {
        vec![]
    }
}

fn save_screenshot(device: &str, name: &str) {
    let adb = get_adb_path();
    let _ = fs::create_dir_all("screenshots");
    let output = Command::new(&adb)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output().ok();
    if let Some(o) = output {
        let _ = fs::write(format!("screenshots/{}.png", name), &o.stdout);
    }
}

fn main() {
    println!("=== App 导航探索 (纯 OCR) ===\n");
    
    let device = match get_device() {
        Some(d) => d,
        None => { println!("未找到设备"); return; }
    };
    
    let screen = get_screen_size(&device);
    println!("设备: {}, 屏幕: {}x{}\n", device, screen.0, screen.1);
    
    // 基于 2160x3840 的坐标，按比例缩放
    let scale_x = screen.0 as f64 / 2160.0;
    let scale_y = screen.1 as f64 / 3840.0;
    
    // Tab bar 位置 (底部约 3700 的位置)
    let tab_y = (3700.0 * scale_y) as i32;
    
    // 四个 Tab 的 X 坐标 (基于 2160 宽度)
    let tab_positions = [
        ("娱乐", (270.0 * scale_x) as i32, tab_y),
        ("约玩", (810.0 * scale_x) as i32, tab_y),
        ("消息", (1350.0 * scale_x) as i32, tab_y),
        ("我的", (1890.0 * scale_x) as i32, tab_y),
    ];
    
    let mut nav_map = NavigationMap {
        tabs: Vec::new(),
        screen_size: screen,
    };
    
    println!("开始探索 4 个主 Tab...\n");
    println!("请确保 App 已打开并在主页面\n");
    
    for (tab_name, tab_x, tab_y) in &tab_positions {
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!("📱 探索 Tab: {} (点击 {}, {})", tab_name, tab_x, tab_y);
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // 点击 Tab
        tap(&device, *tab_x, *tab_y);
        thread::sleep(Duration::from_millis(2500));
        
        // OCR 识别
        let ocr = ocr_screen(&device);
        save_screenshot(&device, &format!("tab_{}", tab_name));
        
        // 过滤有意义的关键词
        let keywords: Vec<String> = ocr.iter()
            .filter(|t| t.len() > 1 && t.len() < 25 && !t.chars().all(|c| c.is_numeric() || c == ':'))
            .cloned()
            .collect();
        
        println!("OCR 识别到 {} 个文本", keywords.len());
        println!("关键词: {:?}", &keywords[..keywords.len().min(20)]);
        
        let page_info = PageInfo {
            name: tab_name.to_string(),
            tab_pos: (*tab_x, *tab_y),
            ocr_keywords: keywords.iter().take(15).cloned().collect(),
            sub_pages: Vec::new(),
        };
        
        nav_map.tabs.push(page_info);
        println!();
    }
    
    // 特别探索：从"约玩" Tab 进入新人榜
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📱 探索: 约玩 -> 新人榜");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // 先点击约玩 Tab
    let (_, yuwan_x, yuwan_y) = tab_positions[1];
    tap(&device, yuwan_x, yuwan_y);
    thread::sleep(Duration::from_millis(2000));
    
    // 点击新人榜入口 (通常在页面上方)
    // 基于 2160x3840，新人榜入口大约在 (1080, 600) 附近
    let newbie_x = (1080.0 * scale_x) as i32;
    let newbie_y = (600.0 * scale_y) as i32;
    
    println!("点击新人榜入口 ({}, {})", newbie_x, newbie_y);
    tap(&device, newbie_x, newbie_y);
    thread::sleep(Duration::from_millis(2500));
    
    let ocr = ocr_screen(&device);
    save_screenshot(&device, "newbie_list");
    
    let is_newbie = ocr.iter().any(|t| t.contains("新星用户萌新榜") || t.contains("刷新一下发现新用户"));
    
    if is_newbie {
        println!("✅ 成功进入新人榜!");
        println!("OCR: {:?}", &ocr[..ocr.len().min(15)]);
        
        // 更新约玩 Tab 的子页面
        if let Some(yuwan_tab) = nav_map.tabs.iter_mut().find(|t| t.name == "约玩") {
            yuwan_tab.sub_pages.push(SubPage {
                name: "新人榜".to_string(),
                entry_text: "新星用户萌新榜".to_string(),
                ocr_keywords: ocr.iter()
                    .filter(|t| t.len() > 1 && t.len() < 25)
                    .take(10)
                    .cloned()
                    .collect(),
            });
        }
    } else {
        println!("❌ 未能进入新人榜");
        println!("当前页面 OCR: {:?}", &ocr[..ocr.len().min(10)]);
    }
    
    // 返回
    press_back(&device);
    thread::sleep(Duration::from_millis(1500));
    
    // 保存结果
    let json = serde_json::to_string_pretty(&nav_map).unwrap();
    fs::write("navigation_map.json", &json).unwrap();
    
    // 生成 Markdown 报告
    let mut md = String::from("# App 导航图\n\n");
    md.push_str(&format!("屏幕尺寸: {}x{}\n\n", screen.0, screen.1));
    md.push_str("## Tab Bar\n\n");
    md.push_str("| Tab | 点击位置 | 关键词 |\n");
    md.push_str("|-----|---------|--------|\n");
    
    for tab in &nav_map.tabs {
        let keywords = tab.ocr_keywords.iter().take(5).cloned().collect::<Vec<_>>().join(", ");
        md.push_str(&format!("| {} | {:?} | {} |\n", tab.name, tab.tab_pos, keywords));
    }
    
    md.push_str("\n## 子页面\n\n");
    for tab in &nav_map.tabs {
        if !tab.sub_pages.is_empty() {
            md.push_str(&format!("### {} Tab\n\n", tab.name));
            for sub in &tab.sub_pages {
                md.push_str(&format!("- **{}**\n", sub.name));
                md.push_str(&format!("  - 入口文字: {}\n", sub.entry_text));
                md.push_str(&format!("  - 关键词: {}\n\n", sub.ocr_keywords.join(", ")));
            }
        }
    }
    
    // Mermaid 图
    md.push_str("## 导航图\n\n```mermaid\ngraph TD\n");
    md.push_str("    App[App]\n");
    for tab in &nav_map.tabs {
        let tab_id = tab.name.replace(" ", "_");
        md.push_str(&format!("    App --> {}[{}]\n", tab_id, tab.name));
        for sub in &tab.sub_pages {
            let sub_id = format!("{}_{}", tab_id, sub.name.replace(" ", "_"));
            md.push_str(&format!("    {} --> {}[{}]\n", tab_id, sub_id, sub.name));
        }
    }
    md.push_str("```\n");
    
    fs::write("navigation_map.md", &md).unwrap();
    
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("✅ 探索完成!");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("输出文件:");
    println!("  - navigation_map.json");
    println!("  - navigation_map.md");
    println!("  - screenshots/*.png");
}
