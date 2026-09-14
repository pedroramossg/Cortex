use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Calculate physical coordinates through current_monitor() with exact Retina scale_factor
/// and position the Sidebar glued flush against the right edge of the display:
/// x = screen_x + screen_width - window_width
/// y = screen_y + (screen_height - window_height) / 2
fn position_sidebar_right(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let scale_factor = window.scale_factor()?;
    if let Some(monitor) = window.current_monitor()? {
        let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
        let mon_size = monitor.size().to_logical::<f64>(scale_factor);
        let win_size = window.outer_size()?.to_logical::<f64>(scale_factor);

        let x = mon_pos.x + mon_size.width - win_size.width;
        let y = mon_pos.y + (mon_size.height - win_size.height) / 2.0;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let last_unfocus = Arc::new(Mutex::new(None::<Instant>));
    let last_unfocus_tray = Arc::clone(&last_unfocus);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, toggle_sidebar, is_sidebar_visible])
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
                                    time.elapsed().as_millis() < 250
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
                                        let mut x = icon_pos.x + (icon_size.width / 2.0) - (win_size_logical.width / 2.0);
                                        let y = icon_pos.y + icon_size.height + 6.0;

                                        // Ensure popover stays within screen horizontal boundaries
                                        if let Ok(Some(monitor)) = tray_window.current_monitor() {
                                            let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
                                            let mon_size = monitor.size().to_logical::<f64>(scale_factor);
                                            let max_x = mon_pos.x + mon_size.width - win_size_logical.width - 12.0;
                                            let min_x = mon_pos.x + 12.0;
                                            if x > max_x {
                                                x = max_x;
                                            }
                                            if x < min_x {
                                                x = min_x;
                                            }
                                        }

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
            // Auto-hide on blur ONLY for tray_popover (Sidebar remains docked unless toggled)
            if window.label() == "tray_popover" {
                if let tauri::WindowEvent::Focused(false) = event {
                    if let Ok(mut lock) = last_unfocus.lock() {
                        *lock = Some(Instant::now());
                    }
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
