use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{backup::Backup, Connection};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const FORMAT: &str = "labtrace-notebook-backup";
const VERSION: u32 = 1;
const MAX_ENTRY: u64 = 512 * 1024 * 1024;
const MAX_TOTAL: u64 = 2 * 1024 * 1024 * 1024;
const MAX_FILES: usize = 10_000;

#[derive(Clone, Copy)]
pub enum RestoreFault {
    None,
    FailBeforeAttachments,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub version: u32,
    pub attachment_count: u32,
    pub includes_external_files: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format: String,
    version: u32,
    includes_external_files: bool,
}

#[derive(Serialize, Deserialize)]
struct RecoveryList {
    stored_names: Vec<String>,
}

pub fn export_notebook(db_path: &Path, attachments_dir: &Path, dest_zip: &Path) -> Result<BackupInfo, String> {
    reject_control(dest_zip)?;
    if dest_zip == db_path {
        return Err("invalid-destination".into());
    }
    let parent = dest_zip.parent().ok_or("invalid-destination")?;
    let staging = parent.join(format!(".{}.partial", dest_zip.file_name().and_then(|n| n.to_str()).unwrap_or("backup")));
    let _ = fs::remove_file(&staging);
    let temp = tempfile_dir("labtrace-export")?;
    let snapshot = temp.join("notebook.db");
    copy_database(db_path, &snapshot)?;
    let names = stored_names(&snapshot)?;
    let mut files = Vec::new();
    for name in &names {
        let source = attachments_dir.join(name);
        if !source.exists() {
            continue;
        }
        let dest = temp.join("files").join(name);
        fs::create_dir_all(dest.parent().ok_or("invalid-attachment")?).map_err(|e| e.to_string())?;
        copy_regular_file(&source, &dest)?;
        files.push(name.clone());
    }
    let manifest = Manifest { format: FORMAT.into(), version: VERSION, includes_external_files: false };
    fs::write(temp.join("manifest.json"), serde_json::to_vec(&manifest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    write_zip(&temp, &files, &staging)?;
    fs::rename(&staging, dest_zip).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&temp);
    Ok(BackupInfo { version: VERSION, attachment_count: files.len() as u32, includes_external_files: false })
}

pub fn inspect_notebook(archive: &Path) -> Result<BackupInfo, String> {
    let temp = tempfile_dir("labtrace-inspect")?;
    let info = unpack_validated(archive, &temp)?;
    let _ = fs::remove_dir_all(&temp);
    Ok(info)
}

pub fn reconcile_restore(db_path: &Path, attachments_dir: &Path, recovery_dir: &Path) -> Result<(), String> {
    if !recovery_dir.join("PENDING").exists() {
        return Ok(());
    }
    if recovery_dir.join("READY").exists() {
        rollback_from_recovery(db_path, attachments_dir, recovery_dir)?;
    }
    let _ = fs::remove_dir_all(recovery_dir);
    Ok(())
}

pub fn restore_notebook(
    archive: &Path,
    db_path: &Path,
    attachments_dir: &Path,
    recovery_dir: &Path,
    fault: RestoreFault,
) -> Result<BackupInfo, String> {
    reconcile_restore(db_path, attachments_dir, recovery_dir)?;
    let staging = tempfile_dir("labtrace-restore")?;
    let info = unpack_validated(archive, &staging)?;
    let result = (|| {
        write_recovery(db_path, attachments_dir, recovery_dir)?;
        fs::write(recovery_dir.join("READY"), b"ready").map_err(|e| e.to_string())?;
        replace_database(&staging.join("notebook.db"), db_path)?;
        if matches!(fault, RestoreFault::FailBeforeAttachments) {
            return Err("forced-failure".into());
        }
        install_attachments(&staging, attachments_dir, recovery_dir)?;
        Ok(info)
    })();
    if result.is_err() {
        let rolled = rollback_from_recovery(db_path, attachments_dir, recovery_dir);
        let _ = fs::remove_dir_all(&staging);
        if rolled.is_err() {
            return Err(format!("rollback-failed:{}", recovery_dir.display()));
        }
        let _ = fs::remove_dir_all(recovery_dir);
        return result;
    }
    let _ = fs::remove_dir_all(recovery_dir);
    let _ = fs::remove_dir_all(&staging);
    result
}

fn write_recovery(db_path: &Path, attachments_dir: &Path, recovery_dir: &Path) -> Result<(), String> {
    let _ = fs::remove_dir_all(recovery_dir);
    fs::create_dir_all(recovery_dir.join("attachments")).map_err(|e| e.to_string())?;
    fs::write(recovery_dir.join("PENDING"), b"pending").map_err(|e| e.to_string())?;
    copy_database(db_path, &recovery_dir.join("notebook.db"))?;
    let names = if db_path.exists() { stored_names(db_path).unwrap_or_default() } else { Vec::new() };
    for name in &names {
        let source = attachments_dir.join(name);
        if source.exists() {
            copy_regular_file(&source, &recovery_dir.join("attachments").join(name))?;
        }
    }
    let list = RecoveryList { stored_names: names };
    fs::write(recovery_dir.join("attachments.json"), serde_json::to_vec(&list).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}

fn rollback_from_recovery(db_path: &Path, attachments_dir: &Path, recovery_dir: &Path) -> Result<(), String> {
    let recovery_db = recovery_dir.join("notebook.db");
    if recovery_db.exists() {
        replace_database(&recovery_db, db_path)?;
    }
    let list: RecoveryList = serde_json::from_slice(
        &fs::read(recovery_dir.join("attachments.json")).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;
    fs::create_dir_all(attachments_dir).map_err(|e| e.to_string())?;
    for name in &list.stored_names {
        safe_component(name)?;
        let source = recovery_dir.join("attachments").join(name);
        if source.exists() {
            copy_regular_file(&source, &attachments_dir.join(name))?;
        }
    }
    if let Ok(entries) = fs::read_dir(attachments_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if safe_component(&name).is_err() || list.stored_names.iter().any(|item| item == &name) {
                continue;
            }
            if entry.file_type().map(|kind| kind.is_file()).unwrap_or(false) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

fn install_attachments(staging: &Path, attachments_dir: &Path, recovery_dir: &Path) -> Result<(), String> {
    let list: RecoveryList = serde_json::from_slice(
        &fs::read(recovery_dir.join("attachments.json")).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;
    fs::create_dir_all(attachments_dir).map_err(|e| e.to_string())?;
    let staged = staging.join("files");
    let new_names = if staged.exists() { dir_names(&staged)? } else { Vec::new() };
    for name in &new_names {
        copy_regular_file(&staged.join(name), &attachments_dir.join(name))?;
    }
    for name in &list.stored_names {
        if new_names.iter().any(|item| item == name) {
            continue;
        }
        let path = attachments_dir.join(name);
        if path.is_file() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn unpack_validated(archive: &Path, dest: &Path) -> Result<BackupInfo, String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|_| "invalid-format".to_string())?;
    if zip.len() > MAX_FILES {
        return Err("too-large".into());
    }
    let mut total = 0u64;
    let mut saw_manifest = false;
    let mut saw_db = false;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|_| "invalid-format".to_string())?;
        if entry.is_dir() {
            continue;
        }
        let mode = entry.unix_mode().unwrap_or(0);
        if mode & 0o170000 == 0o120000 {
            return Err("symlink".into());
        }
        let name = entry.name().replace('\\', "/");
        if name.contains('\0') || entry.enclosed_name().is_none() {
            return Err("path-escape".into());
        }
        let rel = allowed_entry(&name)?;
        if entry.size() > MAX_ENTRY {
            return Err("too-large".into());
        }
        total = total.saturating_add(entry.size());
        if total > MAX_TOTAL {
            return Err("too-large".into());
        }
        let target = dest.join(&rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut output = OpenOptions::new().create_new(true).write(true).open(&target).map_err(|e| e.to_string())?;
        copy_limited(&mut entry, &mut output, MAX_ENTRY)?;
        if rel == Path::new("manifest.json") {
            saw_manifest = true;
        }
        if rel == Path::new("notebook.db") {
            saw_db = true;
        }
    }
    if !saw_manifest || !saw_db {
        return Err("invalid-format".into());
    }
    let manifest: Manifest = serde_json::from_slice(&fs::read(dest.join("manifest.json")).map_err(|e| e.to_string())?)
        .map_err(|_| "invalid-format".to_string())?;
    if manifest.format != FORMAT {
        return Err("invalid-format".into());
    }
    if manifest.version != VERSION {
        return Err("unsupported-version".into());
    }
    if manifest.includes_external_files {
        return Err("external-not-allowed".into());
    }
    validate_database(&dest.join("notebook.db"))?;
    let count = dir_names(&dest.join("files")).unwrap_or_default().len();
    Ok(BackupInfo { version: manifest.version, attachment_count: count as u32, includes_external_files: false })
}

fn allowed_entry(name: &str) -> Result<PathBuf, String> {
    if name == "manifest.json" || name == "notebook.db" {
        return Ok(PathBuf::from(name));
    }
    let rest = name.strip_prefix("attachments/").ok_or("invalid-format")?;
    safe_component(rest)?;
    Ok(Path::new("files").join(rest))
}

fn validate_database(path: &Path) -> Result<(), String> {
    let conn = open_read(path)?;
    let check: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if check != "ok" {
        return Err("invalid-format".into());
    }
    for required in ["folders", "experiments", "blocks", "attachments", "recents"] {
        let found: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [required],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if found != 1 {
            return Err("invalid-format".into());
        }
    }
    let mut stmt = conn.prepare("SELECT stored_name, source_path FROM attachments").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (stored, source) = row.map_err(|e| e.to_string())?;
        if !stored.is_empty() {
            safe_component(&stored)?;
        }
        if let Some(path) = source {
            if path.chars().any(|ch| ch.is_control()) || path.len() > 32_768 {
                return Err("invalid-format".into());
            }
        }
    }
    Ok(())
}

fn replace_database(source: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let from = open_read(source)?;
    if !dest.exists() {
        fs::write(dest, []).map_err(|e| e.to_string())?;
    }
    let to = open_write(dest)?;
    to.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let copied = (|| {
        for table in ["recents", "ignored", "todos", "attachments", "blocks", "experiments", "folders", "meta"] {
            if !table_exists(&from, table)? || !table_exists(&to, table)? {
                if table == "folders" || table == "experiments" || table == "blocks" || table == "attachments" || table == "recents" {
                    return Err("invalid-format".into());
                }
                continue;
            }
            let columns = shared_columns(&from, &to, table)?;
            if columns.is_empty() {
                continue;
            }
            to.execute(&format!("DELETE FROM {table}"), []).map_err(|e| e.to_string())?;
            let select = format!("SELECT {} FROM {table}", columns.join(", "));
            let mut stmt = from.prepare(&select).map_err(|e| e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            let placeholders = columns.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
            let insert = format!("INSERT INTO {table} ({}) VALUES ({placeholders})", columns.join(", "));
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let values = row_values(row, columns.len())?;
                to.execute(&insert, rusqlite::params_from_iter(values.iter())).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })();
    if copied.is_err() {
        let _ = to.execute_batch("ROLLBACK");
        return copied;
    }
    to.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    let _ = to.execute_batch("PRAGMA wal_checkpoint(PASSIVE)");
    Ok(())
}

fn row_values(row: &rusqlite::Row<'_>, count: usize) -> Result<Vec<rusqlite::types::Value>, String> {
    let mut values = Vec::with_capacity(count);
    for index in 0..count {
        values.push(row.get(index).map_err(|e| e.to_string())?);
    }
    Ok(values)
}

fn shared_columns(from: &Connection, to: &Connection, table: &str) -> Result<Vec<String>, String> {
    let source = columns_of(from, table)?;
    let dest = columns_of(to, table)?;
    Ok(source.into_iter().filter(|name| dest.iter().any(|item| item == name)).collect())
}

fn columns_of(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    let found: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    Ok(found == 1)
}

fn stored_names(db_path: &Path) -> Result<Vec<String>, String> {
    let conn = open_read(db_path)?;
    if !table_exists(&conn, "attachments")? {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare("SELECT stored_name FROM attachments").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        if name.is_empty() {
            continue;
        }
        safe_component(&name)?;
        names.push(name);
    }
    Ok(names)
}

fn copy_database(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(to);
    let src = open_read(from)?;
    let mut dst = Connection::open(to).map_err(|e| e.to_string())?;
    let backup = Backup::new(&src, &mut dst).map_err(|e| e.to_string())?;
    for _ in 0..10_000 {
        match backup.step(64).map_err(|e| e.to_string())? {
            rusqlite::backup::StepResult::Done => return Ok(()),
            _ => std::thread::sleep(Duration::from_millis(5)),
        }
    }
    Err("backup-busy".into())
}

fn write_zip(root: &Path, files: &[String], dest: &Path) -> Result<(), String> {
    let file = File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    write_zip_file(&mut zip, &root.join("manifest.json"), "manifest.json", options)?;
    write_zip_file(&mut zip, &root.join("notebook.db"), "notebook.db", options)?;
    for name in files {
        safe_component(name)?;
        write_zip_file(&mut zip, &root.join("files").join(name), &format!("attachments/{name}"), options)?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn write_zip_file(zip: &mut ZipWriter<File>, source: &Path, name: &str, options: SimpleFileOptions) -> Result<(), String> {
    zip.start_file(name, options).map_err(|e| e.to_string())?;
    let mut input = open_regular(source)?;
    copy_limited(&mut input, zip, MAX_ENTRY)?;
    Ok(())
}

fn dir_names(dir: &Path) -> Result<Vec<String>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        safe_component(&name)?;
        names.push(name);
    }
    Ok(names)
}

fn copy_regular_file(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut input = open_regular(from)?;
    let mut output = OpenOptions::new().create(true).truncate(true).write(true).open(to).map_err(|e| e.to_string())?;
    copy_limited(&mut input, &mut output, MAX_ENTRY)?;
    Ok(())
}

fn open_regular(path: &Path) -> Result<File, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.file_type().is_file() {
        return Err("symlink".into());
    }
    open_nofollow(path)
}

fn copy_limited(input: &mut impl Read, output: &mut impl Write, max: u64) -> Result<(), String> {
    let mut left = max;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = input.read(&mut buf).map_err(|e| e.to_string())?;
        if read == 0 {
            return Ok(());
        }
        if read as u64 > left {
            return Err("too-large".into());
        }
        left -= read as u64;
        output.write_all(&buf[..read]).map_err(|e| e.to_string())?;
    }
}

fn open_read(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn open_write(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn safe_component(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name.chars().any(|ch| ch.is_control())
    {
        return Err("path-escape".into());
    }
    Ok(())
}

fn reject_control(path: &Path) -> Result<(), String> {
    let text = path.to_str().ok_or("invalid-destination")?;
    if text.chars().any(|ch| ch.is_control()) {
        return Err("invalid-destination".into());
    }
    Ok(())
}

fn tempfile_dir(prefix: &str) -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("{prefix}-{}", unique_name()));
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn unique_name() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{nanos}-{}", std::process::id())
}

#[cfg(unix)]
fn open_nofollow(path: &Path) -> Result<File, String> {
    use std::os::unix::fs::OpenOptionsExt;
    #[cfg(target_os = "linux")]
    const O_NOFOLLOW: i32 = 0x20000;
    #[cfg(target_os = "macos")]
    const O_NOFOLLOW: i32 = 0x0100;
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    const O_NOFOLLOW: i32 = 0x20000;
    OpenOptions::new().read(true).custom_flags(O_NOFOLLOW).open(path).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn open_nofollow(path: &Path) -> Result<File, String> {
    File::open(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_db(path: &Path, title: &str, stored: Option<&str>, source: Option<&str>) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE folders (id TEXT PRIMARY KEY, parent_id TEXT, name TEXT, sort_order INTEGER, created_at INTEGER, updated_at INTEGER);
             CREATE TABLE experiments (id TEXT PRIMARY KEY, folder_id TEXT, title TEXT, subtitle TEXT, sort_order INTEGER, created_at INTEGER, updated_at INTEGER);
             CREATE TABLE blocks (id TEXT PRIMARY KEY, experiment_id TEXT, kind TEXT, sort_order INTEGER, updated_at INTEGER, data TEXT);
             CREATE TABLE attachments (id TEXT PRIMARY KEY, experiment_id TEXT, block_id TEXT, filename TEXT, stored_name TEXT, size INTEGER, updated_at INTEGER, source_path TEXT);
             CREATE TABLE recents (experiment_id TEXT PRIMARY KEY, opened_at INTEGER);
             CREATE TABLE todos (id TEXT PRIMARY KEY, content TEXT);
             CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);",
        ).unwrap();
        conn.execute("INSERT INTO folders VALUES ('f', NULL, '文件夹', 0, 1, 1)", []).unwrap();
        conn.execute("INSERT INTO experiments VALUES ('e', 'f', ?1, '', 0, 1, 1)", [title]).unwrap();
        conn.execute("INSERT INTO blocks VALUES ('b', 'e', 'text', 0, 1, '{\"plain\":\"记录\"}')", []).unwrap();
        conn.execute(
            "INSERT INTO attachments VALUES ('a', 'e', 'b', '结果.xlsx', ?1, 3, 1, ?2)",
            rusqlite::params![stored.unwrap_or(""), source],
        ).unwrap();
        conn.execute("INSERT INTO recents VALUES ('e', 1)", []).unwrap();
        conn.execute("INSERT INTO meta VALUES ('kept', 'yes')", []).unwrap();
    }

    #[test]
    fn export_keeps_managed_copies_and_not_external_bytes() {
        let root = tempfile_dir("case-export").unwrap();
        let db = root.join("live.db");
        let files = root.join("attachments");
        fs::create_dir_all(&files).unwrap();
        sample_db(&db, "before", Some("copy.xlsx"), Some("/tmp/labtrace-external-结果.xlsx"));
        fs::write(files.join("copy.xlsx"), b"managed-copy").unwrap();
        let external = root.join("outside-结果.xlsx");
        fs::write(&external, b"EXTERNAL-BYTES-NOT-IN-BACKUP").unwrap();
        let zip_path = root.join("out.zip");
        export_notebook(&db, &files, &zip_path).unwrap();
        let bytes = fs::read(&zip_path).unwrap();
        assert!(!bytes.windows(b"EXTERNAL-BYTES-NOT-IN-BACKUP".len()).any(|w| w == b"EXTERNAL-BYTES-NOT-IN-BACKUP"));
        let unpacked = tempfile_dir("case-export-unpacked").unwrap();
        unpack_validated(&zip_path, &unpacked).unwrap();
        assert_eq!(fs::read(unpacked.join("files").join("copy.xlsx")).unwrap(), b"managed-copy");
        let info = inspect_notebook(&zip_path).unwrap();
        assert!(!info.includes_external_files);
        assert_eq!(info.attachment_count, 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn export_refuses_a_symlinked_attachment() {
        let root = tempfile_dir("case-link").unwrap();
        let db = root.join("live.db");
        let files = root.join("attachments");
        fs::create_dir_all(&files).unwrap();
        sample_db(&db, "before", Some("copy.xlsx"), None);
        let outside = root.join("secret");
        fs::write(&outside, b"SECRET-LINK-TARGET").unwrap();
        std::os::unix::fs::symlink(&outside, files.join("copy.xlsx")).unwrap();
        let zip_path = root.join("out.zip");
        let error = export_notebook(&db, &files, &zip_path).unwrap_err();
        assert_eq!(error, "symlink");
        assert!(!zip_path.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn restore_replaces_rows_without_creating_the_external_file() {
        let root = tempfile_dir("case-restore").unwrap();
        let source_db = root.join("source.db");
        let source_files = root.join("source-files");
        fs::create_dir_all(&source_files).unwrap();
        sample_db(&source_db, "after", Some("new.xlsx"), Some("/Users/甲/不存在的 原文件.xlsx"));
        fs::write(source_files.join("new.xlsx"), b"new-copy").unwrap();
        let zip_path = root.join("backup.zip");
        export_notebook(&source_db, &source_files, &zip_path).unwrap();

        let live_db = root.join("live.db");
        let live_files = root.join("live-files");
        fs::create_dir_all(&live_files).unwrap();
        sample_db(&live_db, "before", Some("old.xlsx"), None);
        fs::write(live_files.join("old.xlsx"), b"old-copy").unwrap();
        let recovery = root.join("recovery");
        restore_notebook(&zip_path, &live_db, &live_files, &recovery, RestoreFault::None).unwrap();
        let conn = Connection::open(&live_db).unwrap();
        let title: String = conn.query_row("SELECT title FROM experiments", [], |row| row.get(0)).unwrap();
        assert_eq!(title, "after");
        let source: String = conn.query_row("SELECT source_path FROM attachments", [], |row| row.get(0)).unwrap();
        assert_eq!(source, "/Users/甲/不存在的 原文件.xlsx");
        assert_eq!(fs::read(live_files.join("new.xlsx")).unwrap(), b"new-copy");
        assert!(!live_files.join("old.xlsx").exists());
        assert!(!Path::new("/Users/甲/不存在的 原文件.xlsx").exists());
        assert!(!recovery.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejected_archive_leaves_the_notebook_unchanged() {
        let root = tempfile_dir("case-reject").unwrap();
        let live_db = root.join("live.db");
        let live_files = root.join("files");
        fs::create_dir_all(&live_files).unwrap();
        sample_db(&live_db, "before", Some("old.xlsx"), None);
        fs::write(live_files.join("old.xlsx"), b"old-copy").unwrap();
        let bad_db = root.join("bad.db");
        sample_db(&bad_db, "stolen", Some("../outside.xlsx"), None);
        let zip_path = root.join("bad.zip");
        let file = File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        let manifest = br#"{"format":"labtrace-notebook-backup","version":1,"includesExternalFiles":false}"#;
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(manifest).unwrap();
        zip.start_file("notebook.db", options).unwrap();
        zip.write_all(&fs::read(&bad_db).unwrap()).unwrap();
        zip.start_file("../outside.txt", options).unwrap();
        zip.write_all(b"escaped").unwrap();
        zip.finish().unwrap();
        let recovery = root.join("recovery");
        let error = restore_notebook(&zip_path, &live_db, &live_files, &recovery, RestoreFault::None).unwrap_err();
        assert!(error == "path-escape" || error == "invalid-format");
        let conn = Connection::open(&live_db).unwrap();
        let title: String = conn.query_row("SELECT title FROM experiments", [], |row| row.get(0)).unwrap();
        assert_eq!(title, "before");
        assert_eq!(fs::read(live_files.join("old.xlsx")).unwrap(), b"old-copy");
        assert!(!root.join("outside.txt").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn failed_restore_rolls_back_and_an_interrupted_marker_reconciles() {
        let root = tempfile_dir("case-rollback").unwrap();
        let source_db = root.join("source.db");
        let source_files = root.join("source-files");
        fs::create_dir_all(&source_files).unwrap();
        sample_db(&source_db, "after", Some("new.xlsx"), None);
        fs::write(source_files.join("new.xlsx"), b"new-copy").unwrap();
        let zip_path = root.join("backup.zip");
        export_notebook(&source_db, &source_files, &zip_path).unwrap();
        let live_db = root.join("live.db");
        let live_files = root.join("live-files");
        fs::create_dir_all(&live_files).unwrap();
        sample_db(&live_db, "before", Some("old.xlsx"), None);
        fs::write(live_files.join("old.xlsx"), b"old-copy").unwrap();
        let recovery = root.join("recovery");
        let error = restore_notebook(&zip_path, &live_db, &live_files, &recovery, RestoreFault::FailBeforeAttachments).unwrap_err();
        assert_eq!(error, "forced-failure");
        let conn = Connection::open(&live_db).unwrap();
        let title: String = conn.query_row("SELECT title FROM experiments", [], |row| row.get(0)).unwrap();
        assert_eq!(title, "before");
        assert_eq!(fs::read(live_files.join("old.xlsx")).unwrap(), b"old-copy");
        assert!(!live_files.join("new.xlsx").exists());

        let interrupted = root.join("interrupted");
        fs::create_dir_all(interrupted.join("attachments")).unwrap();
        sample_db(&interrupted.join("notebook.db"), "recovered", Some("old.xlsx"), None);
        fs::write(interrupted.join("attachments").join("old.xlsx"), b"recovered-copy").unwrap();
        fs::write(interrupted.join("attachments.json"), br#"{"stored_names":["old.xlsx"]}"#).unwrap();
        fs::write(interrupted.join("PENDING"), b"pending").unwrap();
        fs::write(interrupted.join("READY"), b"ready").unwrap();
        let dirty = root.join("dirty.db");
        let dirty_files = root.join("dirty-files");
        fs::create_dir_all(&dirty_files).unwrap();
        sample_db(&dirty, "dirty", Some("extra.xlsx"), None);
        fs::write(dirty_files.join("extra.xlsx"), b"extra").unwrap();
        reconcile_restore(&dirty, &dirty_files, &interrupted).unwrap();
        let conn = Connection::open(&dirty).unwrap();
        let title: String = conn.query_row("SELECT title FROM experiments", [], |row| row.get(0)).unwrap();
        assert_eq!(title, "recovered");
        assert_eq!(fs::read(dirty_files.join("old.xlsx")).unwrap(), b"recovered-copy");
        assert!(!dirty_files.join("extra.xlsx").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let root = tempfile_dir("case-version").unwrap();
        let db = root.join("db");
        let files = root.join("files");
        fs::create_dir_all(&files).unwrap();
        sample_db(&db, "before", None, None);
        let zip_path = root.join("v2.zip");
        let file = File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(br#"{"format":"labtrace-notebook-backup","version":2,"includesExternalFiles":false}"#).unwrap();
        zip.start_file("notebook.db", options).unwrap();
        zip.write_all(&fs::read(&db).unwrap()).unwrap();
        zip.finish().unwrap();
        let error = inspect_notebook(&zip_path).unwrap_err();
        assert_eq!(error, "unsupported-version");
        let _ = fs::remove_dir_all(&root);
    }
}
