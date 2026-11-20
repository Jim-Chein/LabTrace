use std::path::{Path, PathBuf};
use std::process::Command;
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

fn attachment_name_ok(name: &str) -> bool {
    !name.is_empty() && !name.contains("..") && !name.contains('/') && !name.contains('\\')
}

fn stored_path(app: &tauri::AppHandle, stored_name: &str) -> Result<PathBuf, String> {
    if !attachment_name_ok(stored_name) {
        return Err("invalid attachment name".into());
    }
    Ok(attachments_dir(app)?.join(stored_name))
}

/// Absolute local path only. URLs, relative paths, and control characters are rejected.
fn inspect_local_path(input: &str) -> Result<(), String> {
    if input.is_empty() || input.len() > 32_768 || input.chars().any(|ch| ch.is_control()) {
        return Err("invalid path".into());
    }
    if input.contains("://") || has_scheme(input) {
        return Err("invalid path".into());
    }
    if is_windows_drive(input) || is_unc(input) || is_posix_absolute(input) {
        return Ok(());
    }
    Err("invalid path".into())
}

fn has_scheme(input: &str) -> bool {
    let Some(index) = input.find(':') else {
        return false;
    };
    if index == 1 && input.as_bytes()[0].is_ascii_alphabetic() {
        let next = input.as_bytes().get(2).copied();
        return next != Some(b'\\') && next != Some(b'/');
    }
    let prefix = &input[..index];
    let mut chars = prefix.chars();
    matches!(chars.next(), Some(ch) if ch.is_ascii_alphabetic())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '.' | '-'))
        && prefix.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '.' | '-'))
}

fn is_windows_drive(input: &str) -> bool {
    let bytes = input.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn is_unc(input: &str) -> bool {
    let Some(rest) = input.strip_prefix("\\\\") else {
        return false;
    };
    if rest.is_empty() || rest.starts_with('\\') {
        return false;
    }
    if let Some(extended) = rest.strip_prefix("?\\") {
        return is_windows_drive(extended) || extended.starts_with("UNC\\");
    }
    let mut parts = rest.split('\\').filter(|part| !part.is_empty());
    match (parts.next(), parts.next()) {
        (Some(server), Some(_)) if server != "." && server != "?" => true,
        _ => false,
    }
}

fn is_posix_absolute(input: &str) -> bool {
    input.starts_with('/') && !input.starts_with("//")
}

fn prepare_open(path: &str) -> Result<PathBuf, String> {
    inspect_local_path(path)?;
    let target = PathBuf::from(path);
    match std::fs::metadata(&target) {
        Ok(meta) if meta.is_file() => Ok(target),
        Ok(_) => Err("not a file".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err("missing".into()),
        Err(error) => Err(error.to_string()),
    }
}

enum Launch {
    Argv { program: &'static str, args: Vec<String> },
    /// Windows only. `ShellExecuteW`, not `cmd.exe`.
    #[cfg(target_os = "windows")]
    ShellExecute(String),
}

fn launch_plan(path: &str) -> Result<Launch, String> {
    let prepared = prepare_open(path)?;
    let text = prepared.into_os_string().into_string().map_err(|_| "invalid path".to_string())?;
    #[cfg(target_os = "windows")]
    {
        Ok(Launch::ShellExecute(text))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(Launch::Argv { program: "open", args: vec![text] })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(Launch::Argv { program: "xdg-open", args: vec![text] })
    }
}

fn reveal_invocation(path: &str) -> Result<(&'static str, Vec<String>), String> {
    inspect_local_path(path)?;
    #[cfg(target_os = "macos")]
    {
        Ok(("open", vec!["-R".to_string(), path.to_string()]))
    }
    #[cfg(target_os = "windows")]
    {
        Ok(("explorer", vec![format!("/select,{path}")]))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let parent = Path::new(path).parent().and_then(|item| item.to_str()).unwrap_or(path);
        Ok(("xdg-open", vec![parent.to_string()]))
    }
}

#[cfg(target_os = "windows")]
fn shell_execute(path: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    let file: Vec<u16> = OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let operation: Vec<u16> = OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut std::ffi::c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show_cmd: i32,
        ) -> isize;
    }
    // ShellExecuteW takes the path as a wide string. It does not go through cmd.exe.
    let code = unsafe {
        ShellExecuteW(std::ptr::null_mut(), operation.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), 1)
    };
    if code <= 32 { Err("open failed".into()) } else { Ok(()) }
}

fn spawn_argv(program: &str, args: &[String]) -> Result<(), String> {
    if program == "sh" || program == "cmd" || program == "cmd.exe" || args.iter().any(|arg| arg == "-c" || arg == "/c") {
        return Err("invalid path".into());
    }
    Command::new(program).args(args).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileStatus {
    exists: bool,
    is_file: bool,
    size: u64,
    modified_ms: u64,
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

/// Deletes an imported copy inside the app data directory. It cannot address an original file path.
#[tauri::command]
fn remove_attachment_file(app: tauri::AppHandle, stored_name: String) -> Result<(), String> {
    let path = stored_path(&app, &stored_name)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn local_file_status(path: String) -> Result<LocalFileStatus, String> {
    inspect_local_path(&path)?;
    match std::fs::metadata(&path) {
        Ok(meta) => {
            let modified_ms = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0);
            Ok(LocalFileStatus {
                exists: true,
                is_file: meta.is_file(),
                size: meta.len(),
                modified_ms,
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(LocalFileStatus {
            exists: false,
            is_file: false,
            size: 0,
            modified_ms: 0,
        }),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn open_local_file(path: String) -> Result<(), String> {
    match launch_plan(&path)? {
        Launch::Argv { program, args } => spawn_argv(program, &args),
        #[cfg(target_os = "windows")]
        Launch::ShellExecute(target) => shell_execute(&target),
    }
}

#[tauri::command]
fn reveal_local_file(path: String) -> Result<(), String> {
    inspect_local_path(&path)?;
    if !Path::new(&path).exists() {
        return Err("missing".into());
    }
    let (program, args) = reveal_invocation(&path)?;
    spawn_argv(program, &args)
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
            remove_attachment_file,
            local_file_status,
            open_local_file,
            reveal_local_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running LabTrace");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_unicode_spaces_and_windows_unc() {
        assert!(inspect_local_path("/Users/甲/实验 数据/结果.xlsx").is_ok());
        assert!(inspect_local_path(r"C:\实验 数据\结果.xlsx").is_ok());
        assert!(inspect_local_path("D:/lab/结果 文件.pzfx").is_ok());
        assert!(inspect_local_path(r"\\server\share\实验 a.xlsx").is_ok());
        assert!(inspect_local_path(r"\\?\C:\实验\a.xlsx").is_ok());
    }

    #[test]
    fn rejects_urls_relative_paths_and_controls() {
        for path in [
            "",
            "notes.xlsx",
            "./notes.xlsx",
            "../etc/passwd",
            r"..\windows\system32",
            "C:notes.xlsx",
            "file:///tmp/a.xlsx",
            "http://example.com/a.xlsx",
            "//server/share/a.xlsx",
            r"\\server",
            r"\\.\pipe",
            "/tmp/a\nname.xlsx",
            "javascript:alert(1)",
        ] {
            assert!(inspect_local_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn attachment_names_cannot_escape_the_app_directory() {
        assert!(attachment_name_ok("copy.xlsx"));
        assert!(!attachment_name_ok(""));
        assert!(!attachment_name_ok("../secret"));
        assert!(!attachment_name_ok("/tmp/a.xlsx"));
        assert!(!attachment_name_ok(r"C:\secret.xlsx"));
        assert!(!attachment_name_ok("nested/name.xlsx"));
    }

    #[test]
    fn missing_file_is_not_created() {
        let path = std::env::temp_dir().join("labtrace-不存在 的文件.xlsx");
        let _ = std::fs::remove_file(&path);
        let error = prepare_open(path.to_str().unwrap()).unwrap_err();
        assert_eq!(error, "missing");
        assert!(!path.exists());
    }

    #[test]
    fn directory_is_not_opened_or_modified() {
        let dir = std::env::temp_dir().join("labtrace-dir-样本");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("keep.txt");
        std::fs::write(&marker, b"stay").unwrap();
        let error = prepare_open(dir.to_str().unwrap()).unwrap_err();
        assert_eq!(error, "not a file");
        assert_eq!(std::fs::read(&marker).unwrap(), b"stay");
        let _ = std::fs::remove_file(&marker);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn open_plan_is_one_argument_without_a_shell() {
        let path = std::env::temp_dir().join("labtrace 样本;rm.xlsx");
        std::fs::write(&path, b"x").unwrap();
        let text = path.to_str().unwrap().to_string();
        let plan = launch_plan(&text).unwrap();
        match plan {
            Launch::Argv { program, args } => {
                assert!(program == "xdg-open" || program == "open");
                assert_ne!(program, "sh");
                assert_eq!(args, vec![text]);
            }
            #[cfg(target_os = "windows")]
            Launch::ShellExecute(target) => assert_eq!(target, text),
        }
        assert_eq!(std::fs::read(&path).unwrap(), b"x");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reveal_plan_does_not_use_a_shell() {
        let (program, args) = reveal_invocation("/tmp/实验 a;rm.xlsx").unwrap();
        assert!(matches!(program, "open" | "explorer" | "xdg-open"));
        assert!(program != "sh" && program != "cmd" && program != "cmd.exe");
        assert!(!args.iter().any(|arg| arg == "-c" || arg == "/c"));
    }
}
