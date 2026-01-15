//! 跨平台 OCR 模块
//! 使用 tesseract-rs 进行 OCR，支持 macOS 和 Windows

use crate::adb;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tesseract_rs::TesseractAPI;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 全局 Tesseract API 实例（懒加载）
static TESSERACT_API: Mutex<Option<TesseractAPI>> = Mutex::new(None);

/// Create a Command with hidden window on Windows
fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }
    
    cmd
}

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

/// 获取 tessdata 目录路径
fn get_tessdata_dir() -> PathBuf {
    // 优先使用打包的资源目录
    if let Ok(exe_path) = std::env::current_exe() {
        #[cfg(target_os = "windows")]
        {
            // Windows: app.exe -> tessdata/ (同目录)
            let bundled_tessdata = exe_path.parent()
                .map(|p| p.join("tessdata"));
            if let Some(path) = bundled_tessdata {
                if path.exists() {
                    eprintln!("[OCR] 使用打包的tessdata: {:?}", path);
                    return path;
                }
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS: App.app/Contents/MacOS/app -> App.app/Contents/Resources/tessdata
            let bundled_tessdata = exe_path
                .parent() // MacOS
                .and_then(|p| p.parent()) // Contents
                .map(|p| p.join("Resources").join("tessdata"));
            if let Some(path) = bundled_tessdata {
                if path.exists() {
                    eprintln!("[OCR] 使用打包的tessdata: {:?}", path);
                    return path;
                }
            }
        }
    }
    
    // 降级到用户目录
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("tesseract-rs")
                .join("tessdata");
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata)
                .join("tesseract-rs")
                .join("tessdata");
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".tesseract-rs")
                .join("tessdata");
        }
    }
    
    PathBuf::from("tessdata")
}

/// 确保 chi_sim.traineddata 存在，如果不存在则下载
fn ensure_chi_sim_traineddata(tessdata_dir: &PathBuf) {
    let chi_sim_path = tessdata_dir.join("chi_sim.traineddata");
    
    // 检查文件是否存在且大小合理（至少1MB）
    if chi_sim_path.exists() {
        if let Ok(metadata) = fs::metadata(&chi_sim_path) {
            if metadata.len() > 1_000_000 {
                eprintln!("[OCR] chi_sim.traineddata 已存在: {:?} ({} bytes)", chi_sim_path, metadata.len());
                return;
            } else {
                eprintln!("[OCR] chi_sim.traineddata 文件太小，重新下载");
                let _ = fs::remove_file(&chi_sim_path);
            }
        }
    }
    
    eprintln!("[OCR] ⚠ chi_sim.traineddata 不存在");
    eprintln!("[OCR] 提示：国内用户可能无法自动下载训练数据");
    eprintln!("[OCR] 请手动下载并放置到: {:?}", tessdata_dir);
    eprintln!("[OCR] 下载地址: https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata");
    
    // 创建目录
    if let Err(e) = fs::create_dir_all(tessdata_dir) {
        eprintln!("[OCR] 创建tessdata目录失败: {:?}", e);
        return;
    }
    
    // 尝试下载（可能失败）
    eprintln!("[OCR] 尝试下载 chi_sim.traineddata...");
    let url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata";
    
    match create_command("curl")
        .args(["-L", "-o", chi_sim_path.to_str().unwrap_or(""), url, "--connect-timeout", "30"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                if let Ok(metadata) = fs::metadata(&chi_sim_path) {
                    if metadata.len() > 1_000_000 {
                        eprintln!("[OCR] ✓ chi_sim.traineddata 下载成功 ({} bytes)", metadata.len());
                    } else {
                        eprintln!("[OCR] ✗ 下载的文件太小，可能下载失败");
                    }
                }
            } else {
                eprintln!("[OCR] ✗ 下载失败（可能是网络问题）");
            }
        }
        Err(e) => {
            eprintln!("[OCR] ✗ 执行curl失败: {:?}", e);
        }
    }
}

/// 初始化或获取 Tesseract API
fn with_tesseract<F, R>(f: F) -> Option<R>
where
    F: FnOnce(&TesseractAPI) -> Option<R>,
{
    let mut guard = TESSERACT_API.lock().ok()?;
    
    // 如果还没初始化，先初始化
    if guard.is_none() {
        eprintln!("[OCR] Initializing Tesseract...");
        let api = TesseractAPI::new();
        let tessdata_dir = get_tessdata_dir();
        
        eprintln!("[OCR] Tessdata dir: {:?}", tessdata_dir);
        
        // 确保中文训练数据存在
        ensure_chi_sim_traineddata(&tessdata_dir);
        
        let tessdata_str = match tessdata_dir.to_str() {
            Some(s) => s,
            None => {
                eprintln!("[OCR] Failed to convert tessdata path to string");
                return None;
            }
        };
        
        eprintln!("[OCR] Attempting to init with tessdata: {}", tessdata_str);
        
        // 尝试初始化，优先使用中文
        let init_result = api.init(tessdata_str, "chi_sim")
            .or_else(|e| {
                eprintln!("[OCR] Failed to init with chi_sim: {:?}", e);
                api.init(tessdata_str, "eng")
            })
            .or_else(|e| {
                eprintln!("[OCR] Failed to init with eng: {:?}", e);
                api.init(tessdata_str, "chi_sim+eng")
            });
        
        match init_result {
            Ok(_) => {
                eprintln!("[OCR] Tesseract initialized successfully");
                
                // 设置OCR参数以提高中文识别率
                let _ = api.set_variable("tessedit_char_whitelist", "");
                let _ = api.set_variable("language_model_penalty_non_dict_word", "0.5");
                let _ = api.set_variable("language_model_penalty_non_freq_dict_word", "0.5");
                
                *guard = Some(api);
            }
            Err(e) => {
                eprintln!("[OCR] Tesseract init failed: {:?}", e);
                return None;
            }
        }
    }
    
    guard.as_ref().and_then(f)
}

/// 对图片进行 OCR 识别
fn ocr_image(image_path: &PathBuf) -> OcrResult {
    // 加载图片
    let img = match image::open(image_path) {
        Ok(img) => img,
        Err(e) => {
            return OcrResult {
                text: format!("加载图片失败: {}", e),
                success: false,
            };
        }
    };
    
    // 转换为灰度图并增强对比度
    let gray = img.to_luma8();
    
    // 简单的对比度增强：拉伸直方图
    let mut min_val = 255u8;
    let mut max_val = 0u8;
    for pixel in gray.pixels() {
        let val = pixel[0];
        if val < min_val { min_val = val; }
        if val > max_val { max_val = val; }
    }
    
    let range = max_val.saturating_sub(min_val).max(1) as f32;
    let enhanced = image::ImageBuffer::from_fn(gray.width(), gray.height(), |x, y| {
        let val = gray.get_pixel(x, y)[0];
        let normalized = ((val.saturating_sub(min_val) as f32 / range) * 255.0) as u8;
        image::Luma([normalized])
    });
    
    // 转换为RGB供tesseract使用
    let rgb = image::DynamicImage::ImageLuma8(enhanced).to_rgb8();
    let (width, height) = rgb.dimensions();
    let image_data = rgb.into_raw();
    
    let result = with_tesseract(|api| {
        // 设置图片
        if let Err(e) = api.set_image(
            &image_data,
            width as i32,
            height as i32,
            3,  // bytes per pixel (RGB)
            (width * 3) as i32,  // bytes per line
        ) {
            eprintln!("[OCR] 设置图片失败: {:?}", e);
            return None;
        }
        
        // 获取识别结果
        match api.get_utf8_text() {
            Ok(text) => Some(text),
            Err(e) => {
                eprintln!("[OCR] 获取文字失败: {:?}", e);
                None
            }
        }
    });
    
    match result {
        Some(text) => {
            eprintln!("[OCR] 识别结果: {}", text.chars().take(100).collect::<String>());
            OcrResult {
                text,
                success: true,
            }
        }
        None => {
            eprintln!("[OCR] Tesseract API 调用失败 - 可能未初始化或初始化失败");
            OcrResult {
                text: "OCR 识别失败 - Tesseract未就绪".to_string(),
                success: false,
            }
        }
    }
}

/// 对设备截图进行 OCR 识别
pub fn ocr_screen(device: &str) -> OcrResult {
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_temp.png");
    
    // 截图
    let output = match create_command(&adb_path)
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

    // Fix Windows line ending corruption in PNG binary data
    // screencap -p on Windows converts \n (0x0A) to \r\n (0x0D 0x0A)
    let fixed_data = if cfg!(target_os = "windows") {
        output.stdout.iter()
            .enumerate()
            .filter(|(i, &byte)| {
                // Remove \r (0x0D) that appears before \n (0x0A)
                !(byte == 0x0D && output.stdout.get(i + 1) == Some(&0x0A))
            })
            .map(|(_, &byte)| byte)
            .collect::<Vec<u8>>()
    } else {
        output.stdout
    };

    if let Err(e) = fs::write(&temp_png, &fixed_data) {
        return OcrResult {
            text: format!("保存截图失败: {}", e),
            success: false,
        };
    }

    // 调试：保存一份副本到用户可见的位置
    #[cfg(debug_assertions)]
    {
        let debug_path = std::env::temp_dir().join("pico_ocr_debug.png");
        let _ = fs::copy(&temp_png, &debug_path);
        eprintln!("[OCR] 调试截图已保存到: {:?}", debug_path);
    }

    let result = ocr_image(&temp_png);
    let _ = fs::remove_file(&temp_png);
    result
}

/// 检测是否在新人榜页面（通过 OCR）
/// 返回 (is_on_page, ocr_text) 用于调试
pub fn is_on_newbie_list_debug(device: &str) -> (bool, String) {
    let result = ocr_screen(device);
    if !result.success {
        eprintln!("[OCR] 新星榜检测失败: {}", result.text);
        return (false, result.text);
    }

    let text = &result.text;
    
    // 检测多种可能的关键词（更宽松的匹配）
    // 包括可能的OCR误识别
    let keywords = [
        "新星", "萌新", "用户榜", "刷新", "发现新用户",
        "新用户", "榜单", "用户", "新人", "星榜",
        // 可能的误识别
        "新 星", "用 户", "榜 单"
    ];
    
    let is_match = keywords.iter().any(|&keyword| text.contains(keyword));
    
    eprintln!("[OCR] 新星榜检测: {} - 文字: {}", 
        if is_match { "匹配" } else { "不匹配" }, 
        text.chars().take(200).collect::<String>()
    );
    
    (is_match, result.text.clone())
}

/// 在屏幕上查找指定文字的位置（返回中心坐标）
/// 使用 TSV 输出获取文字边界框
pub fn find_text_position(device: &str, target_text: &str) -> Option<(i32, i32)> {
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_find.png");
    
    // 截图
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
    
    // 加载图片
    let img = image::open(&temp_png).ok()?.to_rgb8();
    let (width, height) = img.dimensions();
    let image_data = img.into_raw();
    
    let result = with_tesseract(|api| {
        // 设置图片
        api.set_image(
            &image_data,
            width as i32,
            height as i32,
            3,
            (width * 3) as i32,
        ).ok()?;
        
        // 获取 TSV 输出（包含边界框信息）
        let tsv = api.get_tsv_text(0).ok()?;
        
        // 收集所有词及其位置
        let mut words: Vec<(String, i32, i32, i32, i32)> = Vec::new();
        for line in tsv.lines().skip(1) {
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
        
        eprintln!("[OCR] 查找 '{}' - 识别到 {} 个词", target_text, words.len());
        
        // 调试：打印所有识别到的词
        if words.len() > 0 {
            eprintln!("[OCR] 识别到的词: {:?}", 
                words.iter().take(20).map(|(w, _, _, _, _)| w.as_str()).collect::<Vec<_>>());
        }
        
        // 首先尝试精确匹配
        for (text, left, top, w, h) in &words {
            if text.contains(target_text) {
                let center_x = left + w / 2;
                let center_y = top + h / 2;
                eprintln!("[OCR] 精确匹配 '{}' 在 ({}, {})", target_text, center_x, center_y);
                return Some((center_x, center_y));
            }
        }
        
        // 尝试模糊匹配（处理OCR误识别）
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
                            eprintln!("[OCR] 模糊匹配 '{}' (识别为 '{}') 在 ({}, {})", 
                                target_text, text, center_x, center_y);
                            return Some((center_x, center_y));
                        }
                    }
                }
            }
        }
        
        // 如果目标是多字符，尝试查找相邻的字符组合
        let target_chars: Vec<char> = target_text.chars().collect();
        if target_chars.len() > 1 {
            for i in 0..words.len() {
                // 检查是否从位置i开始能匹配目标的所有字符
                let mut matched = true;
                let mut last_right = 0i32;
                let mut first_match: Option<(i32, i32, i32, i32)> = None;
                
                for (j, target_char) in target_chars.iter().enumerate() {
                    if i + j >= words.len() {
                        matched = false;
                        break;
                    }
                    let (ref word, left, top, w, h) = words[i + j];
                    
                    // 检查这个词是否包含目标字符
                    if !word.contains(*target_char) {
                        matched = false;
                        break;
                    }
                    
                    // 检查是否相邻（水平距离小于50像素）
                    if j > 0 && (left - last_right).abs() > 50 {
                        matched = false;
                        break;
                    }
                    
                    if first_match.is_none() {
                        first_match = Some((left, top, w, h));
                    }
                    last_right = left + w;
                }
                
                if matched {
                    if let Some((left, top, w, h)) = first_match {
                        // 使用第一个匹配字符的位置，但考虑整个词组的宽度
                        let total_width = last_right - left;
                        let center_x = left + total_width / 2;
                        let center_y = top + h / 2;
                        eprintln!("[OCR] 组合匹配 '{}' 在 ({}, {})", target_text, center_x, center_y);
                        return Some((center_x, center_y));
                    }
                }
            }
        }
        
        eprintln!("[OCR] 未找到 '{}'", target_text);
        None
    });
    
    let _ = fs::remove_file(&temp_png);
    result
}
