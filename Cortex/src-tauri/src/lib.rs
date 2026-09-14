use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

/// Calculate physical coordinates through current_monitor() with exact Retina scale_factor
/// and position the Sidebar glued flush against the right edge of the display
fn position_sidebar_right(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let scale_factor = window.scale_factor()?;
    if let Some(monitor) = window.current_monitor()? {
        let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
        let mon_size = monitor.size().to_logical::<f64>(scale_factor);
        let win_size = window.outer_size()?.to_logical::<f64>(scale_factor);

        let (x, y) = compute_sidebar_position(
            mon_pos.x,
            mon_pos.y,
            mon_size.width,
            mon_size.height,
            win_size.width,
            win_size.height,
        );

        window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))?;
    }
    Ok(())
}

/// Toggle the visibility of the Lateral Sidebar from frontend (e.g. TrayPopover button)
#[tauri::command]
fn toggle_sidebar(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;
        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            let _ = position_sidebar_right(&window);
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

/// Dynamically resize and reposition the Sidebar window:
/// - Expanded (true): width 376px (56px dock + 320px flyout), x = monitor_pos.x + monitor_size.width - 376
/// - Collapsed (false): width 56px (dock only), x = monitor_pos.x + monitor_size.width - 56
#[tauri::command]
fn set_sidebar_expanded(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
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

    let target_width = if expanded { 376.0 } else { 56.0 };
    let target_height = 580.0;

    let (target_x, target_y) = compute_sidebar_position(
        mon_pos.x,
        mon_pos.y,
        mon_size.width,
        mon_size.height,
        target_width,
        target_height,
    );

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let last_unfocus = Arc::new(Mutex::new(None::<Instant>));
    let last_unfocus_tray = Arc::clone(&last_unfocus);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_sidebar,
            is_sidebar_visible,
            exit_app,
            set_sidebar_expanded
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
}
