use std::sync::{Arc, Mutex};
use std::time::Instant;
use chrono::{Datelike, Timelike};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State};


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Dock anchoring presets supported by Cortex
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DockPositionPreset {
    Left,
    Right,
    TopCenter,
    Custom,
}

/// Application state tracking active preset, expansion status, and dragging puck
pub struct DockState {
    pub preset: Mutex<DockPositionPreset>,
    pub is_expanded: Mutex<bool>,
    pub is_puck: Mutex<bool>,
    pub drag_seq: std::sync::atomic::AtomicU64,
}

impl Default for DockState {
    fn default() -> Self {
        Self {
            preset: Mutex::new(DockPositionPreset::Right),
            is_expanded: Mutex::new(false),
            is_puck: Mutex::new(false),
            drag_seq: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

/// Pure helper to compute magnetic snap preset given window position and monitor dimensions
pub fn compute_magnetic_snap_preset(
    win_x: f64,
    win_y: f64,
    win_w: f64,
    mon_x: f64,
    mon_y: f64,
    mon_w: f64,
) -> DockPositionPreset {
    // 1. Left Zone: (x - mon_x) < 100px
    if (win_x - mon_x) < 100.0 {
        return DockPositionPreset::Left;
    }
    // 2. Right Zone: (mon_x + mon_w) - (win_x + win_w) < 100px
    if (mon_x + mon_w) - (win_x + win_w) < 100.0 {
        return DockPositionPreset::Right;
    }
    // 3. Notch Zone: (y - mon_y) < 80px AND horizontal center within 250px of monitor center
    let win_center_x = win_x + (win_w / 2.0);
    let mon_center_x = mon_x + (mon_w / 2.0);
    if (win_y - mon_y) < 80.0 && (win_center_x - mon_center_x).abs() < 250.0 {
        return DockPositionPreset::TopCenter;
    }
    // 4. Outside all zones: Custom free position
    DockPositionPreset::Custom
}

/// Pure helper to compute preset coordinates and dimensions given display geometry
pub fn compute_preset_geometry(
    preset: DockPositionPreset,
    expanded: bool,
    mon_x: f64,
    mon_y: f64,
    mon_width: f64,
    mon_height: f64,
) -> (f64, f64, f64, f64) {
    match preset {
        DockPositionPreset::Right => {
            let width = if expanded { 376.0 } else { 56.0 };
            let height = 580.0;
            let x = mon_x + mon_width - width;
            let y = mon_y + (mon_height - height) / 2.0;
            (x, y, width, height)
        }
        DockPositionPreset::Left => {
            let width = if expanded { 376.0 } else { 56.0 };
            let height = 580.0;
            let x = mon_x;
            let y = mon_y + (mon_height - height) / 2.0;
            (x, y, width, height)
        }
        DockPositionPreset::TopCenter => {
            if expanded {
                let width = 340.0;
                let height = 580.0;
                let x = mon_x + (mon_width - width) / 2.0;
                let y = mon_y + 40.0;
                (x, y, width, height)
            } else {
                let width = 260.0; // Horizontal dock pill under notch
                let height = 44.0;
                let x = mon_x + (mon_width - width) / 2.0;
                let y = mon_y + 40.0;
                (x, y, width, height)
            }
        }
        DockPositionPreset::Custom => {
            let width = if expanded { 376.0 } else { 56.0 };
            let height = 580.0;
            (mon_x, mon_y, width, height)
        }
    }
}

/// Pure helper to compute right-docked logical coordinates given monitor and window geometry
pub fn compute_sidebar_position(
    mon_x: f64,
    mon_y: f64,
    mon_width: f64,
    mon_height: f64,
    win_width: f64,
    win_height: f64,
) -> (f64, f64) {
    let x = mon_x + mon_width - win_width;
    let y = mon_y + (mon_height - win_height) / 2.0;
    (x, y)
}

/// Pure helper to compute tray popover position centered below the menu bar icon with screen bounds clamping
pub fn compute_tray_popover_position(
    icon_x: f64,
    icon_y: f64,
    icon_width: f64,
    icon_height: f64,
    win_width: f64,
    mon_x: f64,
    mon_width: f64,
) -> (f64, f64) {
    let mut x = icon_x + (icon_width / 2.0) - (win_width / 2.0);
    let y = icon_y + icon_height + 6.0;

    let max_x = mon_x + mon_width - win_width - 12.0;
    let min_x = mon_x + 12.0;
    if x > max_x {
        x = max_x;
    }
    if x < min_x {
        x = min_x;
    }
    (x, y)
}

/// Check if an unfocus event happened within the debounce threshold (anti-race condition)
pub fn is_debounce_unfocus(elapsed_millis: u128, threshold_millis: u128) -> bool {
    elapsed_millis < threshold_millis
}

/// Position the Sidebar according to preset or default right edge
fn apply_dock_preset_geometry(
    window: &tauri::WebviewWindow,
    preset: DockPositionPreset,
    expanded: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let scale_factor = window.scale_factor()?;
    if let Some(monitor) = window.current_monitor()? {
        let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
        let mon_size = monitor.size().to_logical::<f64>(scale_factor);

        let (x, y, w, h) = compute_preset_geometry(
            preset,
            expanded,
            mon_pos.x,
            mon_pos.y,
            mon_size.width,
            mon_size.height,
        );

        let target_size = tauri::Size::Logical(tauri::LogicalSize::new(w, h));
        let target_pos = tauri::Position::Logical(tauri::LogicalPosition::new(x, y));

        window.set_size(target_size)?;
        window.set_position(target_pos)?;
    }
    Ok(())
}

/// Calculate physical coordinates through current_monitor() with exact Retina scale_factor
/// and position the Sidebar glued flush against the right edge of the display
fn position_sidebar_right(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    apply_dock_preset_geometry(window, DockPositionPreset::Right, false)
}

/// Toggle the visibility of the Lateral Sidebar from frontend (e.g. TrayPopover button)
#[tauri::command]
fn toggle_sidebar(app: tauri::AppHandle, state: State<'_, DockState>) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;
        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            let preset = *state.preset.lock().map_err(|e| e.to_string())?;
            let expanded = *state.is_expanded.lock().map_err(|e| e.to_string())?;
            if preset != DockPositionPreset::Custom {
                let _ = apply_dock_preset_geometry(&window, preset, expanded);
            }
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("main window not found".into())
    }
}

/// Check current visibility status of the Lateral Sidebar
#[tauri::command]
fn is_sidebar_visible(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.is_visible().map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}

/// Gracefully exit the application on explicit user request
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Set active dock position preset (Left, Right, TopCenter) and reposition window
#[tauri::command]
fn set_dock_preset(
    app: tauri::AppHandle,
    preset: DockPositionPreset,
    state: State<'_, DockState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    {
        let mut p = state.preset.lock().map_err(|e| e.to_string())?;
        *p = preset;
    }

    let expanded = *state.is_expanded.lock().map_err(|e| e.to_string())?;

    if preset != DockPositionPreset::Custom {
        apply_dock_preset_geometry(&window, preset, expanded)
            .map_err(|e| format!("failed to position window: {e}"))?;
    }

    // Broadcast change to all windows so React layout adapts instantly
    app.emit("dock-preset-changed", preset)
        .map_err(|e| format!("failed to emit dock-preset-changed: {e}"))?;

    Ok(())
}

/// Notify Rust that free window dragging started, switching state to Custom
#[tauri::command]
fn set_dock_preset_custom(
    app: tauri::AppHandle,
    state: State<'_, DockState>,
) -> Result<(), String> {
    {
        let mut p = state.preset.lock().map_err(|e| e.to_string())?;
        *p = DockPositionPreset::Custom;
    }

    app.emit("dock-preset-changed", DockPositionPreset::Custom)
        .map_err(|e| format!("failed to emit dock-preset-changed: {e}"))?;

    Ok(())
}

/// Retrieve currently active dock position preset
#[tauri::command]
fn get_dock_preset(state: State<'_, DockState>) -> Result<DockPositionPreset, String> {
    let p = *state.preset.lock().map_err(|e| e.to_string())?;
    Ok(p)
}

/// Dynamically resize and reposition the Sidebar window with preset and bounds intelligence:
/// - Right: Expands leftwards (width 376 vs 56)
/// - Left: Expands rightwards (width 376 vs 56, x anchored to left)
/// - TopCenter: Expands downwards (width 340, height 580 vs width 56, height 240)
/// - Custom: Checks screen half to decide expansion direction with safe monitor clamping
#[tauri::command]
fn set_sidebar_expanded(
    app: tauri::AppHandle,
    expanded: bool,
    state: State<'_, DockState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let preset = *state.preset.lock().map_err(|e| e.to_string())?;
    {
        let mut exp = state.is_expanded.lock().map_err(|e| e.to_string())?;
        *exp = expanded;
    }

    let scale_factor = window
        .scale_factor()
        .map_err(|e| format!("failed to get scale factor: {e}"))?;

    let monitor = window
        .current_monitor()
        .map_err(|e| format!("failed to get current monitor: {e}"))?
        .ok_or_else(|| "no monitor detected for main window".to_string())?;

    let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
    let mon_size = monitor.size().to_logical::<f64>(scale_factor);

    let (target_x, target_y, target_width, target_height) = match preset {
        DockPositionPreset::Right => {
            let target_w = if expanded { 376.0 } else { 56.0 };
            let target_h = 580.0;
            let x = mon_pos.x + mon_size.width - target_w;
            let y = mon_pos.y + (mon_size.height - target_h) / 2.0;
            (x, y, target_w, target_h)
        }
        DockPositionPreset::Left => {
            let target_w = if expanded { 376.0 } else { 56.0 };
            let target_h = 580.0;
            let x = mon_pos.x;
            let y = mon_pos.y + (mon_size.height - target_h) / 2.0;
            (x, y, target_w, target_h)
        }
        DockPositionPreset::TopCenter => {
            let (target_w, target_h) = if expanded { (340.0, 580.0) } else { (260.0, 44.0) };
            let x = mon_pos.x + (mon_size.width - target_w) / 2.0;
            let y = mon_pos.y + 40.0;
            (x, y, target_w, target_h)
        }
        DockPositionPreset::Custom => {
            let current_pos = window
                .outer_position()
                .map_err(|e| format!("failed to get position: {e}"))?
                .to_logical::<f64>(scale_factor);
            let current_size = window
                .outer_size()
                .map_err(|e| format!("failed to get size: {e}"))?
                .to_logical::<f64>(scale_factor);

            let win_center_x = current_pos.x + (current_size.width / 2.0);
            let mon_center_x = mon_pos.x + (mon_size.width / 2.0);

            let target_w = if expanded { 376.0 } else { 56.0 };
            let target_h = 580.0;

            let raw_x = if win_center_x < mon_center_x {
                // Window is on left half: expand to the right
                current_pos.x
            } else {
                // Window is on right half: expand to the left
                if expanded {
                    current_pos.x - (376.0 - 56.0)
                } else {
                    current_pos.x + (376.0 - 56.0)
                }
            };

            // Clamp x within monitor bounds
            let max_x = mon_pos.x + mon_size.width - target_w;
            let clamped_x = raw_x.clamp(mon_pos.x, max_x);

            // Clamp y within monitor bounds
            let max_y = mon_pos.y + mon_size.height - target_h;
            let clamped_y = current_pos.y.clamp(mon_pos.y, max_y);

            (clamped_x, clamped_y, target_w, target_h)
        }
    };

    let target_pos = tauri::Position::Logical(tauri::LogicalPosition::new(target_x, target_y));
    let target_size = tauri::Size::Logical(tauri::LogicalSize::new(target_width, target_height));

    if expanded {
        window
            .set_size(target_size)
            .map_err(|e| format!("failed to set window size: {e}"))?;
        window
            .set_position(target_pos)
            .map_err(|e| format!("failed to set window position: {e}"))?;
    } else {
        window
            .set_position(target_pos)
            .map_err(|e| format!("failed to set window position: {e}"))?;
        window
            .set_size(target_size)
            .map_err(|e| format!("failed to set window size: {e}"))?;
    }

    Ok(())
}

/// Helper to resolve magnetic snap on mouse release or debounce timeout
fn execute_snap_and_restore(app: &tauri::AppHandle, state: &DockState) -> Result<(), String> {
    {
        let mut is_puck = state.is_puck.lock().map_err(|e| e.to_string())?;
        if !*is_puck {
            return Ok(());
        }
        *is_puck = false;
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let scale_factor = window
        .scale_factor()
        .map_err(|e| format!("failed to get scale factor: {e}"))?;

    let monitor = window
        .current_monitor()
        .map_err(|e| format!("failed to get current monitor: {e}"))?
        .ok_or_else(|| "no monitor detected for main window".to_string())?;

    let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
    let mon_size = monitor.size().to_logical::<f64>(scale_factor);
    let current_pos = window
        .outer_position()
        .map_err(|e| format!("failed to get position: {e}"))?
        .to_logical::<f64>(scale_factor);

    let resolved_preset = compute_magnetic_snap_preset(
        current_pos.x,
        current_pos.y,
        48.0,
        mon_pos.x,
        mon_pos.y,
        mon_size.width,
    );

    {
        let mut p = state.preset.lock().map_err(|e| e.to_string())?;
        *p = resolved_preset;
    }

    if resolved_preset != DockPositionPreset::Custom {
        apply_dock_preset_geometry(&window, resolved_preset, false)
            .map_err(|e| format!("failed to apply preset geometry: {e}"))?;
    } else {
        let target_w = 56.0;
        let target_h = 580.0;
        let max_x = mon_pos.x + mon_size.width - target_w;
        let clamped_x = current_pos.x.clamp(mon_pos.x, max_x);
        let max_y = mon_pos.y + mon_size.height - target_h;
        let clamped_y = current_pos.y.clamp(mon_pos.y, max_y);

        let target_size = tauri::Size::Logical(tauri::LogicalSize::new(target_w, target_h));
        let target_pos = tauri::Position::Logical(tauri::LogicalPosition::new(clamped_x, clamped_y));

        let _ = window.set_size(target_size);
        let _ = window.set_position(target_pos);
    }

    let _ = app.emit("dock-preset-changed", resolved_preset);
    let _ = app.emit("dock-puck-mode", false);

    Ok(())
}

/// Transition to compact 48x48 dragging puck
#[tauri::command]
fn set_dragging_puck(
    app: tauri::AppHandle,
    enabled: bool,
    state: State<'_, DockState>,
) -> Result<(), String> {
    if enabled {
        {
            let mut is_puck = state.is_puck.lock().map_err(|e| e.to_string())?;
            *is_puck = true;
            let mut exp = state.is_expanded.lock().map_err(|e| e.to_string())?;
            *exp = false;
        }

        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        let puck_size = tauri::Size::Logical(tauri::LogicalSize::new(48.0, 48.0));
        window
            .set_size(puck_size)
            .map_err(|e| format!("failed to set puck size: {e}"))?;

        let _ = app.emit("dock-puck-mode", true);
        Ok(())
    } else {
        execute_snap_and_restore(&app, &state)
    }
}

/// Invoked explicitly on mouseup from frontend to finish dragging and snap
#[tauri::command]
fn finish_dragging_puck(
    app: tauri::AppHandle,
    state: State<'_, DockState>,
) -> Result<(), String> {
    let is_puck = *state.is_puck.lock().map_err(|e| e.to_string())?;
    if !is_puck {
        return Ok(());
    }
    execute_snap_and_restore(&app, &state)
}

/// Model representing an Apple Calendar (EventKit)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AppleCalendar {
    pub id: String,
    pub title: String,
    #[serde(rename = "colorHex")]
    pub color_hex: String,
    #[serde(rename = "isWritable")]
    pub is_writable: bool,
}

/// Payload for creating an event in Apple Calendar
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CreateAppleEventPayload {
    #[serde(rename = "calendarName")]
    pub calendar_name: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: String,
    #[serde(rename = "endTime")]
    pub end_time: String,
    pub date: Option<String>,
    #[serde(rename = "startIso")]
    pub start_iso: Option<String>,
    #[serde(rename = "endIso")]
    pub end_iso: Option<String>,
    pub location: Option<String>,
}

/// Model representing a fetched Apple Calendar event
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AppleCalendarEvent {
    pub id: String,
    pub title: String,
    #[serde(rename = "startTime")]
    pub start_time: String,
    #[serde(rename = "endTime")]
    pub end_time: String,
    pub duration: String,
    #[serde(rename = "calendarName")]
    pub calendar_name: String,
    #[serde(rename = "categoryColor")]
    pub category_color: String,
    pub description: Option<String>,
    #[serde(rename = "meetingLink")]
    pub meeting_link: Option<String>,
    pub platform: Option<String>,
    pub organizer: String,
    #[serde(rename = "isOrganizer")]
    pub is_organizer: bool,
    pub attendees: Vec<AppleAttendee>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AppleAttendee {
    pub name: String,
    pub email: String,
    pub status: String,
    #[serde(rename = "isYou")]
    pub is_you: bool,
}

/// Helper to sanitize input strings against AppleScript injection (security.md)
pub fn sanitize_applescript_string(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "")
        .replace('\n', " ")
}

/// Checks AppleScript execution output, handling TCC authorization gracefully (-1743)
fn check_applescript_output(output: &std::process::Output) -> Result<String, String> {
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("-1743") || stderr.contains("not authorized") || stderr.contains("Not authorized") {
            Err("Acesso ao Calendário não autorizado no macOS (Permissão TCC negada). Habilite o Cortex em Ajustes do Sistema > Privacidade e Segurança > Automação.".to_string())
        } else {
            Err(format!("Falha ao comunicar com Apple Calendar: {}", stderr.trim()))
        }
    }
}

/// Executes an osascript with tokio::task::spawn_blocking and a strict 1.5s timeout.
/// Guarantees the Cocoa / WebKit GUI thread is never blocked.
async fn run_applescript_async(script: String) -> Result<String, String> {
    let timeout_duration = std::time::Duration::from_millis(1500);
    let task = tokio::task::spawn_blocking(move || {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
    });

    let res = match tokio::time::timeout(timeout_duration, task).await {
        Ok(join_res) => match join_res {
            Ok(cmd_res) => cmd_res.map_err(|e| format!("Falha ao invocar osascript: {e}")),
            Err(join_err) => Err(format!("Task spawn_blocking falhou: {join_err}")),
        },
        Err(_) => Err("Timeout de 1.5s excedido ao comunicar com o Apple Calendar".to_string()),
    }?;

    check_applescript_output(&res)
}

/// Helper to parse date components accurately in local timezone
fn parse_date_components(
    iso_opt: Option<&str>,
    time_str: &str,
    date_opt: Option<&str>,
) -> (i32, u32, u32, u32, u32) {
    if let Some(iso) = iso_opt {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso) {
            let local_dt = dt.with_timezone(&chrono::Local);
            return (
                local_dt.year(),
                local_dt.month(),
                local_dt.day(),
                local_dt.hour(),
                local_dt.minute(),
            );
        }
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(iso, "%Y-%m-%dT%H:%M:%S") {
            return (
                naive.year(),
                naive.month(),
                naive.day(),
                naive.hour(),
                naive.minute(),
            );
        }
    }

    let now = chrono::Local::now();
    let (mut y, mut m, mut d) = (now.year(), now.month(), now.day());

    if let Some(date_s) = date_opt {
        let parts: Vec<&str> = date_s.split('-').collect();
        if parts.len() == 3 {
            if let (Ok(py), Ok(pm), Ok(pd)) = (
                parts[0].parse::<i32>(),
                parts[1].parse::<u32>(),
                parts[2].parse::<u32>(),
            ) {
                y = py;
                m = pm;
                d = pd;
            }
        }
    }

    let time_parts: Vec<&str> = time_str.split(':').collect();
    let (hour, min) = if time_parts.len() >= 2 {
        (
            time_parts[0].parse::<u32>().unwrap_or(9),
            time_parts[1].parse::<u32>().unwrap_or(0),
        )
    } else {
        (9, 0)
    };

    (y, m, d, hour, min)
}

/// Retrieves list of user's Apple Calendars via native EventKit / osascript (non-blocking async)
#[tauri::command]
async fn get_apple_calendars() -> Result<Vec<AppleCalendar>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
tell application "Calendar"
    set output to ""
    repeat with c in calendars
        try
            set cName to name of c
            set cWritable to writable of c
            set cColor to color of c
            set r to (item 1 of cColor) / 257 as integer
            set g to (item 2 of cColor) / 257 as integer
            set b to (item 3 of cColor) / 257 as integer
            set output to output & cName & ":::" & r & "," & g & "," & b & ":::" & cWritable & "\n"
        end try
    end repeat
    return output
end tell
"#;
        let stdout = run_applescript_async(script.to_string()).await?;
        let mut calendars = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(":::").collect();
            if parts.len() >= 3 {
                let name = parts[0].trim().to_string();
                let rgb_parts: Vec<&str> = parts[1].split(',').collect();
                let color_hex = if rgb_parts.len() == 3 {
                    let r = rgb_parts[0].trim().parse::<u8>().unwrap_or(59);
                    let g = rgb_parts[1].trim().parse::<u8>().unwrap_or(130);
                    let b = rgb_parts[2].trim().parse::<u8>().unwrap_or(246);
                    format!("#{:02X}{:02X}{:02X}", r, g, b)
                } else {
                    "#3B82F6".to_string()
                };
                let is_writable = parts[2].trim() == "true";

                calendars.push(AppleCalendar {
                    id: name.clone(),
                    title: name,
                    color_hex,
                    is_writable,
                });
            }
        }

        if calendars.is_empty() {
            calendars.push(AppleCalendar {
                id: "Home".to_string(),
                title: "Pessoal".to_string(),
                color_hex: "#38BDF8".to_string(),
                is_writable: true,
            });
        }

        Ok(calendars)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(vec![
            AppleCalendar {
                id: "Home".to_string(),
                title: "Pessoal".to_string(),
                color_hex: "#38BDF8".to_string(),
                is_writable: true,
            },
            AppleCalendar {
                id: "Work".to_string(),
                title: "Trabalho".to_string(),
                color_hex: "#10B981".to_string(),
                is_writable: true,
            },
        ])
    }
}

/// Creates a new event directly in Apple Calendar (non-blocking async)
#[tauri::command]
async fn create_apple_calendar_event(payload: CreateAppleEventPayload) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let cal_name = sanitize_applescript_string(&payload.calendar_name);
        let title = sanitize_applescript_string(&payload.title);
        let description = payload
            .description
            .as_deref()
            .map(sanitize_applescript_string)
            .unwrap_or_default();
        let location = payload
            .location
            .as_deref()
            .map(sanitize_applescript_string)
            .unwrap_or_default();

        let (sy, sm, sd, sh, smin) = parse_date_components(
            payload.start_iso.as_deref(),
            &payload.start_time,
            payload.date.as_deref(),
        );
        let (ey, em, ed, eh, emin) = parse_date_components(
            payload.end_iso.as_deref(),
            &payload.end_time,
            payload.date.as_deref(),
        );

        let script = format!(
            r#"
tell application "Calendar"
    tell calendar "{cal_name}"
        set startD to (current date)
        set year of startD to {sy}
        set month of startD to {sm}
        set day of startD to {sd}
        set hours of startD to {sh}
        set minutes of startD to {smin}
        set seconds of startD to 0

        set endD to (current date)
        set year of endD to {ey}
        set month of endD to {em}
        set day of endD to {ed}
        set hours of endD to {eh}
        set minutes of endD to {emin}
        set seconds of endD to 0

        set newEvt to make new event at end of events with properties {{summary:"{title}", start date:startD, end date:endD, description:"{description}", location:"{location}"}}
        return id of newEvt
    end tell
end tell
"#
        );

        let event_id = run_applescript_async(script).await?;
        Ok(event_id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = payload;
        Ok(format!("mock-apple-{}", chrono::Utc::now().timestamp_millis()))
    }
}

/// Deletes an event by its native identifier from Apple Calendar (non-blocking async)
#[tauri::command]
async fn delete_apple_calendar_event(event_id: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let safe_id = sanitize_applescript_string(&event_id);
        let script = format!(
            r#"
tell application "Calendar"
    repeat with c in calendars
        try
            set evts to (every event of c whose id is "{safe_id}")
            if (count of evts) > 0 then
                delete (first item of evts)
                return "deleted"
            end if
        end try
    end repeat
    return "not_found"
end tell
"#
        );

        let res = run_applescript_async(script).await?;
        Ok(res == "deleted")
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = event_id;
        Ok(true)
    }
}

/// Fetches events from Apple Calendar for a given date (non-blocking async)
#[tauri::command]
async fn get_apple_calendar_events(date_iso: Option<String>) -> Result<Vec<AppleCalendarEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        let now = chrono::Local::now();
        let (y, m, d) = if let Some(ref date_s) = date_iso {
            let parts: Vec<&str> = date_s.split('-').collect();
            if parts.len() == 3 {
                (
                    parts[0].parse::<i32>().unwrap_or_else(|_| now.year()),
                    parts[1].parse::<u32>().unwrap_or_else(|_| now.month()),
                    parts[2].parse::<u32>().unwrap_or_else(|_| now.day()),
                )
            } else {
                (now.year(), now.month(), now.day())
            }
        } else {
            (now.year(), now.month(), now.day())
        };

        let script = format!(
            r#"
tell application "Calendar"
    set startD to (current date)
    set year of startD to {y}
    set month of startD to {m}
    set day of startD to {d}
    set hours of startD to 0
    set minutes of startD to 0
    set seconds of startD to 0

    set endD to (current date)
    set year of endD to {y}
    set month of endD to {m}
    set day of endD to {d}
    set hours of endD to 23
    set minutes of endD to 59
    set seconds of endD to 59

    set outList to ""
    repeat with c in (every calendar whose writable is true)
        try
            set cName to name of c
            set cColor to color of c
            set r to (item 1 of cColor) / 257 as integer
            set g to (item 2 of cColor) / 257 as integer
            set b to (item 3 of cColor) / 257 as integer
            set hexColor to "" & r & "," & g & "," & b
            set evts to (every event of c whose (start date >= startD and start date <= endD))
            repeat with ev in evts
                set evId to id of ev
                set evTitle to summary of ev
                set sH to (hours of (start date of ev))
                set sM to (minutes of (start date of ev))
                set eH to (hours of (end date of ev))
                set eM to (minutes of (end date of ev))
                set evDesc to description of ev
                set evUrl to url of ev
                set outList to outList & evId & ":::" & evTitle & ":::" & sH & ":" & sM & ":::" & eH & ":" & eM & ":::" & cName & ":::" & hexColor & ":::" & evDesc & ":::" & evUrl & "\n"
            end repeat
        end try
    end repeat
    return outList
end tell
"#
        );

        let stdout = run_applescript_async(script).await?;
        let mut events = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(":::").collect();
            if parts.len() >= 6 {
                let id = parts[0].trim().to_string();
                let title = parts[1].trim().to_string();
                let s_time = parts[2].trim();
                let e_time = parts[3].trim();
                let cal_name = parts[4].trim().to_string();
                let rgb_parts: Vec<&str> = parts[5].split(',').collect();
                let category_color = if rgb_parts.len() == 3 {
                    let r = rgb_parts[0].trim().parse::<u8>().unwrap_or(59);
                    let g = rgb_parts[1].trim().parse::<u8>().unwrap_or(130);
                    let b = rgb_parts[2].trim().parse::<u8>().unwrap_or(246);
                    format!("#{:02X}{:02X}{:02X}", r, g, b)
                } else {
                    "#3B82F6".to_string()
                };

                let desc = if parts.len() >= 7 && !parts[6].trim().is_empty() && parts[6].trim() != "missing value" {
                    Some(parts[6].trim().to_string())
                } else {
                    None
                };

                let meeting_url = if parts.len() >= 8 && !parts[7].trim().is_empty() && parts[7].trim() != "missing value" {
                    Some(parts[7].trim().to_string())
                } else {
                    None
                };

                let platform = meeting_url.as_ref().and_then(|u| {
                    let low = u.to_lowercase();
                    if low.contains("zoom") {
                        Some("zoom".to_string())
                    } else if low.contains("meet.google") {
                        Some("meet".to_string())
                    } else if low.contains("teams") {
                        Some("teams".to_string())
                    } else {
                        None
                    }
                });

                let format_time = |t_str: &str| -> String {
                    let bits: Vec<&str> = t_str.split(':').collect();
                    if bits.len() == 2 {
                        let h = bits[0].parse::<u32>().unwrap_or(0);
                        let m = bits[1].parse::<u32>().unwrap_or(0);
                        format!("{:02}:{:02}", h, m)
                    } else {
                        t_str.to_string()
                    }
                };

                let start_formatted = format_time(s_time);
                let end_formatted = format_time(e_time);

                events.push(AppleCalendarEvent {
                    id,
                    title,
                    start_time: start_formatted,
                    end_time: end_formatted,
                    duration: "45 min".to_string(),
                    calendar_name: cal_name,
                    category_color,
                    description: desc,
                    meeting_link: meeting_url,
                    platform,
                    organizer: "Você".to_string(),
                    is_organizer: true,
                    attendees: vec![AppleAttendee {
                        name: "Você".to_string(),
                        email: "me@apple.local".to_string(),
                        status: "accepted".to_string(),
                        is_you: true,
                    }],
                });
            }
        }

        Ok(events)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = date_iso;
        Ok(Vec::new())
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let last_unfocus = Arc::new(Mutex::new(None::<Instant>));
    let last_unfocus_tray = Arc::clone(&last_unfocus);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(DockState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_sidebar,
            is_sidebar_visible,
            exit_app,
            set_sidebar_expanded,
            set_dock_preset,
            set_dock_preset_custom,
            get_dock_preset,
            set_dragging_puck,
            finish_dragging_puck,
            get_apple_calendars,
            create_apple_calendar_event,
            delete_apple_calendar_event,
            get_apple_calendar_events
        ])
        .setup(move |app| {
            // Position the main Sidebar flush on the right edge on launch
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = position_sidebar_right(&main_win);
            }

            // Load monochrome tray template icon with transparent background
            let icon_bytes = include_bytes!("../icons/tray-template.png");
            let tray_icon = tauri::image::Image::from_bytes(icon_bytes)
                .expect("failed to load tray-template.png");

            let unfocus_ref = Arc::clone(&last_unfocus_tray);

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Cortex Menu Bar")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        // Target exclusively the tray_popover window (NOT the Sidebar)
                        if let Some(tray_window) = app.get_webview_window("tray_popover") {
                            // Check if focus loss was triggered by clicking the tray icon
                            let was_just_unfocused = if let Ok(lock) = unfocus_ref.lock() {
                                if let Some(time) = *lock {
                                    is_debounce_unfocus(time.elapsed().as_millis(), 250)
                                } else {
                                    false
                                }
                            } else {
                                false
                            };

                            if was_just_unfocused {
                                // Tray icon click caused the blur; keep popover hidden
                                return;
                            }

                            let is_visible = tray_window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = tray_window.hide();
                            } else {
                                // Anchor tray_popover centered below the tray icon using logical coords
                                if let Ok(scale_factor) = tray_window.scale_factor() {
                                    let icon_pos = rect.position.to_logical::<f64>(scale_factor);
                                    let icon_size = rect.size.to_logical::<f64>(scale_factor);

                                    if let Ok(win_size) = tray_window.outer_size() {
                                        let win_size_logical = win_size.to_logical::<f64>(scale_factor);

                                        let (mon_x, mon_width) = if let Ok(Some(monitor)) = tray_window.current_monitor() {
                                            let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
                                            let mon_size = monitor.size().to_logical::<f64>(scale_factor);
                                            (mon_pos.x, mon_size.width)
                                        } else {
                                            (0.0, 1920.0)
                                        };

                                        let (x, y) = compute_tray_popover_position(
                                            icon_pos.x,
                                            icon_pos.y,
                                            icon_size.width,
                                            icon_size.height,
                                            win_size_logical.width,
                                            mon_x,
                                            mon_width,
                                        );

                                        let _ = tray_window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                                    }
                                }

                                let _ = tray_window.show();
                                let _ = tray_window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::Moved(_) => {
                    if window.label() == "main" {
                        let dock_state = window.state::<DockState>();
                        let is_puck = *dock_state.is_puck.lock().unwrap_or_else(|e| e.into_inner());
                        if is_puck {
                            let seq = dock_state.drag_seq.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                            let app_handle = window.app_handle().clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(400));
                                let current_state = app_handle.state::<DockState>();
                                if current_state.drag_seq.load(std::sync::atomic::Ordering::SeqCst) == seq {
                                    let _ = execute_snap_and_restore(&app_handle, &current_state);
                                }
                            });
                        }
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Prevent window destruction on close request; hide instead
                    let _ = window.hide();
                    api.prevent_close();
                }
                tauri::WindowEvent::Focused(false) => {
                    // Auto-hide on blur ONLY for tray_popover (Sidebar remains docked unless toggled)
                    if window.label() == "tray_popover" {
                        if let Ok(mut lock) = last_unfocus.lock() {
                            *lock = Some(Instant::now());
                        }
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Prevent app from exiting when windows are hidden or lose focus; keep resident in system tray
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sidebar_right_dock_positioning() {
        let (x, y) = compute_sidebar_position(0.0, 0.0, 1512.0, 982.0, 500.0, 680.0);
        assert_eq!(x, 1012.0); // 1512 - 500 = 1012 (glued exactly flush to right edge)
        assert_eq!(y, 151.0);  // (982 - 680) / 2 = 151 (vertically centered)
    }

    #[test]
    fn test_sidebar_collapsed_dock_positioning() {
        // Collapsed state: width = 56.0 on 1512x982 display
        let (x, y) = compute_sidebar_position(0.0, 0.0, 1512.0, 982.0, 56.0, 580.0);
        assert_eq!(x, 1456.0); // 1512 - 56 = 1456 (exact right-dock)
        assert_eq!(y, 201.0);  // (982 - 580) / 2 = 201
    }

    #[test]
    fn test_sidebar_expanded_dock_positioning() {
        // Expanded state: width = 376.0 (56px dock + 320px flyout) on 1512x982 display
        let (x, y) = compute_sidebar_position(0.0, 0.0, 1512.0, 982.0, 376.0, 580.0);
        assert_eq!(x, 1136.0); // 1512 - 376 = 1136
        assert_eq!(y, 201.0);  // (982 - 580) / 2 = 201
    }

    #[test]
    fn test_sidebar_multi_monitor_offset() {
        let (x, y) = compute_sidebar_position(1512.0, 0.0, 1920.0, 1080.0, 500.0, 680.0);
        assert_eq!(x, 2932.0); // 1512 + 1920 - 500 = 2932
        assert_eq!(y, 200.0);  // (1080 - 680) / 2 = 200
    }

    #[test]
    fn test_tray_popover_centered_positioning() {
        let (x, y) = compute_tray_popover_position(1200.0, 0.0, 22.0, 22.0, 320.0, 0.0, 1512.0);
        assert_eq!(x, 1051.0); // 1200 + 11 - 160 = 1051
        assert_eq!(y, 28.0);   // 0 + 22 + 6 = 28
    }

    #[test]
    fn test_tray_popover_clamping_right_edge() {
        let (x, _) = compute_tray_popover_position(1490.0, 0.0, 22.0, 22.0, 320.0, 0.0, 1512.0);
        assert_eq!(x, 1180.0); // clamped to 1512 - 320 - 12 = 1180
    }

    #[test]
    fn test_unfocus_race_condition_debounce() {
        assert!(is_debounce_unfocus(50, 250));
        assert!(!is_debounce_unfocus(300, 250));
    }

    #[test]
    fn test_compute_preset_geometry_right() {
        // Collapsed (56px)
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Right, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1456.0);
        assert_eq!(y, 201.0);
        assert_eq!(w, 56.0);
        assert_eq!(h, 580.0);

        // Expanded (376px)
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Right, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1136.0);
        assert_eq!(y, 201.0);
        assert_eq!(w, 376.0);
        assert_eq!(h, 580.0);
    }

    #[test]
    fn test_compute_preset_geometry_left() {
        // Collapsed
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Left, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 201.0);
        assert_eq!(w, 56.0);
        assert_eq!(h, 580.0);

        // Expanded
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Left, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 201.0);
        assert_eq!(w, 376.0);
        assert_eq!(h, 580.0);
    }

    #[test]
    fn test_compute_preset_geometry_top_center() {
        // Collapsed: horizontal dock pill 260x44 under notch
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::TopCenter, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, (1512.0 - 260.0) / 2.0); // 626.0
        assert_eq!(y, 40.0);
        assert_eq!(w, 260.0);
        assert_eq!(h, 44.0);

        // Expanded: expands downwards to width 340px and height 580px
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::TopCenter, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, (1512.0 - 340.0) / 2.0); // 586.0
        assert_eq!(y, 40.0);
        assert_eq!(w, 340.0);
        assert_eq!(h, 580.0);
    }

    #[test]
    fn test_magnetic_snap_zones() {
        // Left zone: x - mon_x < 100
        let p_left = compute_magnetic_snap_preset(50.0, 300.0, 48.0, 0.0, 0.0, 1512.0);
        assert_eq!(p_left, DockPositionPreset::Left);

        // Right zone: (mon_x + mon_w) - (x + w) < 100
        let p_right = compute_magnetic_snap_preset(1450.0, 300.0, 48.0, 0.0, 0.0, 1512.0);
        assert_eq!(p_right, DockPositionPreset::Right);

        // Notch zone: y < 80.0 and center diff < 250
        let p_notch = compute_magnetic_snap_preset(740.0, 40.0, 48.0, 0.0, 0.0, 1512.0);
        assert_eq!(p_notch, DockPositionPreset::TopCenter);

        // Custom: middle of screen
        let p_custom = compute_magnetic_snap_preset(500.0, 400.0, 48.0, 0.0, 0.0, 1512.0);
        assert_eq!(p_custom, DockPositionPreset::Custom);
    }

    #[test]
    fn test_sanitize_applescript_injection() {
        let malicious = r#"Sprint"; do shell script "rm -rf /"; echo ""#;
        let sanitized = sanitize_applescript_string(malicious);
        assert_eq!(sanitized, r#"Sprint\"; do shell script \"rm -rf /\"; echo \""#);

        let with_newlines = "Title\nwith\r\nbreaks\\and\\slashes";
        let clean = sanitize_applescript_string(with_newlines);
        assert!(!clean.contains('\n'));
        assert!(!clean.contains('\r'));
        assert!(clean.contains("\\\\"));
    }

    #[test]
    fn test_parse_date_components_iso() {
        let (y, m, d, _h, _min) = parse_date_components(
            Some("2026-09-18T14:30:00Z"),
            "14:30",
            Some("2026-09-18")
        );
        // Validates parsing works without panic
        assert_eq!(y, 2026);
        assert_eq!(m, 9);
        assert!(d >= 17 && d <= 19); // Depending on UTC to local timezone offset
    }
}
