use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use chrono::Datelike;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State};

/// Interactive bounding rectangle for passive hit-testing (CSS logical coordinates)
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Retangulo {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Global registry of interactive areas per window
#[derive(Default)]
pub struct EstadoAreas {
    pub areas: Mutex<HashMap<String, Vec<Retangulo>>>,
}

/// Persistent & in-memory credentials storage for services (Gmail, Slack, Webhooks)
#[derive(Default)]
pub struct CredenciaisState {
    pub credenciais: Mutex<HashMap<String, serde_json::Value>>,
}

/// Helper to get credentials file path in app config dir
pub fn get_credentials_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Falha ao resolver diretório de configurações: {e}"))?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Falha ao criar diretório de configurações: {e}"))?;
    Ok(config_dir.join("cortex_credentials.json"))
}

/// Helper to write credentials atomically to disk with 0o600 permissions
pub fn persist_credentials_atomic(path: &std::path::Path, data: &HashMap<String, serde_json::Value>) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Erro ao serializar credenciais: {e}"))?;

    let tmp_path = path.with_extension(format!("tmp.{}", std::process::id()));

    // Write data to temporary file
    std::fs::write(&tmp_path, serialized)
        .map_err(|e| format!("Falha ao gravar arquivo temporário de credenciais: {e}"))?;

    // On Unix (macOS / Linux), restrict permissions to owner only (0o600)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp_path, std::fs::Permissions::from_mode(0o600));
    }

    // Atomic rename replaces the target file atomically
    std::fs::rename(&tmp_path, path)
        .map_err(|e| format!("Falha na renomeação atômica do arquivo de credenciais: {e}"))?;

    Ok(())
}

/// Loads stored credentials from disk into memory
pub fn load_credentials_from_disk(path: &std::path::Path) -> HashMap<String, serde_json::Value> {
    if !path.exists() {
        return HashMap::new();
    }
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// IPC command to save service credential securely and atomically
#[tauri::command]
fn salvar_credencial(
    app: tauri::AppHandle,
    servico: String,
    token: String,
    state: State<'_, CredenciaisState>,
) -> Result<(), String> {
    let servico_trimmed = servico.trim().to_lowercase();
    let token_trimmed = token.trim().to_string();

    let valor: serde_json::Value = match serde_json::from_str(&token_trimmed) {
        Ok(val @ serde_json::Value::Object(_)) | Ok(val @ serde_json::Value::Array(_)) => val,
        _ => serde_json::Value::String(token_trimmed),
    };

    let mut lock = state.credenciais.lock().map_err(|e| e.to_string())?;
    lock.insert(servico_trimmed, valor);

    let path = get_credentials_path(&app)?;
    persist_credentials_atomic(&path, &lock)?;
    Ok(())
}

/// IPC command to retrieve credential for a service
#[tauri::command]
fn obter_credencial(
    servico: String,
    state: State<'_, CredenciaisState>,
) -> Result<Option<String>, String> {
    let servico_trimmed = servico.trim().to_lowercase();
    let lock = state.credenciais.lock().map_err(|e| e.to_string())?;
    Ok(lock.get(&servico_trimmed).and_then(|val| match val {
        serde_json::Value::String(s) => {
            if s.trim().is_empty() {
                None
            } else {
                Some(s.clone())
            }
        }
        serde_json::Value::Null => None,
        other => Some(other.to_string()),
    }))
}

/// IPC command to delete service credential securely and atomically
#[tauri::command]
fn remover_credencial(
    app: tauri::AppHandle,
    servico: String,
    state: State<'_, CredenciaisState>,
) -> Result<(), String> {
    let servico_trimmed = servico.trim().to_lowercase();
    let mut lock = state.credenciais.lock().map_err(|e| e.to_string())?;
    lock.remove(&servico_trimmed);

    let path = get_credentials_path(&app)?;
    persist_credentials_atomic(&path, &lock)?;
    Ok(())
}

/// IPC command to list services with active credentials
#[tauri::command]
fn listar_conexoes_ativas(
    state: State<'_, CredenciaisState>,
) -> Result<Vec<String>, String> {
    let lock = state.credenciais.lock().map_err(|e| e.to_string())?;
    let ativas = lock
        .iter()
        .filter(|(_, val)| match val {
            serde_json::Value::String(s) => !s.trim().is_empty(),
            serde_json::Value::Null => false,
            _ => true,
        })
        .map(|(k, _)| k.clone())
        .collect();
    Ok(ativas)
}

/// Pure helper to verify if coordinate (x, y) is inside rectangle with inner tolerance (e.g. 8px)
pub fn is_cursor_in_inner_tolerance(x: f64, y: f64, r: &Retangulo, tol_px: f64) -> bool {
    x >= r.x - tol_px && x <= r.x + r.w + tol_px && y >= r.y - tol_px && y <= r.y + r.h + tol_px
}

/// Pure helper to verify if coordinate (x, y) is inside outer hysteresis box (e.g. 35px X, 16px Y)
pub fn is_cursor_in_outer_hysteresis(x: f64, y: f64, r: &Retangulo, margin_x: f64, margin_y: f64) -> bool {
    x >= r.x - margin_x && x <= r.x + r.w + margin_x && y >= r.y - margin_y && y <= r.y + r.h + margin_y
}

/// IPC command to register measured interactive rects for a window
#[tauri::command]
fn area_interativa(janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<EstadoAreas>) {
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela, retangulos);
    }
}


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

/// Dock visual/window modes
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockMode {
    Notch,
    Scoop,
    Flyout,
}

impl DockMode {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_lowercase().as_str() {
            "notch" => Ok(Self::Notch),
            "scoop" => Ok(Self::Scoop),
            "flyout" => Ok(Self::Flyout),
            other => Err(format!(
                "invalid dock mode: '{other}'. Expected 'notch', 'scoop', or 'flyout'"
            )),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Notch => "notch",
            Self::Scoop => "scoop",
            Self::Flyout => "flyout",
        }
    }
}

/// Application state tracking active preset, expansion status, and dragging puck
pub struct DockState {
    pub preset: Mutex<DockPositionPreset>,
    pub mode: Mutex<DockMode>,
    pub is_expanded: Mutex<bool>,
    pub is_puck: Mutex<bool>,
    pub drag_seq: std::sync::atomic::AtomicU64,
    pub mode_gen: std::sync::atomic::AtomicU64,
    pub is_transitioning: std::sync::atomic::AtomicBool,
}

impl Default for DockState {
    fn default() -> Self {
        Self {
            preset: Mutex::new(DockPositionPreset::Right),
            mode: Mutex::new(DockMode::Notch),
            is_expanded: Mutex::new(false),
            is_puck: Mutex::new(false),
            drag_seq: std::sync::atomic::AtomicU64::new(0),
            mode_gen: std::sync::atomic::AtomicU64::new(0),
            is_transitioning: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

/// Pure helper to check if physical cursor coordinate (cx, cy) is inside physical rectangle [rx, ry, rw, rh]
/// expanded by physical margin (e.g. 8.0 * scale_factor)
pub fn is_cursor_in_physical_rect(
    cx: f64,
    cy: f64,
    rx: f64,
    ry: f64,
    rw: f64,
    rh: f64,
    margin_px: f64,
) -> bool {
    let min_x = rx - margin_px;
    let max_x = rx + rw + margin_px;
    let min_y = ry - margin_px;
    let max_y = ry + rh + margin_px;

    cx >= min_x && cx <= max_x && cy >= min_y && cy <= max_y
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

/// Pure helper to compute geometry (x, y, width, height) given dock mode and preset
pub fn compute_dock_mode_geometry(
    mode: DockMode,
    preset: DockPositionPreset,
    mon_x: f64,
    mon_y: f64,
    mon_width: f64,
    mon_height: f64,
) -> (f64, f64, f64, f64) {
    match preset {
        DockPositionPreset::Right => {
            let (width, height) = match mode {
                DockMode::Notch | DockMode::Scoop => (60.0, 300.0),
                DockMode::Flyout => (420.0, 640.0),
            };
            let x = mon_x + mon_width - width;
            let y = mon_y + (mon_height - height) / 2.0;
            (x, y, width, height)
        }
        DockPositionPreset::Left => {
            let (width, height) = match mode {
                DockMode::Notch | DockMode::Scoop => (60.0, 300.0),
                DockMode::Flyout => (420.0, 640.0),
            };
            let x = mon_x;
            let y = mon_y + (mon_height - height) / 2.0;
            (x, y, width, height)
        }
        DockPositionPreset::TopCenter => {
            match mode {
                DockMode::Flyout => {
                    let width = 340.0;
                    let height = 640.0;
                    let x = mon_x + (mon_width - width) / 2.0;
                    let y = mon_y + 40.0;
                    (x, y, width, height)
                }
                DockMode::Notch | DockMode::Scoop => {
                    let width = 260.0;
                    let height = 44.0;
                    let x = mon_x + (mon_width - width) / 2.0;
                    let y = mon_y + 40.0;
                    (x, y, width, height)
                }
            }
        }
        DockPositionPreset::Custom => {
            let (width, height) = match mode {
                DockMode::Notch | DockMode::Scoop => (60.0, 300.0),
                DockMode::Flyout => (420.0, 640.0),
            };
            (mon_x, mon_y, width, height)
        }
    }
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
    let mode = if expanded { DockMode::Flyout } else { DockMode::Notch };
    compute_dock_mode_geometry(mode, preset, mon_x, mon_y, mon_width, mon_height)
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



struct TransitionGuard<'a>(&'a std::sync::atomic::AtomicBool);
impl<'a> Drop for TransitionGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

/// Dynamically apply dock mode geometry and update state
pub fn apply_dock_mode(
    app: &tauri::AppHandle,
    state: &DockState,
    target_mode: DockMode,
) -> Result<(), String> {
    // Acquire atomic transition lock. If window is already resizing, discard to eliminate thrashing
    if state
        .is_transitioning
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Ok(());
    }
    let _guard = TransitionGuard(&state.is_transitioning);

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let preset = *state.preset.lock().map_err(|e| e.to_string())?;
    let current_mode = *state.mode.lock().map_err(|e| e.to_string())?;

    // Refinement 2: Clean transition when closing Flyout:
    // If target is Scoop (closing from Flyout), check if cursor is currently outside Scoop rect.
    // If outside, transition directly to Notch, preventing Scoop from remaining stuck on the desktop!
    let resolved_mode = if target_mode == DockMode::Scoop && current_mode == DockMode::Flyout {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        if let (Ok(cursor_phys), Ok(Some(monitor))) = (app.cursor_position(), window.current_monitor()) {
            let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
            let mon_size = monitor.size().to_logical::<f64>(scale_factor);
            let (sx, sy, sw, sh) = compute_dock_mode_geometry(
                DockMode::Scoop,
                preset,
                mon_pos.x,
                mon_pos.y,
                mon_size.width,
                mon_size.height,
            );
            let phys_rx = sx * scale_factor;
            let phys_ry = sy * scale_factor;
            let phys_rw = sw * scale_factor;
            let phys_rh = sh * scale_factor;
            let margin_phys = 30.0 * scale_factor;

            if is_cursor_in_physical_rect(
                cursor_phys.x,
                cursor_phys.y,
                phys_rx,
                phys_ry,
                phys_rw,
                phys_rh,
                margin_phys,
            ) {
                DockMode::Scoop
            } else {
                DockMode::Notch
            }
        } else {
            DockMode::Notch
        }
    } else {
        target_mode
    };

    // When switching between Notch and Scoop (dock-only modes), DO NOT resize Cocoa window!
    // The window is permanently fixed at 60x300. Just update state and emit event.
    let is_dock_only_transition = match (current_mode, resolved_mode) {
        (DockMode::Notch, DockMode::Scoop) | (DockMode::Scoop, DockMode::Notch) => true,
        _ => false,
    };

    if is_dock_only_transition {
        {
            let mut m = state.mode.lock().map_err(|e| e.to_string())?;
            *m = resolved_mode;
            let mut exp = state.is_expanded.lock().map_err(|e| e.to_string())?;
            *exp = false;
        }
        state.mode_gen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("dock-mode-changed", resolved_mode.as_str());
        return Ok(());
    }

    if current_mode == resolved_mode && resolved_mode != DockMode::Flyout {
        return Ok(());
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
        DockPositionPreset::Right | DockPositionPreset::Left | DockPositionPreset::TopCenter => {
            compute_dock_mode_geometry(
                resolved_mode,
                preset,
                mon_pos.x,
                mon_pos.y,
                mon_size.width,
                mon_size.height,
            )
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

            let (target_w, target_h) = match resolved_mode {
                DockMode::Notch | DockMode::Scoop => (60.0, 300.0),
                DockMode::Flyout => (420.0, 640.0),
            };

            let raw_x = if win_center_x < mon_center_x {
                current_pos.x
            } else {
                current_pos.x + current_size.width - target_w
            };

            let max_x = mon_pos.x + mon_size.width - target_w;
            let clamped_x = raw_x.clamp(mon_pos.x, max_x);

            let max_y = mon_pos.y + mon_size.height - target_h;
            let clamped_y = current_pos.y.clamp(mon_pos.y, max_y);

            (clamped_x, clamped_y, target_w, target_h)
        }
    };

    let target_pos = tauri::Position::Logical(tauri::LogicalPosition::new(target_x, target_y));
    let target_size = tauri::Size::Logical(tauri::LogicalSize::new(target_width, target_height));

    let is_expanding = match (current_mode, resolved_mode) {
        (DockMode::Notch, DockMode::Scoop)
        | (DockMode::Notch, DockMode::Flyout)
        | (DockMode::Scoop, DockMode::Flyout) => true,
        _ => false,
    };

    if is_expanding {
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

    {
        let mut m = state.mode.lock().map_err(|e| e.to_string())?;
        *m = resolved_mode;
        let mut exp = state.is_expanded.lock().map_err(|e| e.to_string())?;
        *exp = resolved_mode == DockMode::Flyout;
    }
    state.mode_gen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    let _ = app.emit("dock-mode-changed", resolved_mode.as_str());

    Ok(())
}

/// Dedicated OS cursor polling loop (45ms) for passive hit-testing and ignore_cursor_events toggling.
/// When cursor enters active rect (with 8px tolerance or 12px right edge trigger): window receives cursor events and emits 'dock-mode-changed' ('scoop').
/// When cursor exits outer hysteresis box (35px margin on X axis): requires 240ms continuous persistence before ignoring cursor events and emitting 'cortex://cursor-fora'.
/// When Flyout is open: lock is rigid, never emits cursor-fora and keeps cursor events permanently enabled.
fn vigiar_cursor(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut fora: HashMap<String, bool> = HashMap::new();
        let mut saida_inicio: HashMap<String, Instant> = HashMap::new();

        loop {
            std::thread::sleep(Duration::from_millis(45));

            let areas = match app.try_state::<EstadoAreas>() {
                Some(state) => match state.areas.lock() {
                    Ok(a) => a.clone(),
                    Err(_) => continue,
                },
                None => continue,
            };

            let sobrepostas: Vec<(String, tauri::WebviewWindow)> = app
                .webview_windows()
                .into_iter()
                .filter(|(r, _)| r == "main")
                .collect();

            fora.retain(|r, _| sobrepostas.iter().any(|(s, _)| s == r));
            saida_inicio.retain(|r, _| sobrepostas.iter().any(|(s, _)| s == r));

            for (rotulo, janela) in &sobrepostas {
                let is_puck = {
                    if let Some(dock_state) = app.try_state::<DockState>() {
                        dock_state.is_puck.lock().map(|p| *p).unwrap_or(false)
                    } else {
                        false
                    }
                };

                if is_puck {
                    saida_inicio.remove(rotulo);
                    let estava_fora = *fora.get(rotulo).unwrap_or(&false);
                    if estava_fora {
                        let _ = janela.set_ignore_cursor_events(false);
                        fora.insert(rotulo.clone(), false);
                    }
                    continue;
                }

                // Trava Absoluta de Janela Aberta no Rust:
                // Se o estado for DockMode::Flyout, o Rust DEVE IGNORAR qualquer verificação de saída
                // do cursor e NUNCA emitir cortex://cursor-fora. Mantém eventos desbloqueados permanentemente.
                let is_flyout = {
                    if let Some(dock_state) = app.try_state::<DockState>() {
                        dock_state
                            .mode
                            .lock()
                            .map(|m| *m == DockMode::Flyout)
                            .unwrap_or(false)
                    } else {
                        false
                    }
                };

                if is_flyout {
                    saida_inicio.remove(rotulo);
                    let estava_fora = *fora.get(rotulo).unwrap_or(&false);
                    if estava_fora || !fora.contains_key(rotulo) {
                        let _ = janela.set_ignore_cursor_events(false);
                        fora.insert(rotulo.clone(), false);
                    }
                    continue;
                }

                let (Ok(cursor), Ok(origem), Ok(escala)) = (
                    janela.cursor_position(),
                    janela.outer_position(),
                    janela.scale_factor(),
                ) else {
                    continue;
                };

                let tamanho = janela.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
                let largura_janela = tamanho.width as f64 / escala;
                let altura_janela = tamanho.height as f64 / escala;

                let x = (cursor.x - origem.x as f64) / escala;
                let y = (cursor.y - origem.y as f64) / escala;

                // Regra de Ancoragem Rígida na Borda (Edge Trigger):
                // Se o cursor estiver nos últimos 12px da margem direita do monitor ou da janela:
                let borda_direita_janela = (origem.x as f64 + (largura_janela * escala)) - (12.0 * escala);
                let borda_direita_monitor = janela
                    .current_monitor()
                    .ok()
                    .flatten()
                    .map(|m| (m.position().x as f64 + m.size().width as f64) - (12.0 * escala));

                let na_faixa_altura = cursor.y >= origem.y as f64
                    && cursor.y <= (origem.y as f64 + (altura_janela * escala));

                let na_borda_direita = na_faixa_altura
                    && (cursor.x >= borda_direita_janela
                        || borda_direita_monitor.map_or(false, |bm| cursor.x >= bm));

                // 1. Verificação de Entrada (Inner Box: tolerância 8px)
                let retangulo_hit_inner = areas
                    .get(rotulo)
                    .map(|lista| {
                        lista.iter().any(|r| is_cursor_in_inner_tolerance(x, y, r, 8.0))
                    })
                    .unwrap_or(false);

                let dentro_inner = retangulo_hit_inner || na_borda_direita;
                let estava_fora = *fora.get(rotulo).unwrap_or(&false);

                if dentro_inner {
                    // Cursor está firmemente dentro da área ativa: reseta cronômetro de saída
                    saida_inicio.remove(rotulo);

                    if !fora.contains_key(rotulo) || estava_fora {
                        let _ = janela.set_ignore_cursor_events(false);
                        let is_flyout_now = {
                            if let Some(dock_state) = app.try_state::<DockState>() {
                                dock_state
                                    .mode
                                    .lock()
                                    .map(|m| *m == DockMode::Flyout)
                                    .unwrap_or(false)
                            } else {
                                false
                            }
                        };
                        if !is_flyout_now {
                            let _ = janela.emit_to(rotulo.as_str(), "dock-mode-changed", "scoop");
                            let _ = app.emit("dock-mode-changed", "scoop");
                        }
                        fora.insert(rotulo.clone(), false);
                    }
                } else {
                    // Cursor não está na área interna ativa (8px).
                    // Se já estava confirmado como fora, garante estado e limpa timer.
                    if estava_fora {
                        saida_inicio.remove(rotulo);
                        continue;
                    }

                    // Se estava dentro, verifica Histerese de Saída:
                    // Outer Box com margem generosa de 35px no eixo X e 16px no eixo Y
                    let dentro_outer = areas
                        .get(rotulo)
                        .map(|lista| {
                            lista.iter().any(|r| is_cursor_in_outer_hysteresis(x, y, r, 35.0, 16.0))
                        })
                        .unwrap_or(false);

                    if dentro_outer {
                        // Cursor está na margem de histerese (dead-zone de 35px):
                        // Mantém dock aberta e cancela contagem de saída
                        saida_inicio.remove(rotulo);
                    } else {
                        // Cursor está fora da Outer Box (+35px).
                        // Exige persistência de pelo menos 240ms contínuos antes de emitir cursor-fora.
                        let inicio = saida_inicio.entry(rotulo.clone()).or_insert_with(Instant::now);
                        if inicio.elapsed() >= Duration::from_millis(240) {
                            let _ = janela.set_ignore_cursor_events(true);
                            let _ = janela.emit_to(rotulo.as_str(), "cortex://cursor-fora", ());
                            fora.insert(rotulo.clone(), true);
                            saida_inicio.remove(rotulo);
                        }
                    }
                }
            }
        }
    });
}

/// Explicitly resize the dock window to a target mode (notch, scoop, flyout)
#[tauri::command]
fn resize_dock_window(
    app: tauri::AppHandle,
    mode: String,
    state: State<'_, DockState>,
) -> Result<String, String> {
    let parsed_mode = DockMode::parse(&mode)?;
    apply_dock_mode(&app, &state, parsed_mode)?;
    let final_mode = *state.mode.lock().map_err(|e| e.to_string())?;
    Ok(final_mode.as_str().to_string())
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
            let mode = *state.mode.lock().map_err(|e| e.to_string())?;
            let _ = apply_dock_mode(&app, &state, mode);
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
    let _window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    {
        let mut p = state.preset.lock().map_err(|e| e.to_string())?;
        *p = preset;
    }

    let mode = *state.mode.lock().map_err(|e| e.to_string())?;

    if preset != DockPositionPreset::Custom {
        if let Some(window) = app.get_webview_window("main") {
            let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
            if let Ok(Some(monitor)) = window.current_monitor() {
                let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
                let mon_size = monitor.size().to_logical::<f64>(scale_factor);
                let (x, y, w, h) = compute_dock_mode_geometry(
                    mode,
                    preset,
                    mon_pos.x,
                    mon_pos.y,
                    mon_size.width,
                    mon_size.height,
                );
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
            }
        }
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
#[tauri::command]
fn set_sidebar_expanded(
    app: tauri::AppHandle,
    expanded: bool,
    state: State<'_, DockState>,
) -> Result<(), String> {
    let target = if expanded {
        DockMode::Flyout
    } else {
        DockMode::Scoop
    };
    apply_dock_mode(&app, &state, target)
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
        let target_w = 68.0;
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
    #[serde(rename = "calendarName", alias = "targetCalendar", default)]
    pub calendar_name: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
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

/// Executes an osascript with tokio::task::spawn_blocking and a configurable timeout.
/// Guarantees the Cocoa / WebKit GUI thread is never blocked.
async fn run_applescript_async_with_timeout(script: String, timeout_millis: u64) -> Result<String, String> {
    let timeout_duration = std::time::Duration::from_millis(timeout_millis);
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
        Err(_) => Err(format!("Timeout de {}ms excedido ao comunicar com o Apple Calendar", timeout_millis)),
    }?;

    check_applescript_output(&res)
}

/// Executes an osascript with tokio::task::spawn_blocking and a strict 1.5s timeout.
async fn run_applescript_async(script: String) -> Result<String, String> {
    run_applescript_async_with_timeout(script, 1500).await
}

/// Helper to parse date components accurately in local timezone
fn parse_date_components(
    iso_opt: Option<&str>,
    time_str: &str,
    date_opt: Option<&str>,
) -> (i32, u32, u32, u32, u32) {
    let now = chrono::Local::now();
    let (mut y, mut m, mut d) = (now.year(), now.month(), now.day());

    // 1. Prioriza date_opt local (YYYY-MM-DD) enviado pelo frontend
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
    } else if let Some(iso) = iso_opt {
        // 2. Fallback para ISO apenas se não houver date_opt
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso) {
            let local_dt = dt.with_timezone(&chrono::Local);
            y = local_dt.year();
            m = local_dt.month();
            d = local_dt.day();
        } else if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(iso, "%Y-%m-%dT%H:%M:%S") {
            y = naive.year();
            m = naive.month();
            d = naive.day();
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
        let cal_name = payload
            .calendar_name
            .as_deref()
            .map(sanitize_applescript_string)
            .unwrap_or_default()
            .replace('"', "\\\"");
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
    set monthNames to {{January, February, March, April, May, June, July, August, September, October, November, December}}
    set sMonth to item {sm} of monthNames
    set eMonth to item {em} of monthNames

    set startD to (current date)
    set time of startD to 0
    set day of startD to 1
    set year of startD to {sy}
    set month of startD to sMonth
    set day of startD to {sd}
    set hours of startD to {sh}
    set minutes of startD to {smin}

    set endD to (current date)
    set time of endD to 0
    set day of endD to 1
    set year of endD to {ey}
    set month of endD to eMonth
    set day of endD to {ed}
    set hours of endD to {eh}
    set minutes of endD to {emin}

    set targetCal to missing value
    if "{cal_name}" is not "" then
        repeat with c in calendars
            try
                if (name of c as string) is "{cal_name}" then
                    set targetCal to c
                    exit repeat
                end if
            end try
        end repeat
        if targetCal is missing value then
            repeat with c in calendars
                try
                    if (name of c as string) contains "{cal_name}" then
                        set targetCal to c
                        exit repeat
                    end if
                end try
            end repeat
        end if
    end if

    if targetCal is missing value then
        repeat with c in calendars
            try
                if (writable of c) is true then
                    set targetCal to c
                    exit repeat
                end if
            end try
        end repeat
    end if

    if targetCal is missing value then
        set targetCal to first calendar
    end if

    tell targetCal
        set newEvt to make new event at end of events with properties {{summary:"{title}", start date:startD, end date:endD, description:"{description}", location:"{location}"}}
        return id of newEvt
    end tell
end tell
"#
        );

        let event_id = match run_applescript_async(script).await {
            Ok(id) => {
                println!("[AppleCalendar] Evento criado com ID: {}", id);
                id
            }
            Err(err) => {
                eprintln!("[AppleCalendar ERROR] Falha ao criar evento: {}", err);
                return Err(err);
            }
        };
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
async fn get_apple_calendar_events(
    date_iso: Option<String>,
    year: Option<i32>,
    month: Option<u32>,
    day: Option<u32>,
) -> Result<Vec<AppleCalendarEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        let now = chrono::Local::now();
        let (y, m, d) = match (year, month, day) {
            (Some(py), Some(pm), Some(pd)) => (py, pm, pd),
            _ => {
                if let Some(ref date_s) = date_iso {
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
                }
            }
        };

        println!("[AppleCalendar] Buscando eventos para {}/{}/{}", y, m, d);

        let script = format!(
            r#"
tell application "Calendar"
    set monthNames to {{January, February, March, April, May, June, July, August, September, October, November, December}}
    set targetMonth to item {m} of monthNames

    set startOfDay to (current date)
    set time of startOfDay to 0
    set day of startOfDay to 1
    set year of startOfDay to {y}
    set month of startOfDay to targetMonth
    set day of startOfDay to {d}

    set endOfDay to startOfDay + (24 * 60 * 60) - 1

    set outList to ""
    set ignoredNames to {{"Birthdays", "Aniversários", "Siri Suggestions", "Sugestões da Siri"}}
    repeat with c in calendars
        try
            set cName to name of c
            if ignoredNames does not contain cName then
                set hexColor to "59,130,246"
                try
                    set cColor to color of c
                    set r to (item 1 of cColor) / 257 as integer
                    set g to (item 2 of cColor) / 257 as integer
                    set b to (item 3 of cColor) / 257 as integer
                    set hexColor to "" & r & "," & g & "," & b
                end try
                tell c
                    set evts to (every event whose (start date <= endOfDay and end date >= startOfDay))
                    repeat with ev in evts
                        try
                            set evId to id of ev
                            set evTitle to summary of ev
                            set sDate to start date of ev
                            set sH to hours of sDate
                            set sM to minutes of sDate
                            set eDate to end date of ev
                            set eH to hours of eDate
                            set eM to minutes of eDate
                            set evDesc to ""
                            try
                                set rawDesc to description of ev
                                if rawDesc is not missing value and rawDesc is not "" then
                                    set AppleScript's text item delimiters to " "
                                    set evDesc to (paragraphs of rawDesc) as text
                                    set AppleScript's text item delimiters to ""
                                end if
                            end try
                            set evUrl to ""
                            try
                                set rawUrl to url of ev
                                if rawUrl is not missing value then
                                    set evUrl to rawUrl
                                end if
                            end try
                            set outList to outList & evId & ":::" & evTitle & ":::" & sH & ":" & sM & ":::" & eH & ":" & eM & ":::" & cName & ":::" & hexColor & ":::" & evDesc & ":::" & evUrl & "\n"
                        end try
                    end repeat
                end tell
            end if
        on error
            -- Ignora falhas em calendários especiais (ex: Aniversários, Feriados) e continua
        end try
    end repeat
    return outList
end tell
"#
        );

        let stdout = match run_applescript_async_with_timeout(script, 8000).await {
            Ok(out) => {
                println!("[AppleCalendar] Saída bruta recebida:\n{}", out);
                out
            }
            Err(err) => {
                eprintln!("[AppleCalendar ERROR] Falha no osascript: {}", err);
                return Err(err);
            }
        };
        let mut events = Vec::new();

        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parts: Vec<&str> = trimmed.split(":::").collect();
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

                let duration = {
                    let s_bits: Vec<&str> = start_formatted.split(':').collect();
                    let e_bits: Vec<&str> = end_formatted.split(':').collect();
                    if s_bits.len() == 2 && e_bits.len() == 2 {
                        let sh = s_bits[0].parse::<i32>().unwrap_or(0);
                        let sm = s_bits[1].parse::<i32>().unwrap_or(0);
                        let eh = e_bits[0].parse::<i32>().unwrap_or(0);
                        let em = e_bits[1].parse::<i32>().unwrap_or(0);
                        let diff = (eh * 60 + em) - (sh * 60 + sm);
                        if diff > 0 {
                            if diff >= 60 {
                                let h = diff / 60;
                                let m = diff % 60;
                                if m > 0 {
                                    format!("{h}h {m}min")
                                } else {
                                    format!("{h}h")
                                }
                            } else {
                                format!("{diff} min")
                            }
                        } else {
                            "45 min".to_string()
                        }
                    } else {
                        "45 min".to_string()
                    }
                };

                let date_str = format!("{:04}-{:02}-{:02}", y, m, d);

                events.push(AppleCalendarEvent {
                    id,
                    title,
                    start_time: start_formatted,
                    end_time: end_formatted,
                    duration,
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
                    date: Some(date_str),
                });
            }
        }

        Ok(events)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (date_iso, year, month, day);
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
        .manage(EstadoAreas::default())
        .manage(CredenciaisState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_sidebar,
            is_sidebar_visible,
            exit_app,
            set_sidebar_expanded,
            resize_dock_window,
            set_dock_preset,
            set_dock_preset_custom,
            get_dock_preset,
            set_dragging_puck,
            finish_dragging_puck,
            get_apple_calendars,
            create_apple_calendar_event,
            delete_apple_calendar_event,
            get_apple_calendar_events,
            area_interativa,
            salvar_credencial,
            obter_credencial,
            remover_credencial,
            listar_conexoes_ativas
        ])
        .setup(move |app| {
            // Position the main Sidebar flush on the right edge on launch in 60x300 container
            if let Some(main_win) = app.get_webview_window("main") {
                let state = app.state::<DockState>();
                let scale_factor = main_win.scale_factor().unwrap_or(1.0);
                if let Ok(Some(monitor)) = main_win.current_monitor() {
                    let mon_pos = monitor.position().to_logical::<f64>(scale_factor);
                    let mon_size = monitor.size().to_logical::<f64>(scale_factor);
                    let preset = match state.preset.lock() {
                        Ok(p) => *p,
                        Err(_) => DockPositionPreset::Right,
                    };
                    let (x, y, w, h) = compute_dock_mode_geometry(
                        DockMode::Notch,
                        preset,
                        mon_pos.x,
                        mon_pos.y,
                        mon_size.width,
                        mon_size.height,
                    );
                    let _ = main_win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
                    let _ = main_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                }
                #[cfg(target_os = "macos")]
                {
                    let _ = main_win.set_visible_on_all_workspaces(true);
                }
                let _ = main_win.set_ignore_cursor_events(true);
            }

            // Fallback de Inicialização: Impede que a janela inicie "cega" antes do primeiro ciclo React
            if let Some(estado_areas) = app.try_state::<EstadoAreas>() {
                if let Ok(mut areas) = estado_areas.areas.lock() {
                    areas.insert(
                        "main".to_string(),
                        vec![Retangulo {
                            x: 32.0,
                            y: 70.0,
                            w: 28.0,
                            h: 160.0,
                        }],
                    );
                }
            }

            // Start cursor hit-testing monitor in background for zero ghost clicks
            vigiar_cursor(app.handle().clone());

            // Carrega credenciais do cofre local persistido no AppConfigDir
            if let Some(cred_state) = app.try_state::<CredenciaisState>() {
                if let Ok(path) = get_credentials_path(&app.handle()) {
                    let loaded = load_credentials_from_disk(&path);
                    if let Ok(mut lock) = cred_state.credenciais.lock() {
                        *lock = loaded;
                    }
                }
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
        // Collapsed state: width = 60.0, height = 300.0 on 1512x982 display
        let (x, y) = compute_sidebar_position(0.0, 0.0, 1512.0, 982.0, 60.0, 300.0);
        assert_eq!(x, 1452.0); // 1512 - 60 = 1452 (exact right-dock)
        assert_eq!(y, 341.0);  // (982 - 300) / 2 = 341
    }

    #[test]
    fn test_sidebar_expanded_dock_positioning() {
        // Expanded state: width = 420.0, height = 640.0 on 1512x982 display
        let (x, y) = compute_sidebar_position(0.0, 0.0, 1512.0, 982.0, 420.0, 640.0);
        assert_eq!(x, 1092.0); // 1512 - 420 = 1092
        assert_eq!(y, 171.0);  // (982 - 640) / 2 = 171
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
    fn test_dock_mode_parse_valid() {
        assert_eq!(DockMode::parse("notch").unwrap(), DockMode::Notch);
        assert_eq!(DockMode::parse("NOTCH").unwrap(), DockMode::Notch);
        assert_eq!(DockMode::parse("scoop").unwrap(), DockMode::Scoop);
        assert_eq!(DockMode::parse("Scoop").unwrap(), DockMode::Scoop);
        assert_eq!(DockMode::parse("flyout").unwrap(), DockMode::Flyout);
        assert_eq!(DockMode::parse("FLYOUT").unwrap(), DockMode::Flyout);
    }

    #[test]
    fn test_dock_mode_parse_invalid() {
        assert!(DockMode::parse("invalid").is_err());
        assert!(DockMode::parse("").is_err());
    }

    #[test]
    fn test_compute_dock_mode_geometry_right() {
        // Notch (60x300, identical to Scoop to prevent Cocoa window resize on hover)
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Notch, DockPositionPreset::Right, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1452.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Scoop
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Scoop, DockPositionPreset::Right, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1452.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Flyout (420x640)
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Flyout, DockPositionPreset::Right, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1092.0);
        assert_eq!(y, 171.0);
        assert_eq!(w, 420.0);
        assert_eq!(h, 640.0);
    }

    #[test]
    fn test_compute_dock_mode_geometry_left() {
        // Notch
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Notch, DockPositionPreset::Left, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Scoop
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Scoop, DockPositionPreset::Left, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Flyout (420x640)
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Flyout, DockPositionPreset::Left, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 171.0);
        assert_eq!(w, 420.0);
        assert_eq!(h, 640.0);
    }

    #[test]
    fn test_compute_dock_mode_geometry_multi_monitor() {
        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Notch, DockPositionPreset::Right, 1512.0, 0.0, 1920.0, 1080.0);
        assert_eq!(x, 3372.0); // 1512 + 1920 - 60 = 3372
        assert_eq!(y, 390.0);  // (1080 - 300) / 2 = 390
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        let (x, y, w, h) = compute_dock_mode_geometry(DockMode::Scoop, DockPositionPreset::Right, 1512.0, 0.0, 1920.0, 1080.0);
        assert_eq!(x, 3372.0); // 1512 + 1920 - 60 = 3372
        assert_eq!(y, 390.0);  // (1080 - 300) / 2 = 390
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);
    }

    #[test]
    fn test_is_cursor_in_physical_rect() {
        // [100, 200, 50, 80]
        assert!(is_cursor_in_physical_rect(125.0, 240.0, 100.0, 200.0, 50.0, 80.0, 0.0));
        assert!(is_cursor_in_physical_rect(100.0, 200.0, 100.0, 200.0, 50.0, 80.0, 0.0));
        assert!(!is_cursor_in_physical_rect(99.0, 240.0, 100.0, 200.0, 50.0, 80.0, 0.0));
        // with margin 10.0
        assert!(is_cursor_in_physical_rect(95.0, 240.0, 100.0, 200.0, 50.0, 80.0, 10.0));
        assert!(!is_cursor_in_physical_rect(89.0, 240.0, 100.0, 200.0, 50.0, 80.0, 10.0));
    }

    #[test]
    fn test_compute_preset_geometry_right() {
        // Collapsed (60px x 300px)
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Right, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1452.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Expanded (420px x 640px)
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Right, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 1092.0);
        assert_eq!(y, 171.0);
        assert_eq!(w, 420.0);
        assert_eq!(h, 640.0);
    }

    #[test]
    fn test_compute_preset_geometry_left() {
        // Collapsed
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Left, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 341.0);
        assert_eq!(w, 60.0);
        assert_eq!(h, 300.0);

        // Expanded (420px x 640px)
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::Left, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, 171.0);
        assert_eq!(w, 420.0);
        assert_eq!(h, 640.0);
    }

    #[test]
    fn test_compute_preset_geometry_top_center() {
        // Collapsed: horizontal dock pill 260x44 under notch
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::TopCenter, false, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, (1512.0 - 260.0) / 2.0); // 626.0
        assert_eq!(y, 40.0);
        assert_eq!(w, 260.0);
        assert_eq!(h, 44.0);

        // Expanded: expands downwards to width 340px and height 640px
        let (x, y, w, h) = compute_preset_geometry(DockPositionPreset::TopCenter, true, 0.0, 0.0, 1512.0, 982.0);
        assert_eq!(x, (1512.0 - 340.0) / 2.0); // 586.0
        assert_eq!(y, 40.0);
        assert_eq!(w, 340.0);
        assert_eq!(h, 640.0);
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
        let (y, m, d, h, min) = parse_date_components(
            None,
            "14:30",
            Some("2026-09-18")
        );
        // Validates strict local date parsing
        assert_eq!(y, 2026);
        assert_eq!(m, 9);
        assert_eq!(d, 18);
        assert_eq!(h, 14);
        assert_eq!(min, 30);
    }

    #[test]
    fn test_parse_date_components_local_date_priority() {
        // Even if an ISO string with UTC offset is passed, local date takes strict priority
        let (y, m, d, h, min) = parse_date_components(
            Some("2026-09-19T01:30:00Z"), // 01:30 UTC next day
            "22:30",
            Some("2026-09-18") // 22:30 Brasilia local
        );
        assert_eq!(y, 2026);
        assert_eq!(m, 9);
        assert_eq!(d, 18); // Must stay on the 18th
        assert_eq!(h, 22);
        assert_eq!(min, 30);
    }

    #[test]
    fn test_transition_guard_atomic_flag() {
        let flag = std::sync::atomic::AtomicBool::new(false);
        {
            assert_eq!(flag.load(std::sync::atomic::Ordering::SeqCst), false);
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            let _guard = TransitionGuard(&flag);
            assert_eq!(flag.load(std::sync::atomic::Ordering::SeqCst), true);
        }
        // After guard drops, flag must be restored to false
        assert_eq!(flag.load(std::sync::atomic::Ordering::SeqCst), false);
    }

    #[test]
    fn test_retangulo_hit_test_tolerance() {
        let r = Retangulo { x: 10.0, y: 20.0, w: 100.0, h: 50.0 };
        // Directly inside
        let x_in = 50.0;
        let y_in = 40.0;
        assert!(x_in >= r.x - 16.0 && x_in <= r.x + r.w + 16.0 && y_in >= r.y - 4.0 && y_in <= r.y + r.h + 4.0);

        // Edge with 16px tolerance on X and 4px on Y
        let x_edge = -6.0; // r.x - 16.0
        let y_edge = 16.0; // r.y - 4.0
        assert!(x_edge >= r.x - 16.0 && x_edge <= r.x + r.w + 16.0 && y_edge >= r.y - 4.0 && y_edge <= r.y + r.h + 4.0);

        // Outside tolerance
        let x_out = -7.0;
        assert!(!(x_out >= r.x - 16.0 && x_out <= r.x + r.w + 16.0));
    }

    #[test]
    fn test_edge_trigger_deterministic() {
        let origem_x = 1200.0;
        let largura_janela = 60.0;
        let escala = 2.0;
        let threshold = (origem_x + (largura_janela * escala)) - (12.0 * escala); // 1200 + 120 - 24 = 1296.0

        // Right at the 12px edge
        let cursor_edge = 1298.0;
        assert!(cursor_edge >= threshold);

        // Inside window but outside the 12px right margin
        let cursor_inside = 1290.0;
        assert!(!(cursor_inside >= threshold));
    }

    #[test]
    fn test_estado_areas_registration() {
        let estado = EstadoAreas::default();
        let rects = vec![
            Retangulo { x: 0.0, y: 0.0, w: 60.0, h: 200.0 },
            Retangulo { x: 10.0, y: 220.0, w: 40.0, h: 40.0 },
        ];
        if let Ok(mut areas) = estado.areas.lock() {
            areas.insert("main".to_string(), rects.clone());
        }
        let areas = estado.areas.lock().unwrap();
        assert_eq!(areas.get("main").unwrap().len(), 2);
    }

    #[test]
    fn test_inner_tolerance_8px() {
        let r = Retangulo { x: 100.0, y: 150.0, w: 60.0, h: 300.0 };
        // Directly inside
        assert!(is_cursor_in_inner_tolerance(130.0, 300.0, &r, 8.0));
        // Boundary with 8px tolerance
        assert!(is_cursor_in_inner_tolerance(92.0, 150.0, &r, 8.0));
        assert!(is_cursor_in_inner_tolerance(168.0, 150.0, &r, 8.0));
        // Outside 8px tolerance
        assert!(!is_cursor_in_inner_tolerance(91.9, 150.0, &r, 8.0));
        assert!(!is_cursor_in_inner_tolerance(168.1, 150.0, &r, 8.0));
    }

    #[test]
    fn test_outer_hysteresis_35px_16px() {
        let r = Retangulo { x: 100.0, y: 150.0, w: 60.0, h: 300.0 };
        // Inside inner area
        assert!(is_cursor_in_outer_hysteresis(110.0, 200.0, &r, 35.0, 16.0));
        // In the hysteresis dead-zone (e.g. 20px outside in X)
        assert!(is_cursor_in_outer_hysteresis(80.0, 200.0, &r, 35.0, 16.0));
        // Exactly at boundary: 100.0 - 35.0 = 65.0
        assert!(is_cursor_in_outer_hysteresis(65.0, 200.0, &r, 35.0, 16.0));
        // Outside outer hysteresis box
        assert!(!is_cursor_in_outer_hysteresis(64.9, 200.0, &r, 35.0, 16.0));
        assert!(!is_cursor_in_outer_hysteresis(195.1, 200.0, &r, 35.0, 16.0));
        // Y boundary: 150 - 16 = 134
        assert!(is_cursor_in_outer_hysteresis(110.0, 134.0, &r, 35.0, 16.0));
        assert!(!is_cursor_in_outer_hysteresis(110.0, 133.9, &r, 35.0, 16.0));
    }

    #[test]
    fn test_credentials_persist_and_load_atomic() {
        let temp_dir = std::env::temp_dir().join(format!("cortex_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let creds_file = temp_dir.join("test_credentials.json");

        let mut data = HashMap::new();
        data.insert("gmail".to_string(), serde_json::Value::String("ya29.test_token_123".to_string()));
        data.insert("slack".to_string(), serde_json::Value::String("xoxp-test-456".to_string()));

        let res = persist_credentials_atomic(&creds_file, &data);
        assert!(res.is_ok());

        let loaded = load_credentials_from_disk(&creds_file);
        assert_eq!(loaded.get("gmail").unwrap().as_str().unwrap(), "ya29.test_token_123");
        assert_eq!(loaded.get("slack").unwrap().as_str().unwrap(), "xoxp-test-456");

        // Clean up
        let _ = std::fs::remove_file(&creds_file);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_credentials_structured_and_remove() {
        let temp_dir = std::env::temp_dir().join(format!("cortex_test_struct_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let creds_file = temp_dir.join("test_credentials.json");

        let mut data = HashMap::new();
        let gmail_obj = serde_json::json!({
            "access_token": "ya29.live",
            "refresh_token": "1//refresh",
            "expires_at": 1728564000,
            "client_id": "cid-123",
            "client_secret": "sec-456"
        });
        data.insert("gmail".to_string(), gmail_obj);
        data.insert("slack".to_string(), serde_json::Value::String("xoxp-123".to_string()));

        let res = persist_credentials_atomic(&creds_file, &data);
        assert!(res.is_ok());

        let mut loaded = load_credentials_from_disk(&creds_file);
        assert_eq!(loaded.get("gmail").unwrap()["access_token"], "ya29.live");
        assert_eq!(loaded.get("gmail").unwrap()["refresh_token"], "1//refresh");

        // Remove gmail
        loaded.remove("gmail");
        let res_update = persist_credentials_atomic(&creds_file, &loaded);
        assert!(res_update.is_ok());

        let reloaded = load_credentials_from_disk(&creds_file);
        assert!(reloaded.get("gmail").is_none());
        assert_eq!(reloaded.get("slack").unwrap().as_str().unwrap(), "xoxp-123");

        // Clean up
        let _ = std::fs::remove_file(&creds_file);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
