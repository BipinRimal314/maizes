/// Journey to Maizy, as a desktop program.
///
/// The game itself is unchanged — the same static bundle the browser runs. This
/// exists to give it a window, a real save file, and something to double-click.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The save lives in the OS's app-data directory rather than in the
        // webview's localStorage, which is tied to an origin and can be cleared
        // out from under the player by the webview itself.
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Maizes");
}
