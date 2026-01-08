use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct AppState {
    pub connected_device: Mutex<Option<String>>,
    pub connected_port: Mutex<Option<u16>>,
    pub logs: Arc<Mutex<Vec<String>>>,
    pub auto_message_running: Arc<Mutex<bool>>,
    pub auto_message_processed: Arc<Mutex<usize>>,
    pub auto_message_total: Arc<Mutex<usize>>,
    pub is_admin: Mutex<bool>,
    /// Cached screen size (width, height) - fetched once on device connect
    pub screen_size: Mutex<Option<(i32, i32)>>,
    /// Session ID to distinguish between different runs
    /// When stop is called, session_id is incremented, so old threads know to exit
    pub session_id: Arc<Mutex<u64>>,
    /// Current detected page type (updated during auto message)
    pub current_page: Arc<Mutex<String>>,
    /// Whether OCR is currently running
    pub ocr_in_progress: Arc<Mutex<bool>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connected_device: Mutex::new(None),
            connected_port: Mutex::new(None),
            logs: Arc::new(Mutex::new(Vec::new())),
            auto_message_running: Arc::new(Mutex::new(false)),
            auto_message_processed: Arc::new(Mutex::new(0)),
            auto_message_total: Arc::new(Mutex::new(0)),
            is_admin: Mutex::new(false),
            screen_size: Mutex::new(None),
            session_id: Arc::new(Mutex::new(0)),
            current_page: Arc::new(Mutex::new("unknown".to_string())),
            ocr_in_progress: Arc::new(Mutex::new(false)),
        }
    }
}

impl AppState {
    pub fn add_log(&self, msg: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        let log_entry = format!("[{}] {}", timestamp, msg);
        let mut logs = self.logs.lock().unwrap();
        logs.push(log_entry);
        // Keep only last 200 logs
        if logs.len() > 200 {
            logs.remove(0);
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct AutoMessageStatus {
    pub running: bool,
    pub processed: usize,
    pub total: usize,
    pub current_page: String,
    pub ocr_in_progress: bool,
}

// Log commands
#[tauri::command]
pub fn cmd_get_logs(count: Option<usize>, state: State<'_, AppState>) -> Vec<String> {
    let logs = state.logs.lock().unwrap();
    let n = count.unwrap_or(50).min(logs.len());
    logs.iter().rev().take(n).cloned().collect()
}

#[tauri::command]
pub fn cmd_clear_logs(state: State<'_, AppState>) {
    state.logs.lock().unwrap().clear();
}

#[tauri::command]
pub fn cmd_set_admin(is_admin: bool, state: State<'_, AppState>) {
    *state.is_admin.lock().unwrap() = is_admin;
}
