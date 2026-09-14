import React, { useRef } from "react";
import { motion } from "framer-motion";
import { 
  Inbox, 
  Calendar, 
  FileText, 
  Settings, 
  Sparkles
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "cn";

/**
 * Tab identifiers supported across the Cortex desktop client
 * @typedef {'inbox' | 'calendar' | 'obsidian' | 'settings'} DockTab
 */

const NAV_ITEMS = [
  {
    id: "inbox",
    label: "Inbox & Prioridades",
    icon: Inbox,
    shortcut: "⌘1",
    badgeField: "unread",
  },
  {
    id: "calendar",
    label: "Calendário & Reuniões",
    icon: Calendar,
    shortcut: "⌘2",
    badgeField: null,
  },
  {
    id: "obsidian",
    label: "Notas Obsidian",
    icon: FileText,
    shortcut: "⌘3",
    badgeField: null,
  },
  {
    id: "settings",
    label: "Configurações",
    icon: Settings,
    shortcut: "⌘,",
    badgeField: null,
  },
];

/**
 * DockRail: Barra lateral flutuante estilo macOS (Liquid Glass / Dynamic Island)
 * 
 * @param {Object} props
 * @param {DockTab} props.activeTab - Aba atualmente ativa
 * @param {(tab: DockTab) => void} props.onTabChange - Callback disparado ao selecionar aba
 * @param {number} [props.highUrgencyCount=0] - Contagem de mensagens urgentes para o badge
 * @param {boolean} [props.isOpen=true] - Se o painel flyout está expandido
 * @param {() => void} [props.onToggleFlyout] - Alterna visibilidade do flyout
 * @param {'Left' | 'Right' | 'TopCenter' | 'Custom'} [props.preset='Right'] - Preset de ancoragem ativo
 * @param {boolean} [props.isPuck=false] - Se a dock está morphada em bolha de arrasto
 */
export function DockRail({
  activeTab = "inbox",
  onTabChange,
  highUrgencyCount = 0,
  isOpen = true,
  onToggleFlyout,
  preset = "Right",
  isPuck = false,
}) {
  const handleItemClick = (tabId) => {
    if (activeTab === tabId && onToggleFlyout) {
      onToggleFlyout();
    } else {
      onTabChange?.(tabId);
    }
  };

  const handleContractToPuck = () => {
    invoke("set_dragging_puck", { enabled: true }).catch((err) => {
      console.error("Falha ao recolher dock para modo bolinha:", err);
    });
  };

  // Refs para desambiguação estrita de clique vs arrasto no Modo Puck
  const hasDraggedRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragStartTimeRef = useRef(0);

  const handlePuckMouseDown = (e) => {
    if (e.button !== 0) return;
    hasDraggedRef.current = false;
    dragStartPosRef.current = { x: e.screenX, y: e.screenY };
    dragStartTimeRef.current = Date.now();
    getCurrentWebviewWindow().startDragging().catch((err) => {
      console.error("Falha ao iniciar arrasto nativo:", err);
    });
  };

  const handlePuckMouseMove = (e) => {
    const dx = Math.abs(e.screenX - dragStartPosRef.current.x);
    const dy = Math.abs(e.screenY - dragStartPosRef.current.y);
    if (dx > 4 || dy > 4) {
      hasDraggedRef.current = true;
    }
  };

  const handlePuckClick = (e) => {
    // Desambiguação: se o usuário executou um arrasto ou segurou por > 300ms,
    // o snap já foi tratado ao soltar. O clique simples só expande se não houve arrasto.
    const duration = Date.now() - dragStartTimeRef.current;
    if (hasDraggedRef.current || duration > 300) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    invoke("finish_dragging_puck").catch((err) => {
      console.error("Falha ao desdobrar dock:", err);
    });
  };

  const springConfig = { type: "spring", stiffness: 320, damping: 28 };

  // Modo Puck (Bolha Circular de Arrasto 48x48px)
  if (isPuck) {
    return (
      <motion.aside
        layout
        layoutId="dock-container"
        transition={springConfig}
        onMouseDown={handlePuckMouseDown}
        onMouseMove={handlePuckMouseMove}
        onClick={handlePuckClick}
        aria-label="Cortex Dragging Puck"
        className="dock-surface w-12 h-12 rounded-full p-0 flex items-center justify-center shadow-[0_0_24px_rgba(59,130,246,0.6)] border border-white/25 select-none pointer-events-auto cursor-grab active:cursor-grabbing"
      >
        <div className="relative flex items-center justify-center pointer-events-none">
          <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        </div>
      </motion.aside>
    );
  }

  // Modo TopCenter (Dynamic Island Flutuante sob o Notch)
  if (preset === "TopCenter") {
    return (
      <motion.aside
        layout
        layoutId="dock-container"
        transition={springConfig}
        onDoubleClick={handleContractToPuck}
        aria-label="Cortex Navigation Pill TopCenter"
        className="dock-surface fixed top-0 left-1/2 -translate-x-1/2 z-50 flex flex-row items-center h-11 w-[260px] px-3 py-1 gap-2 rounded-full border border-white/[0.12] shadow-2xl shadow-black/60 select-none pointer-events-auto cursor-default"
      >
        {/* Top Brand Logo / Pulse Indicator / Sparkles Action */}
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div 
            className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] cursor-pointer hover:bg-white/[0.12] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleContractToPuck();
            }}
            title="Recolher para Modo Bolinha (Puck)"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
          </div>
        </div>

        {/* Separador vertical sutil */}
        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Navigation Items (horizontal) */}
        <nav 
          className="flex flex-row gap-1 items-center flex-1 justify-center"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.badgeField === "unread" && highUrgencyCount > 0;

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={() => handleItemClick(item.id)}
                    className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
                      isActive
                        ? "text-white bg-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] border border-white/15"
                        : "text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent"
                    }`}
                    aria-label={item.label}
                    aria-pressed={isActive}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeDockIndicatorHorizontal"
                        className="absolute -bottom-1 w-4 h-0.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                        transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      />
                    )}
                    <Icon className="w-4 h-4" />
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[8.5px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-black/40">
                        {highUrgencyCount > 9 ? "9+" : highUrgencyCount}
                      </span>
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  sideOffset={8}
                  className="bg-[#181820]/95 backdrop-blur-md border-white/10 text-white shadow-xl text-xs py-1 px-2.5 rounded-lg flex items-center gap-2"
                >
                  <span>{item.label}</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-white/40 bg-white/[0.06] rounded border border-white/10">
                    {item.shortcut}
                  </kbd>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Separador vertical sutil */}
        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Status Dot */}
        <div 
          className="px-0.5 flex items-center justify-center"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span 
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              isOpen ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-white/20"
            }`}
            title={isOpen ? "Painel Aberto" : "Painel Fechado"}
          />
        </div>
      </motion.aside>
    );
  }

  // Modo Vertical (Right, Left, Custom)
  const verticalPresetClasses = {
    Right: "fixed right-0 top-1/2 -translate-y-1/2 rounded-l-2xl rounded-r-none border-r-0",
    Left: "fixed left-0 top-1/2 -translate-y-1/2 rounded-r-2xl rounded-l-none border-l-0",
    Custom: "fixed rounded-2xl border",
  };

  const tooltipSide = preset === "Left" ? "right" : "left";

  return (
    <motion.aside
      layout
      layoutId="dock-container"
      transition={springConfig}
      aria-label="Cortex Navigation Rail"
      onDoubleClick={handleContractToPuck}
      className={cn(
        "dock-surface z-50 flex flex-col items-center w-[56px] py-3 px-2 select-none pointer-events-auto cursor-default",
        verticalPresetClasses[preset] || verticalPresetClasses.Right
      )}
    >
      {/* Top Brand Logo / Pulse Indicator / Sparkles Action */}
      <div 
        className="mb-4 flex items-center justify-center"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div 
          className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] cursor-pointer hover:bg-white/[0.12] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            handleContractToPuck();
          }}
          title="Recolher para Modo Bolinha (Puck)"
        >
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav 
        className="flex flex-col gap-2 items-center"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const showBadge = item.badgeField === "unread" && highUrgencyCount > 0;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={() => handleItemClick(item.id)}
                  className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 ${
                    isActive
                      ? "text-white bg-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] border border-white/15"
                      : "text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent"
                  }`}
                  aria-label={item.label}
                  aria-pressed={isActive}
                >
                  {/* Active Indicator Bar (macOS Pill) */}
                  {isActive && (
                    <motion.span
                      layoutId="activeDockIndicator"
                      className={`absolute w-1 h-5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] ${
                        preset === "Left" ? "-right-1.5" : "-left-1.5"
                      }`}
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    />
                  )}

                  <Icon className="w-5 h-5 transition-transform duration-150" />

                  {/* High Urgency Notification Badge */}
                  {showBadge && (
                    <span 
                      aria-label={`${highUrgencyCount} notificações urgentes`}
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-black/40"
                    >
                      {highUrgencyCount > 9 ? "9+" : highUrgencyCount}
                    </span>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent 
                side={tooltipSide} 
                sideOffset={12}
                className="bg-[#181820]/95 backdrop-blur-md border-white/10 text-white shadow-xl text-xs py-1 px-2.5 rounded-lg flex items-center gap-2"
              >
                <span>{item.label}</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-white/40 bg-white/[0.06] rounded border border-white/10">
                  {item.shortcut}
                </kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom Separator & Indicator */}
      <div 
        className="mt-4 pt-3 border-t border-white/10 flex flex-col items-center"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span 
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isOpen ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-white/20"
          }`}
          title={isOpen ? "Painel Aberto" : "Painel Fechado"}
        />
      </div>
    </motion.aside>
  );
}

export default DockRail;
