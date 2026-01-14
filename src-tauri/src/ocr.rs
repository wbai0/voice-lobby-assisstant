//! 跨平台 OCR 模块
//! 使用 tesseract-rs 进行 OCR，支持 macOS 和 Windows

use crate::adb;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tesseract_rs::TesseractAPI;

/// 全局 Tesseract API 实例（懒加载）
static TESSERACT_API: Mutex<Option<TesseractAPI>> = Mutex::new(None);

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
    // tesseract-rs 默认下载 tessdata 到以下位置
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
    if chi_sim_path.exists() {
        return;
    }
    
    // 创建目录
    let _ = fs::create_dir_all(tessdata_dir);
    
    // 下载 chi_sim.traineddata (fast version, ~2.4MB)
    let url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata";
    
    if let Ok(output) = Command::new("curl")
        .args(["-L", "-o", chi_sim_path.to_str().unwrap_or(""), url])
        .output()
    {
        if output.status.success() {
            eprintln!("Downloaded chi_sim.traineddata");
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
        let api = TesseractAPI::new();
        let tessdata_dir = get_tessdata_dir();
        
        // 确保中文训练数据存在
        ensure_chi_sim_traineddata(&tessdata_dir);
        
        let tessdata_str = match tessdata_dir.to_str() {
            Some(s) => s,
            None => return None,
        };
        
        // 尝试初始化，优先使用中文+英文
        let init_result = api.init(tessdata_str, "chi_sim+eng")
            .or_else(|_| api.init(tessdata_str, "chi_sim"))
            .or_else(|_| api.init(tessdata_str, "eng"));
        
        if init_result.is_ok() {
            *guard = Some(api);
        } else {
            eprintln!("Tesseract init failed");
            return None;
        }
    }
    
    guard.as_ref().and_then(f)
}

/// 对图片进行 OCR 识别
fn ocr_image(image_path: &PathBuf) -> OcrResult {
    // 加载图片
    let img = match image::open(image_path) {
        Ok(img) => img.to_rgb8(),
        Err(e) => {
            return OcrResult {
                text: format!("加载图片失败: {}", e),
                success: false,
            };
        }
    };
    
    let (width, height) = img.dimensions();
    let image_data = img.into_raw();
    
    let result = with_tesseract(|api| {
        // 设置图片
        if api.set_image(
            &image_data,
            width as i32,
            height as i32,
            3,  // bytes per pixel (RGB)
            (width * 3) as i32,  // bytes per line
        ).is_err() {
            return None;
        }
        
        // 获取识别结果
        api.get_utf8_text().ok()
    });
    
    match result {
        Some(text) => OcrResult {
            text,
            success: true,
        },
        None => OcrResult {
            text: "OCR 识别失败".to_string(),
            success: false,
        },
    }
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

    let result = ocr_image(&temp_png);
    let _ = fs::remove_file(&temp_png);
    result
}

/// 检测是否在新人榜页面（通过 OCR）
/// 返回 (is_on_page, ocr_text) 用于调试
pub fn is_on_newbie_list_debug(device: &str) -> (bool, String) {
    let result = ocr_screen(device);
    if !result.success {
        return (false, result.text);
    }

    let text = &result.text;
    // 检测多种可能的关键词（Tesseract 可能识别出不同的文字）
    let is_match = text.contains("新星") 
        || text.contains("萌新") 
        || text.contains("用户榜")
        || text.contains("刷新")
        || text.contains("发现新用户");
    
    (is_match, result.text.clone())
}

/// 在屏幕上查找指定文字的位置（返回中心坐标）
/// 使用 TSV 输出获取文字边界框
pub fn find_text_position(device: &str, target_text: &str) -> Option<(i32, i32)> {
    let adb_path = adb::get_adb_path_public();
    let temp_png = get_temp_path("pico_ocr_find.png");
    
    // 截图
    let output = Command::new(&adb_path)
        .args(["-s", device, "shell", "screencap", "-p"])
        .output()
        .ok()?;

    if output.stdout.is_empty() {
        return None;
    }

    fs::write(&temp_png, &output.stdout).ok()?;
    
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
        
        // 解析 TSV 查找目标文字
        for line in tsv.lines().skip(1) {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() >= 12 {
                let text = cols[11];
                if text.contains(target_text) {
                    // 列: level, page_num, block_num, par_num, line_num, word_num, left, top, width, height, conf, text
                    let left: i32 = cols[6].parse().ok()?;
                    let top: i32 = cols[7].parse().ok()?;
                    let w: i32 = cols[8].parse().ok()?;
                    let h: i32 = cols[9].parse().ok()?;
                    
                    let center_x = left + w / 2;
                    let center_y = top + h / 2;
                    return Some((center_x, center_y));
                }
            }
        }
        None
    });
    
    let _ = fs::remove_file(&temp_png);
    result
}
