mod state;
mod adb;
mod auto_message;
mod keep_awake;
mod ocr;

pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // ADB commands
            adb::cmd_adb_connect,
            adb::cmd_adb_disconnect,
            adb::cmd_adb_status,
            adb::cmd_adb_scan_instances,
            adb::cmd_adb_get_info,
            adb::cmd_adb_set_path,
            adb::cmd_detect_page,
            // Auto message commands
            auto_message::cmd_start,
            auto_message::cmd_stop,
            auto_message::cmd_status,
            auto_message::cmd_test_in_chat,
            // Logs & state
            state::cmd_get_logs,
            state::cmd_clear_logs,
            state::cmd_set_admin,
            // Keep awake
            keep_awake::cmd_keep_awake_start,
            keep_awake::cmd_keep_awake_stop,
            keep_awake::cmd_keep_awake_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
