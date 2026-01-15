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
    #[allow(unused_mut)]
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
        eprintln!("[OCR] exe路径: {:?}", exe_path);
        
        #[cfg(target_os = "windows")]
        {
            // Windows MSI 安装后: C:\Program Files\Pico Live Assistant\pico-live-assistant.exe
            // resources 在: C:\Program Files\Pico Live Assistant\tessdata\
            if let Some(exe_dir) = exe_path.parent() {
                eprintln!("[OCR] exe目录: {:?}", exe_dir);
                
                // 尝试 exe 同目录
                let bundled_tessdata = exe_dir.join("tessdata");
                eprintln!("[OCR] 检查路径: {:?}", bundled_tessdata);
                if bundled_tessdata.exists() {
                    // 尝试转换为短路径（8.3格式）以避免中文路径问题
                    let final_path = get_short_path(&bundled_tessdata).unwrap_or(bundled_tessdata);
                    eprintln!("[OCR] ✓ 使用打包的tessdata: {:?}", final_path);
                    return final_path;
                }
                
                // 尝试 resources 子目录 (某些打包方式)
                let resources_tessdata = exe_dir.join("resources").join("tessdata");
                eprintln!("[OCR] 检查路径: {:?}", resources_tessdata);
                if resources_tessdata.exists() {
                    let final_path = get_short_path(&resources_tessdata).unwrap_or(resources_tessdata);
                    eprintln!("[OCR] ✓ 使用resources下的tessdata: {:?}", final_path);
                    return final_path;
                }
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS 打包后: App.app/Contents/MacOS/app -> App.app/Contents/Resources/tessdata
            // 先检查打包路径（优先级最高）
            let bundled_tessdata = exe_path
                .parent() // MacOS
                .and_then(|p| p.parent()) // Contents
                .map(|p| p.join("Resources").join("tessdata"));
            if let Some(path) = bundled_tessdata {
                eprintln!("[OCR] 检查打包路径: {:?}", path);
                if path.exists() {
                    eprintln!("[OCR] ✓ 使用打包的tessdata: {:?}", path);
                    return path;
                }
            }
            
            // 开发模式: target/debug/xxx -> src-tauri/resources/tessdata
            // 只有当不在 .app bundle 内时才检查开发模式
            let exe_path_str = exe_path.to_string_lossy();
            let is_in_app_bundle = exe_path_str.contains(".app/Contents/MacOS");
            
            if !is_in_app_bundle {
                // exe_path: /path/to/project/src-tauri/target/debug/pico-live-assistant
                if let Some(debug_dir) = exe_path.parent() { // debug
                    if let Some(target_dir) = debug_dir.parent() { // target
                        if let Some(src_tauri_dir) = target_dir.parent() { // src-tauri
                            let dev_tessdata = src_tauri_dir.join("resources").join("tessdata");
                            eprintln!("[OCR] 检查开发模式路径: {:?}", dev_tessdata);
                            if dev_tessdata.exists() {
                                eprintln!("[OCR] ✓ 使用开发模式tessdata: {:?}", dev_tessdata);
                                return dev_tessdata;
                            }
                        }
                    }
                }
            }
        }
    }
    
    eprintln!("[OCR] ⚠ 未找到打包的tessdata，降级到用户目录");
    
    // 降级到用户目录 - 使用短路径避免中文路径问题
    #[cfg(target_os = "windows")]
    {
        // 优先使用 ProgramData (通常是 C:\ProgramData，不含中文)
        if let Ok(programdata) = std::env::var("ProgramData") {
            let path = PathBuf::from(programdata)
                .join("pico-assistant")
                .join("tessdata");
            eprintln!("[OCR] 使用ProgramData目录: {:?}", path);
            return path;
        }
        // 备选：APPDATA (可能包含中文用户名)
        if let Ok(appdata) = std::env::var("APPDATA") {
            let path = PathBuf::from(appdata)
                .join("pico-assistant")
                .join("tessdata");
            eprintln!("[OCR] 使用APPDATA目录: {:?}", path);
            return path;
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let path = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("pico-assistant")
                .join("tessdata");
            eprintln!("[OCR] 使用用户目录: {:?}", path);
            return path;
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let path = PathBuf::from(home)
                .join(".pico-assistant")
                .join("tessdata");
            eprintln!("[OCR] 使用用户目录: {:?}", path);
            return path;
        }
    }
    
    eprintln!("[OCR] 使用当前目录: tessdata");
    PathBuf::from("tessdata")
}

/// Windows: 获取短路径（8.3格式）以避免中文路径问题
#[cfg(target_os = "windows")]
fn get_short_path(path: &PathBuf) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    
    // 转换为宽字符
    let wide_path: Vec<u16> = path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    
    // 获取短路径长度
    let len = unsafe {
        windows::Win32::Storage::FileSystem::GetShortPathNameW(
            windows::core::PCWSTR::from_raw(wide_path.as_ptr()),
            None,
        )
    };
    
    if len == 0 {
        eprintln!("[OCR] GetShortPathNameW 失败，使用原路径");
        return None;
    }
    
    // 获取短路径
    let mut short_path: Vec<u16> = vec![0; len as usize];
    let result = unsafe {
        windows::Win32::Storage::FileSystem::GetShortPathNameW(
            windows::core::PCWSTR::from_raw(wide_path.as_ptr()),
            Some(&mut short_path),
        )
    };
    
    if result == 0 {
        eprintln!("[OCR] GetShortPathNameW 失败，使用原路径");
        return None;
    }
    
    // 移除末尾的 null
    short_path.truncate(result as usize);
    let short_os_string = OsString::from_wide(&short_path);
    let short_pathbuf = PathBuf::from(short_os_string);
    
    eprintln!("[OCR] 短路径转换: {:?} -> {:?}", path, short_pathbuf);
    Some(short_pathbuf)
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn get_short_path(_path: &PathBuf) -> Option<PathBuf> {
    None
}

/// 检查 chi_sim.traineddata 是否存在
fn ensure_chi_sim_traineddata(tessdata_dir: &PathBuf) {
    // 列出目录内容用于调试
    eprintln!("[OCR] 检查tessdata目录: {:?}", tessdata_dir);
    if tessdata_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(tessdata_dir) {
            eprintln!("[OCR] 目录内容:");
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    eprintln!("[OCR]   - {:?} ({} bytes)", entry.file_name(), metadata.len());
                }
            }
        }
    } else {
        eprintln!("[OCR] ⚠ tessdata目录不存在!");
    }
    
    let chi_sim_path = tessdata_dir.join("chi_sim.traineddata");
    
    // 检查文件是否存在且大小合理（至少1MB）
    if chi_sim_path.exists() {
        if let Ok(metadata) = fs::metadata(&chi_sim_path) {
            if metadata.len() > 1_000_000 {
                eprintln!("[OCR] ✓ chi_sim.traineddata 已存在: {:?} ({} bytes)", chi_sim_path, metadata.len());
                return;
            } else {
                eprintln!("[OCR] ⚠ chi_sim.traineddata 文件太小 ({} bytes)，可能损坏", metadata.len());
            }
        }
    } else {
        eprintln!("[OCR] ⚠ chi_sim.traineddata 不存在: {:?}", chi_sim_path);
        eprintln!("[OCR] 请确保应用正确安装，tessdata 应该已打包在应用内");
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
                    if let Some((left, top, _w, h)) = first_match {
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


/// 测试 OCR 功能 - 返回详细的诊断信息和识别结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrTestResult {
    pub success: bool,
    pub text: String,
    pub tessdata_path: String,
    pub tessdata_exists: bool,
    pub chi_sim_exists: bool,
    pub chi_sim_size: u64,
    pub init_error: Option<String>,
    pub diagnostics: Vec<String>,
}

/// Tauri 命令：测试 OCR
#[tauri::command]
pub fn cmd_test_ocr(state: tauri::State<'_, crate::AppState>) -> Result<OcrTestResult, String> {
    let mut diagnostics = Vec::new();
    
    // 显示 exe 路径
    if let Ok(exe_path) = std::env::current_exe() {
        diagnostics.push(format!("exe路径: {}", exe_path.display()));
        if let Some(exe_dir) = exe_path.parent() {
            diagnostics.push(format!("exe目录: {}", exe_dir.display()));
            
            // 检查 exe 目录下是否有 tessdata
            let bundled = exe_dir.join("tessdata");
            diagnostics.push(format!("打包tessdata路径: {} (存在: {})", bundled.display(), bundled.exists()));
        }
    }
    
    // 获取设备
    let device = {
        let guard = state.connected_device.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    
    let device = match device {
        Some(d) => d,
        None => {
            return Ok(OcrTestResult {
                success: false,
                text: "未连接设备".to_string(),
                tessdata_path: String::new(),
                tessdata_exists: false,
                chi_sim_exists: false,
                chi_sim_size: 0,
                init_error: Some("请先连接模拟器".to_string()),
                diagnostics: vec!["未连接设备".to_string()],
            });
        }
    };
    
    diagnostics.push(format!("设备: {}", device));
    
    // 检查 tessdata 路径
    let tessdata_dir = get_tessdata_dir();
    let tessdata_path = tessdata_dir.to_string_lossy().to_string();
    let tessdata_exists = tessdata_dir.exists();
    
    diagnostics.push(format!("tessdata路径: {}", tessdata_path));
    diagnostics.push(format!("tessdata存在: {}", tessdata_exists));
    
    // 检查 chi_sim.traineddata
    let chi_sim_path = tessdata_dir.join("chi_sim.traineddata");
    let chi_sim_exists = chi_sim_path.exists();
    let chi_sim_size = if chi_sim_exists {
        fs::metadata(&chi_sim_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    
    diagnostics.push(format!("chi_sim.traineddata存在: {}", chi_sim_exists));
    diagnostics.push(format!("chi_sim.traineddata大小: {} bytes", chi_sim_size));
    
    // 列出 tessdata 目录内容
    if tessdata_exists {
        if let Ok(entries) = fs::read_dir(&tessdata_dir) {
            diagnostics.push("tessdata目录内容:".to_string());
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    diagnostics.push(format!("  - {:?} ({} bytes)", entry.file_name(), metadata.len()));
                }
            }
        }
    }
    
    // 尝试初始化 Tesseract
    let init_error = {
        let mut guard = TESSERACT_API.lock().map_err(|e| e.to_string())?;
        
        // 强制重新初始化以获取错误信息
        *guard = None;
        
        let api = TesseractAPI::new();
        let tessdata_str = match tessdata_dir.to_str() {
            Some(s) => s,
            None => {
                return Ok(OcrTestResult {
                    success: false,
                    text: "tessdata路径包含无效字符".to_string(),
                    tessdata_path,
                    tessdata_exists,
                    chi_sim_exists,
                    chi_sim_size,
                    init_error: Some("路径转换失败".to_string()),
                    diagnostics,
                });
            }
        };
        
        diagnostics.push(format!("尝试初始化 Tesseract，路径: {}", tessdata_str));
        
        match api.init(tessdata_str, "chi_sim") {
            Ok(_) => {
                diagnostics.push("✓ Tesseract 初始化成功 (chi_sim)".to_string());
                *guard = Some(api);
                None
            }
            Err(e) => {
                let err_msg = format!("{:?}", e);
                diagnostics.push(format!("✗ chi_sim 初始化失败: {}", err_msg));
                
                // 尝试 eng
                match api.init(tessdata_str, "eng") {
                    Ok(_) => {
                        diagnostics.push("✓ Tesseract 初始化成功 (eng fallback)".to_string());
                        *guard = Some(api);
                        None
                    }
                    Err(e2) => {
                        let err_msg2 = format!("{:?}", e2);
                        diagnostics.push(format!("✗ eng 初始化也失败: {}", err_msg2));
                        Some(format!("chi_sim: {}, eng: {}", err_msg, err_msg2))
                    }
                }
            }
        }
    };
    
    // 如果初始化失败，返回诊断信息
    if init_error.is_some() {
        return Ok(OcrTestResult {
            success: false,
            text: "Tesseract 初始化失败".to_string(),
            tessdata_path,
            tessdata_exists,
            chi_sim_exists,
            chi_sim_size,
            init_error,
            diagnostics,
        });
    }
    
    // 执行 OCR 测试
    diagnostics.push("开始截图并识别...".to_string());
    
    let result = ocr_screen(&device);
    
    diagnostics.push(format!("OCR 结果: success={}", result.success));
    
    // 添加日志
    {
        let mut logs = state.logs.lock().map_err(|e| e.to_string())?;
        for diag in &diagnostics {
            logs.push(format!("[OCR测试] {}", diag));
        }
        if result.success {
            // 显示识别到的文字（限制长度）
            let preview: String = result.text.chars().take(500).collect();
            logs.push(format!("[OCR测试] 识别文字: {}", preview.replace('\n', " | ")));
        } else {
            logs.push(format!("[OCR测试] 识别失败: {}", result.text));
        }
    }
    
    Ok(OcrTestResult {
        success: result.success,
        text: result.text,
        tessdata_path,
        tessdata_exists,
        chi_sim_exists,
        chi_sim_size,
        init_error,
        diagnostics,
    })
}
