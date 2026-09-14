import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Calendar, 
  Mail, 
  FileText, 
  Sidebar as SidebarIcon,
  RefreshCw,
  Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";

/**
 * TrayPopover: Menu Bar popover compacto (320x420px) para o macOS System Tray
 * Exibe status de integrações, resumo diário, atalhos e toggle da Sidebar.
 */
export function TrayPopover() {
  const [isSidebarActive, setIsSidebarActive] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Consulta o estado inicial da Sidebar
    invoke("is_sidebar_visible")
      .then((visible) => setIsSidebarActive(Boolean(visible)))
      .catch(() => setIsSidebarActive(true));
  }, []);

  const handleToggleSidebar = async () => {
    try {
      const newState = await invoke("toggle_sidebar");
      setIsSidebarActive(Boolean(newState));
    } catch (err) {
      console.error("Falha ao alternar Sidebar:", err);
    }
  };

  const handleQuickSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1200);
  };

  return (
    <div className="w-[320px] h-[420px] mac-vibrancy rounded-2xl p-4 flex flex-col justify-between text-white select-none overflow-hidden hairline-border shadow-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/[0.08] border border-white/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xs font-semibold text-white tracking-tight leading-none">Cortex</h1>
              <span className="text-[10px] text-white/50">Menu Bar Assistant</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">Ativo</span>
          </div>
        </div>

        {/* Status das Integrações */}
        <div className="mt-3">
          <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 mb-1.5 px-0.5">
            Integrações
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="card-surface rounded-xl p-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                  Online
                </Badge>
              </div>
              <span className="text-xs font-medium text-white/90 truncate">Google Workspace</span>
              <span className="text-[10px] text-white/50">Gmail & Agenda</span>
            </div>

            <div className="card-surface rounded-xl p-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-purple-500/30 text-purple-300 bg-purple-500/10">
                  Sync
                </Badge>
              </div>
              <span className="text-xs font-medium text-white/90 truncate">Obsidian Vault</span>
              <span className="text-[10px] text-white/50">Vault Local</span>
            </div>
          </div>
        </div>

        {/* Resumo do Dia */}
        <div className="mt-3">
          <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 mb-1.5 px-0.5">
            Resumo do Dia
          </div>
          <div className="card-surface rounded-xl p-2.5 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/80">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>3 urgências pendentes</span>
              </div>
              <span className="text-[10px] font-mono text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                Ação
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
              <div className="flex items-center gap-2 text-white/80">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate max-w-[170px]">15:30 — Alinhamento Produto</span>
              </div>
              <span className="text-[10px] text-white/40 font-mono">Em 45m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Controls & Sidebar Toggle */}
      <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
        {/* Toggle da Sidebar Lateral */}
        <button
          type="button"
          onClick={handleToggleSidebar}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 transition-colors text-xs text-white cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SidebarIcon className="w-4 h-4 text-blue-400" />
            <span className="font-medium">Sidebar Lateral (Dock)</span>
          </div>
          <Badge 
            variant="outline" 
            className={`text-[9px] px-1.5 py-0 h-4 ${
              isSidebarActive 
                ? "border-blue-500/30 text-blue-300 bg-blue-500/20" 
                : "border-white/20 text-white/40 bg-white/5"
            }`}
          >
            {isSidebarActive ? "Visível" : "Oculta"}
          </Badge>
        </button>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-[11px] bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white/80 hover:text-white"
            onClick={handleQuickSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${isSyncing ? "animate-spin text-blue-400" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-[11px] bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white/80 hover:text-white"
            title="Nova Nota Obsidian"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TrayPopover;
