import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
 * Suporta modo retraído "Edge Notch" (Imagem 1) com expansão suave ao hover e debounce de 220ms.
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
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimeoutRef = useRef(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = setTimeout(() => {
        if (!isOpenRef.current) {
          setIsHovered(false);
        }
      }, 200);
    }
  }, [isOpen]);

  const triggerDebounce = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    leaveTimeoutRef.current = setTimeout(() => {
      if (!isOpenRef.current) {
        setIsHovered(false);
      }
    }, 200);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    triggerDebounce();
  }, [triggerDebounce]);

  useEffect(() => {
    const handleMouseOut = (e) => {
      if (!e.relatedTarget && !e.toElement) {
        triggerDebounce();
      }
    };
    const handleBlur = () => {
      triggerDebounce();
    };
    const handleDocLeave = () => {
      triggerDebounce();
    };

    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("mouseleave", handleDocLeave);

    return () => {
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("mouseleave", handleDocLeave);
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, [triggerDebounce]);

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
        className="obsidian-surface w-12 h-12 rounded-full p-0 flex items-center justify-center shadow-[0_0_24px_rgba(59,130,246,0.6)] border border-white/25 select-none pointer-events-auto cursor-grab active:cursor-grabbing"
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
        className="obsidian-surface fixed top-0 left-1/2 -translate-x-1/2 z-50 flex flex-row items-center h-11 w-[260px] px-3 py-1 gap-2 rounded-full border border-white/[0.12] shadow-2xl shadow-black/60 select-none pointer-events-auto cursor-default"
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
              <Tooltip key={item.id} delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={() => handleItemClick(item.id)}
                    className={`relative flex items-center justify-center w-8 h-8 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 transition-all duration-150 active:scale-90 ${
                      isActive
                        ? "text-white bg-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] border border-white/15"
                        : "text-white/60 hover:text-white hover:bg-white/[0.08] border border-transparent"
                    }`}
                    aria-label={item.label}
                    aria-pressed={isActive}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeDockIndicatorHorizontal"
                        className="absolute -bottom-1 w-4 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                        transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      />
                    )}
                    <Icon className="w-4 h-4" />
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[8.5px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-black/40">
                        {highUrgencyCount > 9 ? "9+" : highUrgencyCount}
                      </span>
                    )}
                  </button>
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

  // Modo Vertical (Right, Left, Custom) - Separação Estrita Notch vs Scoop
  const isLeft = preset === "Left";
  const tooltipSide = isLeft ? "right" : "left";

  const TOP_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== "settings");
  const SETTINGS_ITEM = NAV_ITEMS.find((item) => item.id === "settings");

  // Estado de expansão: abre no hover ou quando o flyout está ativo
  const isExpanded = Boolean(isOpen || isHovered);

  // Geometria Bézier dos filés côncavos (Notch e Scoop)
  const notchPathD = isLeft
    ? "M 0,0 C 0,10 8,16 18,20 C 24,23 26,28 26,34 L 26,106 C 26,112 24,117 18,120 C 8,124 0,130 0,140 Z"
    : "M 26,0 C 26,10 18,16 8,20 C 2,23 0,28 0,34 L 0,106 C 0,112 2,117 8,120 C 18,124 26,130 26,140 Z";

  const scoopPathD = isLeft
    ? "M 0,0 C 0,18 22,26 48,34 C 60,38 68,44 68,54 L 68,226 C 68,236 60,242 48,246 C 22,254 0,262 0,280 Z"
    : "M 68,0 C 68,18 46,26 20,34 C 8,38 0,44 0,54 L 0,226 C 0,236 8,242 20,246 C 46,254 68,262 68,280 Z";

  const containerClasses = cn(
    "fixed top-1/2 -translate-y-1/2 z-50 flex items-center select-none pointer-events-none w-[68px]",
    isLeft ? "left-0 justify-start" : "right-0 justify-end"
  );

  return (
    <aside
      aria-label="Cortex Navigation Rail"
      className={containerClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <AnimatePresence initial={false}>
        {!isExpanded ? (
          /* Estado Retraído: O Edge Notch Real (Fiel à Imagem 4) */
          <motion.div
            key="dock-notch"
            initial={{ opacity: 0, x: isLeft ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isLeft ? -10 : 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center justify-center w-[26px] h-[140px] pointer-events-auto cursor-pointer drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] group"
            onClick={() => {
              setIsHovered(true);
              if (!isOpen && onToggleFlyout) {
                onToggleFlyout();
              }
            }}
            role="button"
            aria-label="Expand Cortex Dock"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsHovered(true);
                if (!isOpen && onToggleFlyout) {
                  onToggleFlyout();
                }
              }
            }}
          >
            {/* Fundo translúcido líquido com clipPath orgânico */}
            <div
              className="absolute inset-0 bg-[#0c0d0e]/85 backdrop-blur-2xl saturate-180 pointer-events-none group-hover:bg-[#0c0d0e]/95 transition-colors duration-200"
              style={{ clipPath: `path('${notchPathD}')` }}
            />

            {/* SVG Bezel Orgânico com Filés Côncavos */}
            <svg
              className="absolute inset-0 w-[26px] h-[140px] overflow-visible pointer-events-none"
              viewBox="0 0 26 140"
              fill="none"
            >
              <path
                d={notchPathD}
                fill="rgba(12, 13, 14, 0.45)"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
                className="group-hover:stroke-white/15 transition-colors duration-200"
              />
            </svg>

            {/* Conteúdo interno: 4 dots de grip e CORTEX vertical */}
            <div
              className={cn(
                "relative z-10 flex flex-col items-center justify-center gap-2.5 pointer-events-none",
                isLeft ? "pl-0.5" : "pr-0.5"
              )}
            >
              {/* Grip icon: 4 dots */}
              <div className="flex flex-col items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-white/70" />
                  <div className="w-1 h-1 rounded-full bg-white/70" />
                </div>
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-white/70" />
                  <div className="w-1 h-1 rounded-full bg-white/70" />
                </div>
              </div>

              {/* CORTEX Vertical */}
              <span
                className="text-[9px] font-semibold tracking-[0.22em] text-white/60 group-hover:text-white/90 uppercase select-none transition-colors"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                Cortex
              </span>
            </div>
          </motion.div>
        ) : (
          /* Estado Expandido: O Scoop Bezel com Proporções Finais (Fiel à Imagem 3) */
          <motion.div
            key="dock-scoop"
            initial={{ opacity: 0, x: isLeft ? -15 : 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isLeft ? -15 : 15 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center w-[68px] h-[280px] pointer-events-auto drop-shadow-[0_8px_32px_rgba(0,0,0,0.7)]"
          >
            {/* Fundo translúcido líquido com clipPath orgânico */}
            <div
              className="absolute inset-0 bg-[#0c0d0e]/85 backdrop-blur-3xl saturate-180 pointer-events-none"
              style={{ clipPath: `path('${scoopPathD}')` }}
            />

            {/* SVG Scoop Bezel Orgânico com Filés Côncavos e Borda Sutil */}
            <svg
              className="absolute inset-0 w-[68px] h-[280px] overflow-visible pointer-events-none"
              viewBox="0 0 68 280"
              fill="none"
            >
              <path
                d={scoopPathD}
                fill="rgba(12, 13, 14, 0.45)"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
              />
            </svg>

            {/* Navegação Vertical com Respiro Superior/Inferior Amplo (py-6) */}
            <nav
              className="relative z-10 flex flex-col items-center justify-between h-full py-6 pointer-events-auto"
              aria-label="Cortex Apps"
            >
              {/* 3 Botões Principais no Topo (Inbox, Calendário, Notas) - slots de 32px e ícones de 16px */}
              <div className="flex flex-col items-center gap-3">
                {TOP_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <Tooltip key={item.id} delayDuration={150}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleItemClick(item.id)}
                          className={cn(
                            "relative flex items-center justify-center w-8 h-8 rounded-full outline-none",
                            "transition-all duration-200 cursor-pointer select-none",
                            isActive
                              ? "text-white bg-white/[0.14] border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105"
                              : "text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:scale-105 active:scale-95"
                          )}
                          aria-label={item.label}
                          aria-pressed={isActive}
                        >
                          {/* Micro-indicador lateral de 2px no item ativo */}
                          {isActive && (
                            <motion.span
                              layoutId="activeDockIndicator"
                              className={cn(
                                "absolute w-0.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]",
                                isLeft ? "-right-1" : "-left-1"
                              )}
                              transition={{ type: "spring", stiffness: 450, damping: 30 }}
                            />
                          )}

                          <Icon className="w-4 h-4 stroke-[1.8]" />
                        </button>
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
              </div>

              {/* Separador Sutil entre os Apps Principais e Configurações */}
              <div className="w-3.5 h-px bg-white/10 my-0.5" />

              {/* Botão de Configurações Isolado na Base (w-7 h-7, ícone 14px) */}
              {SETTINGS_ITEM && (() => {
                const Icon = SETTINGS_ITEM.icon;
                const isActive = activeTab === SETTINGS_ITEM.id;

                return (
                  <Tooltip key={SETTINGS_ITEM.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleItemClick(SETTINGS_ITEM.id)}
                        className={cn(
                          "relative flex items-center justify-center w-7 h-7 rounded-full outline-none",
                          "transition-all duration-200 cursor-pointer select-none",
                          isActive
                            ? "text-white bg-white/[0.14] border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.35)] scale-105"
                            : "text-white/50 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:scale-105 active:scale-95"
                        )}
                        aria-label={SETTINGS_ITEM.label}
                        aria-pressed={isActive}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="activeDockIndicator"
                            className={cn(
                              "absolute w-0.5 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]",
                              isLeft ? "-right-1" : "-left-1"
                            )}
                            transition={{ type: "spring", stiffness: 450, damping: 30 }}
                          />
                        )}

                        <Icon className="w-3.5 h-3.5 stroke-[1.8]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side={tooltipSide}
                      sideOffset={12}
                      className="bg-[#181820]/95 backdrop-blur-md border-white/10 text-white shadow-xl text-xs py-1 px-2.5 rounded-lg flex items-center gap-2"
                    >
                      <span>{SETTINGS_ITEM.label}</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-white/40 bg-white/[0.06] rounded border border-white/10">
                        {SETTINGS_ITEM.shortcut}
                      </kbd>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

export default DockRail;
