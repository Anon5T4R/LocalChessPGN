mod edit;
mod library;
mod pgn;
mod write;

use std::sync::Mutex;

use tauri::Manager;

use library::{Db, IndexCancel};

fn open_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            open_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Db(Mutex::new(None)))
        .manage(IndexCancel::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = library::open_db(&dir.join("library.db")).map_err(std::io::Error::other)?;
            *app.state::<Db>().0.lock().unwrap() = Some(conn);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pgn::parse_pgn_text,
            pgn::parse_pgn_file,
            edit::legal_moves_from,
            edit::apply_move,
            write::save_pgn_file,
            library::index::add_pgn_files,
            library::index::cancel_indexing,
            library::index::clear_library,
            library::search::list_library_games,
            library::search::open_library_game,
            library::search::remove_library_game,
            library::search::search_position,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
