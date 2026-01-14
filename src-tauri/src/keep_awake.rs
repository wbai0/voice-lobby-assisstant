//! 跨平台防休眠模块
//! 支持 macOS (caffeinate) 和 Windows (SetThreadExecutionState)

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
use std::process::{Child, Command};

#[cfg(target_os = "windows")]
use windows::Win32::System::Power::{
    SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
};

static IS_AWAKE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
static CAFFEINATE_PID: std::sync::Mutex<Option<Child>> = std::sync::Mutex::new(None);

/// 开启防休眠
#[tauri::command]
pub fn cmd_keep_awake_start() -> Result<String, String> {
    if IS_AWAKE.load(Ordering::SeqCst) {
        return Ok("已经处于防休眠状态".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let child = Command::new("caffeinate")
            .arg("-d") // 阻止显示器休眠
            .arg("-i") // 阻止系统空闲休眠
            .spawn()
            .map_err(|e| format!("启动 caffeinate 失败: {}", e))?;

        let mut guard = CAFFEINATE_PID.lock().unwrap();
        *guard = Some(child);
    }

    #[cfg(target_os = "windows")]
    {
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        }
    }

    IS_AWAKE.store(true, Ordering::SeqCst);
    Ok("防休眠已开启".to_string())
}

/// 关闭防休眠
#[tauri::command]
pub fn cmd_keep_awake_stop() -> Result<String, String> {
    if !IS_AWAKE.load(Ordering::SeqCst) {
        return Ok("防休眠未开启".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let mut guard = CAFFEINATE_PID.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }

    #[cfg(target_os = "windows")]
    {
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }

    IS_AWAKE.store(false, Ordering::SeqCst);
    Ok("防休眠已关闭".to_string())
}

/// 获取防休眠状态
#[tauri::command]
pub fn cmd_keep_awake_status() -> bool {
    IS_AWAKE.load(Ordering::SeqCst)
}
