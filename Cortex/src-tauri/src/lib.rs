use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let last_unfocus = Arc::new(Mutex::new(None::<Instant>));
    let last_unfocus_tray = Arc::clone(&last_unfocus);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(move |app| {
            // Load monochrome tray template icon with transparent background
            let icon_bytes = include_bytes!("../icons/tray-template.png");
            let tray_icon = tauri::image::Image::from_bytes(icon_bytes)
                .expect("failed to load tray-template.png");

            let unfocus_ref = Arc::clone(&last_unfocus_tray);

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Cortex")
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
                        if let Some(window) = app.get_webview_window("main") {
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
                                // Tray icon click caused the blur; keep window hidden
                                return;
                            }

                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                // Anchor window centered below the tray icon
                                if let Ok(scale_factor) = window.scale_factor() {
                                    let icon_pos = rect.position.to_logical::<f64>(scale_factor);
                                    let icon_size = rect.size.to_logical::<f64>(scale_factor);

                                    if let Ok(win_size) = window.outer_size() {
                                        let win_size_logical = win_size.to_logical::<f64>(scale_factor);
                                        let mut x = icon_pos.x + (icon_size.width / 2.0) - (win_size_logical.width / 2.0);
                                        let y = icon_pos.y + icon_size.height + 6.0;

                                        // Ensure window stays within screen horizontal boundaries
                                        if let Ok(Some(monitor)) = window.current_monitor() {
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

                                        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                                    }
                                }

                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Focused(false) = event {
                // Record timestamp of focus loss to prevent immediate re-opening on tray click
                if let Ok(mut lock) = last_unfocus.lock() {
                    *lock = Some(Instant::now());
                }
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
