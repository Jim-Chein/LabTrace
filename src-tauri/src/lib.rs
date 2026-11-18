use std::path::PathBuf;
use tauri::Manager;

fn attachments_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn stored_path(app: &tauri::AppHandle, stored_name: &str) -> Result<PathBuf, String> {
    if stored_name.is_empty()
        || stored_name.contains("..")
        || stored_name.contains('/')
        || stored_name.contains('\\')
    {
        return Err("invalid attachment name".into());
    }
    Ok(attachments_dir(app)?.join(stored_name))
}

#[tauri::command]
fn write_attachment(app: tauri::AppHandle, stored_name: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = stored_path(&app, &stored_name)?;
    std::fs::write(path, bytes).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_attachment(app: tauri::AppHandle, stored_name: String) -> Result<Vec<u8>, String> {
    let path = stored_path(&app, &stored_name)?;
    std::fs::read(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_attachment(app: tauri::AppHandle, stored_name: String, dest: String) -> Result<(), String> {
    let path = stored_path(&app, &stored_name)?;
    std::fs::copy(path, dest).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_attachment_file(app: tauri::AppHandle, stored_name: String) -> Result<(), String> {
    let path = stored_path(&app, &stored_name)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            write_attachment,
            read_attachment,
            export_attachment,
            remove_attachment_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running LabTrace");
}
