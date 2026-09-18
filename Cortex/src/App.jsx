import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DockRail } from "@/components/dock/DockRail";
import { NotificationList } from "@/components/inbox/NotificationList";
import { CalendarTimeline } from "@/components/calendar/CalendarTimeline";

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

  // Garante que o estado inicial nativo seja colapsado (56px) e sincroniza preset
  useEffect(() => {
    invoke("set_sidebar_expanded", { expanded: false }).catch(() => {});
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
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (unlistenPreset) unlistenPreset();
      if (unlistenPuck) unlistenPuck();
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleTabChange = useCallback(async (tab) => {
    setActiveTab(tab);
    if (!isFlyoutOpen) {
      try {
        await invoke("set_sidebar_expanded", { expanded: true });
      } catch (err) {
        console.error("Falha ao expandir janela da Sidebar:", err);
      }
      setIsFlyoutOpen(true);
    }
  }, [isFlyoutOpen]);

  const handleToggleFlyout = useCallback(async () => {
    if (!isFlyoutOpen) {
      try {
        await invoke("set_sidebar_expanded", { expanded: true });
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
        await invoke("set_sidebar_expanded", { expanded: false });
      } catch (err) {
        console.error("Falha ao colapsar janela da Sidebar:", err);
      }
    }
  }, []);

  // Determina direção e classes do Flyout conforme o preset ativo
  const isLeftHalf = typeof window !== "undefined" && (window.screenX || 0) < (window.screen?.availWidth || 1920) / 2;

  let flyoutPositionClass = "fixed right-[56px] top-1/2 -translate-y-1/2 w-[320px] h-[580px]";
  let flyoutInitialAnim = { opacity: 0, x: 20, scale: 0.98 };
  let flyoutExitAnim = { opacity: 0, x: 16, scale: 0.98 };

  if (dockPreset === "Left") {
    flyoutPositionClass = "fixed left-[56px] top-1/2 -translate-y-1/2 w-[320px] h-[580px]";
    flyoutInitialAnim = { opacity: 0, x: -20, scale: 0.98 };
    flyoutExitAnim = { opacity: 0, x: -16, scale: 0.98 };
  } else if (dockPreset === "TopCenter") {
    flyoutPositionClass = "fixed top-[52px] left-1/2 -translate-x-1/2 w-[320px] h-[510px]";
    flyoutInitialAnim = { opacity: 0, y: -16, scale: 0.98 };
    flyoutExitAnim = { opacity: 0, y: -16, scale: 0.98 };
  } else if (dockPreset === "Custom") {
    if (isLeftHalf) {
      flyoutPositionClass = "fixed left-[56px] top-1/2 -translate-y-1/2 w-[320px] h-[580px]";
      flyoutInitialAnim = { opacity: 0, x: -20, scale: 0.98 };
      flyoutExitAnim = { opacity: 0, x: -16, scale: 0.98 };
    } else {
      flyoutPositionClass = "fixed right-[56px] top-1/2 -translate-y-1/2 w-[320px] h-[580px]";
      flyoutInitialAnim = { opacity: 0, x: 20, scale: 0.98 };
      flyoutExitAnim = { opacity: 0, x: 16, scale: 0.98 };
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-transparent overflow-hidden text-white select-none pointer-events-none">
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

      {/* Flyout Panel Flutuante (Liquid Glass) */}
      <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
        {isFlyoutOpen && !isPuck && (
          <motion.aside
            key={`cortex-flyout-${dockPreset}`}
            initial={flyoutInitialAnim}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={flyoutExitAnim}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Cortex Flyout Panel"
            className={`mac-vibrancy rounded-2xl flex flex-col p-3 shadow-2xl z-40 pointer-events-auto ${flyoutPositionClass}`}
          >
            {/* Header do Flyout */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-[13px] font-semibold text-white tracking-tight">
                  {activeTab === "inbox" && "Inbox & Prioridades"}
                  {activeTab === "calendar" && "Calendário & Reuniões"}
                  {activeTab === "obsidian" && "Notas Obsidian"}
                  {activeTab === "settings" && "Configurações"}
                </h2>
                <p className="text-[11px] text-white/50">Cortex Intelligent Workspace</p>
              </div>
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                macOS HIG
              </span>
            </div>

            {/* Conteúdo Dinâmico por Aba */}
            <div className="flex-1 overflow-hidden pt-2">
              {activeTab === "inbox" && <NotificationList />}

              {activeTab === "calendar" && <CalendarTimeline />}

              {activeTab === "obsidian" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2 h-full text-white/60">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-purple-400">
                    📝
                  </div>
                  <h3 className="text-xs font-semibold text-white">Obsidian Local Vault</h3>
                  <p className="text-[11px] text-white/50">
                    Notas rápidas e briefings salvos diretamente no formato Markdown com frontmatter.
                  </p>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2 h-full text-white/60">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/70">
                    ⚙️
                  </div>
                  <h3 className="text-xs font-semibold text-white">Preferências do Sistema</h3>
                  <p className="text-[11px] text-white/50">
                    Ajustes de atalhos globais, modelos de IA e chaves locais protegidas.
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
