// Interview profile persistence (interview_profile.json in app data dir).
//
// Follows the same atomic-write pattern as session_store.rs: write to
// {path}.tmp then rename, so a crash mid-write never corrupts the file.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create app data dir: {}", e))?;
    Ok(dir.join("interview_profile.json"))
}

/// Load interview profile JSON (raw string; frontend owns the schema).
/// Returns None if the file does not exist yet.
#[tauri::command]
pub fn load_interview_profile(app: AppHandle) -> Result<Option<String>, String> {
    let path = profile_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Cannot read profile: {}", e))
}

/// Save interview profile JSON atomically (tmp + rename).
#[tauri::command]
pub fn save_interview_profile(app: AppHandle, content: String) -> Result<(), String> {
    // Validate it is parseable JSON before writing.
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid profile JSON: {}", e))?;

    let path = profile_path(&app)?;
    let tmp = path.with_extension("json.tmp");

    let mut file = fs::File::create(&tmp).map_err(|e| format!("Cannot create tmp file: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Cannot write profile: {}", e))?;
    file.sync_all().ok();
    drop(file);

    fs::rename(&tmp, &path).map_err(|e| format!("Cannot finalize profile write: {}", e))?;
    Ok(())
}
