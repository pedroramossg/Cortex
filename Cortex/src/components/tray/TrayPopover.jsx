import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Sidebar as SidebarIcon,
  RefreshCw,
  Power
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { QuickEventInput } from "@/components/calendar/QuickEventInput";
import { DailyTasksWidget } from "@/components/tray/DailyTasksWidget";

/**
 * TrayPopover: Menu Bar popover minimalista (320x540px) para o macOS System Tray.
 * Hierarquia estrita e limpa: Header Minimalista -> Quick Add -> DailyTasksWidget -> Rodapé de Ajustes.
 * ZERO scrollbar e ZERO corte visual.
 */
export function TrayPopover() {
  const [isSidebarActive, setIsSidebarActive] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dockPreset, setDockPreset] = useState("Right");
  const quickInputRef = useRef(null);

  useEffect(() => {
    // Foco suave com 50ms para contornar o atraso de foco do WebKit no macOS
    const timer = setTimeout(() => {
      quickInputRef.current?.focus();
    }, 50);

    const handleWindowFocus = () => {
      setTimeout(() => {
        quickInputRef.current?.focus();
      }, 50);
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    // Consulta o estado inicial da Sidebar
    invoke("is_sidebar_visible")
      .then((visible) => setIsSidebarActive(Boolean(visible)))
      .catch(() => setIsSidebarActive(true));

    // Consulta preset ativo
    invoke("get_dock_preset")
      .then((preset) => {
        if (preset) setDockPreset(preset);
      })
      .catch(() => {});

    // Sincroniza preset quando alterado pelo Rust ou por arrasto
    let unlisten;
    listen("dock-preset-changed", (event) => {
      if (event.payload) {
        setDockPreset(event.payload);
      }
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleToggleSidebar = async () => {
    try {
      const newState = await invoke("toggle_sidebar");
      setIsSidebarActive(Boolean(newState));
    } catch (err) {
      console.error("Falha ao alternar Sidebar:", err);
    }
  };

  const handlePresetChange = async (val) => {
    if (!val) return;
    try {
      setDockPreset(val);
      await invoke("set_dock_preset", { preset: val });
    } catch (err) {
      console.error("Falha ao aplicar preset do Dock:", err);
    }
  };

  const handleQuickSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1200);
  };

  return (
    <div className="w-[320px] h-fit max-h-[420px] obsidian-surface rounded-2xl p-3 flex flex-col gap-2 text-white select-none overflow-hidden hairline-border shadow-2xl">
      {/* 1. Header Minimalista */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-xs font-semibold text-white tracking-tight leading-none">Cortex</h1>
            <span className="text-[9.5px] text-white/40 font-mono">Menu Bar</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
          <span className="text-[10px] text-emerald-400/90 font-mono font-medium">Ativo</span>
        </div>
      </div>

      {/* 2. Campo Quick Add em Linguagem Natural com GlowButton */}
      <div className="shrink-0">
        <QuickEventInput
          ref={quickInputRef}
          placeholder="Adicionar rápido (ex: 'reunião quinta às 15h')..."
        />
      </div>

      {/* 3. DailyTasksWidget Contextual Adaptativo (Zero Mocks) */}
      <div className="shrink-0">
        <DailyTasksWidget />
      </div>

      {/* 4. Rodapé de Ajustes e Ancoragem */}
      <div className="pt-1.5 border-t border-white/10 shrink-0 flex flex-col gap-1.5">
        {/* Toggle da Sidebar Lateral */}
        <button
          type="button"
          onClick={handleToggleSidebar}
          className="w-full flex items-center justify-between p-1.5 px-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors text-xs text-white cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SidebarIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-[11px]">Sidebar Lateral (Dock)</span>
          </div>
          <Badge 
            variant="outline" 
            className={`text-[8.5px] px-1.5 py-0 h-4 ${
              isSidebarActive 
                ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/15" 
                : "border-white/20 text-white/40 bg-white/5"
            }`}
          >
            {isSidebarActive ? "Visível" : "Oculta"}
          </Badge>
        </button>

        {/* Seletor de Presets de Posição do Dock */}
        <div className="w-full flex items-center justify-between p-1 px-2 rounded-xl bg-white/[0.03] border border-white/10">
          <span className="text-[10.5px] text-white/60 font-medium">Ancoragem</span>
          <ToggleGroup
            type="single"
            value={dockPreset === "Custom" ? "" : dockPreset}
            onValueChange={handlePresetChange}
            className="flex items-center gap-0.5 bg-white/[0.04] border border-white/10 p-0.5 rounded-lg"
          >
            <ToggleGroupItem
              value="Left"
              className="h-4.5 px-1.5 text-[9.5px] text-white/70 rounded data-[state=on]:bg-emerald-500/30 data-[state=on]:text-emerald-200 data-[state=on]:border-emerald-500/40 cursor-pointer"
            >
              Esquerda
            </ToggleGroupItem>
            <ToggleGroupItem
              value="TopCenter"
              className="h-4.5 px-1.5 text-[9.5px] text-white/70 rounded data-[state=on]:bg-emerald-500/30 data-[state=on]:text-emerald-200 data-[state=on]:border-emerald-500/40 cursor-pointer"
            >
              Notch
            </ToggleGroupItem>
            <ToggleGroupItem
              value="Right"
              className="h-4.5 px-1.5 text-[9.5px] text-white/70 rounded data-[state=on]:bg-emerald-500/30 data-[state=on]:text-emerald-200 data-[state=on]:border-emerald-500/40 cursor-pointer"
            >
              Direita
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Quick Actions (Sincronizar e Encerrar) */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-6.5 text-[10.5px] bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white/80 hover:text-white"
            onClick={handleQuickSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`w-2.5 h-2.5 mr-1.5 ${isSyncing ? "animate-spin text-emerald-400" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-6.5 px-2 text-[10.5px] bg-white/[0.04] border-white/10 hover:bg-red-500/20 hover:border-red-500/30 text-white/50 hover:text-red-300 transition-colors"
            title="Encerrar Cortex"
            onClick={() => invoke("exit_app")}
          >
            <Power className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TrayPopover;

