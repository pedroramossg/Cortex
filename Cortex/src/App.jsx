import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DockRail } from "@/components/dock/DockRail";
import { NotificationList } from "@/components/inbox/NotificationList";
import { CalendarTimeline } from "@/components/calendar/CalendarTimeline";
import { ObsidianNotesTab } from "@/components/obsidian/ObsidianNotesTab";
import { SettingsTab } from "@/components/settings/SettingsTab";

function App() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [highUrgencyCount, setHighUrgencyCount] = useState(3);
  const [dockPreset, setDockPreset] = useState("Right");
  const [isPuck, setIsPuck] = useState(false);
  const isFlyoutOpenRef = useRef(isFlyoutOpen);
  isFlyoutOpenRef.current = isFlyoutOpen;

  const isPuckRef = useRef(isPuck);
  isPuckRef.current = isPuck;

  // Garante que o estado inicial nativo seja colapsado e sincroniza preset
  useEffect(() => {
    invoke("resize_dock_window", { mode: "notch" }).catch(() => {});
    invoke("get_dock_preset")
      .then((p) => {
        if (p) setDockPreset(p);
      })
      .catch(() => {});

    // Escuta alterações de preset emitidas pelo Rust (ex: TrayPopover ou free dragging)
    let unlistenPreset;
    listen("dock-preset-changed", (event) => {
      if (event.payload) {
        setDockPreset(event.payload);
      }
    }).then((un) => {
      unlistenPreset = un;
    });

    // Escuta transição de modo puck (bolha de arrasto)
    let unlistenPuck;
    listen("dock-puck-mode", (event) => {
      const active = Boolean(event.payload);
      setIsPuck(active);
      isPuckRef.current = active;
      if (active) {
        setIsFlyoutOpen(false);
      }
    }).then((un) => {
      unlistenPuck = un;
    });

    // Listener nativo de mouseup para finalizar arrasto com precisão APENAS em modo puck
    const handleMouseUp = () => {
      if (isPuckRef.current) {
        invoke("finish_dragging_puck").catch(() => {});
      }
    };

    // Fechamento explícito via tecla Esc
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isFlyoutOpenRef.current) {
          setIsFlyoutOpen(false);
        }
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (unlistenPreset) unlistenPreset();
      if (unlistenPuck) unlistenPuck();
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleTabChange = useCallback(async (tab) => {
    setActiveTab(tab);
    if (!isFlyoutOpen) {
      try {
        await invoke("resize_dock_window", { mode: "flyout" });
      } catch (err) {
        console.error("Falha ao expandir janela da Sidebar:", err);
      }
      setIsFlyoutOpen(true);
    }
  }, [isFlyoutOpen]);

  const handleToggleFlyout = useCallback(async () => {
    if (!isFlyoutOpen) {
      try {
        await invoke("resize_dock_window", { mode: "flyout" });
      } catch (err) {
        console.error("Falha ao expandir janela da Sidebar:", err);
      }
      setIsFlyoutOpen(true);
    } else {
      setIsFlyoutOpen(false);
    }
  }, [isFlyoutOpen]);

  const handleExitComplete = useCallback(async () => {
    if (!isFlyoutOpenRef.current) {
      try {
        await invoke("resize_dock_window", { mode: "notch" });
      } catch (err) {
        console.error("Falha ao colapsar janela da Sidebar:", err);
      }
    }
  }, []);

  // Determina direção e classes do Flyout conforme o preset ativo
  const isLeftHalf = typeof window !== "undefined" && (window.screenX || 0) < (window.screen?.availWidth || 1920) / 2;

  let flyoutPositionClass = "fixed right-[60px] top-1/2 -translate-y-1/2 w-[340px] h-[600px] max-h-[600px]";
  let flyoutInitialAnim = { opacity: 0, x: 20, scale: 0.98 };
  let flyoutExitAnim = { opacity: 0, x: 16, scale: 0.98 };

  if (dockPreset === "Left") {
    flyoutPositionClass = "fixed left-[60px] top-1/2 -translate-y-1/2 w-[340px] h-[600px] max-h-[600px]";
    flyoutInitialAnim = { opacity: 0, x: -20, scale: 0.98 };
    flyoutExitAnim = { opacity: 0, x: -16, scale: 0.98 };
  } else if (dockPreset === "TopCenter") {
    flyoutPositionClass = "fixed top-[52px] left-1/2 -translate-x-1/2 w-[340px] h-[600px] max-h-[600px]";
    flyoutInitialAnim = { opacity: 0, y: -16, scale: 0.98 };
    flyoutExitAnim = { opacity: 0, y: -16, scale: 0.98 };
  } else if (dockPreset === "Custom") {
    if (isLeftHalf) {
      flyoutPositionClass = "fixed left-[60px] top-1/2 -translate-y-1/2 w-[340px] h-[600px] max-h-[600px]";
      flyoutInitialAnim = { opacity: 0, x: -20, scale: 0.98 };
      flyoutExitAnim = { opacity: 0, x: -16, scale: 0.98 };
    } else {
      flyoutPositionClass = "fixed right-[60px] top-1/2 -translate-y-1/2 w-[340px] h-[600px] max-h-[600px]";
      flyoutInitialAnim = { opacity: 0, x: 20, scale: 0.98 };
      flyoutExitAnim = { opacity: 0, x: 16, scale: 0.98 };
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-transparent border-none outline-none shadow-none overflow-hidden text-white select-none pointer-events-none">
      {/* Lateral Dock Flutuante Ancorada conforme preset */}
      <DockRail
        activeTab={activeTab}
        onTabChange={handleTabChange}
        highUrgencyCount={highUrgencyCount}
        isOpen={isFlyoutOpen}
        onToggleFlyout={handleToggleFlyout}
        preset={dockPreset}
        isPuck={isPuck}
      />

      {/* Flyout Panel Flutuante (Casca Oficial Niko: Deep Black & Glass Elevation) */}
      <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
        {isFlyoutOpen && !isPuck && (
          <motion.aside
            key={`cortex-flyout-${dockPreset}`}
            data-cortex-interactive="true"
            initial={flyoutInitialAnim}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={flyoutExitAnim}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Cortex Flyout Panel"
            style={{
              boxShadow: "inset 0 1px 1px 0 rgba(255, 255, 255, 0.09), 0 24px 64px rgba(0, 0, 0, 0.45)",
            }}
            className={`bg-[#0e0e10]/95 backdrop-blur-3xl rounded-[22px] border border-white/[0.08] flex flex-col p-3.5 z-40 pointer-events-auto max-h-[600px] overflow-hidden ${flyoutPositionClass}`}
          >
            {/* Header do Flyout */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08] shrink-0">
              <div>
                <h2 className="text-[13px] font-semibold text-[#f2f2f2] tracking-tight">
                  {activeTab === "inbox" && "Inbox & Prioridades"}
                  {activeTab === "calendar" && "Calendário & Reuniões"}
                  {activeTab === "obsidian" && "Notas Obsidian"}
                  {activeTab === "settings" && "Configurações"}
                </h2>
                <p className="rotulo-secao mt-0.5">Cortex Intelligent Workspace</p>
              </div>
            </div>

            {/* Conteúdo Dinâmico por Aba */}
            <div className="flex-1 overflow-hidden pt-2 min-h-0">
              {activeTab === "inbox" && <NotificationList />}

              {activeTab === "calendar" && <CalendarTimeline />}

              {activeTab === "obsidian" && <ObsidianNotesTab />}

              {activeTab === "settings" && (
                <SettingsTab
                  dockPreset={dockPreset}
                  onPresetChange={setDockPreset}
                />
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
