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
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { useAreaInterativa } from "@/hooks/useAreaInterativa";

/**
 * Tab identifiers supported across the Cortex desktop client
 * @typedef {'inbox' | 'calendar' | 'obsidian' | 'settings'} DockTab
 */

const SCOOP_NAV_ITEMS = [
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
];

const SETTINGS_NAV_ITEM = {
  id: "settings",
  label: "Configurações",
  icon: Settings,
  shortcut: "⌘,",
  badgeField: null,
};

const ALL_NAV_ITEMS = [...SCOOP_NAV_ITEMS, SETTINGS_NAV_ITEM];

// Física de mola rápida para abertura a 120Hz
const SPRING_TRANSITION = {
  type: "spring",
  mass: 0.12,
  stiffness: 200,
  damping: 15,
};

// Fechamento cúbico suave macOS ProMotion
const CUBIC_EXIT_TRANSITION = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
};

const MACOS_EASING = [0.16, 1, 0.3, 1];

/**
 * DockRail: Barra lateral flutuante estilo macOS ProMotion 120Hz.
 * 
 * 1. Janela Estável: Zero resize Cocoa no hover. Hit-testing passivo via set_ignore_cursor_events.
 * 2. Casca Limpa: Zero caminhos SVG cortando bordas.
 * 3. The Scoop: Orelhas com gradientes radiais invertidos de 14px (delta anti-aliasing 0.5px),
 *    corpo border-radius 18px e acabamento #08080a/90 backdrop-blur-2xl.
 * 4. Tracinho Minimalista: Revela bolha circular de configurações de 32px ao hover.
 */
export function DockRail({
  activeTab = "inbox",
  onTabChange,
  highUrgencyCount = 0,
  isOpen = false,
  onToggleFlyout,
  preset = "Right",
  isPuck = false,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [dockMode, setDockMode] = useState("notch");
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);
  const settingsLeaveTimeoutRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const isVerticalPreset = preset === "Right" || preset === "Left";

  // Callback ao sair de todas as áreas interativas: obedece evento do Rust
  const handleCursorFora = useCallback(() => {
    if (!isOpenRef.current) {
      setIsHovered(false);
      setIsSettingsHovered(false);
      setDockMode("notch");
    }
  }, []);

  // Hook que mede elementos interativos e despacha ao backend Rust
  useAreaInterativa("[data-cortex-interactive]", handleCursorFora);

  // Sincroniza eventos de modo emitidos com autoridade pelo backend Rust
  useEffect(() => {
    let unlisten;
    listen("dock-mode-changed", (event) => {
      if (event.payload) {
        if (!isOpenRef.current || event.payload === "flyout") {
          setDockMode(event.payload);
        }
        if (event.payload === "scoop") {
          setIsHovered(true);
        } else if (event.payload === "notch") {
          setIsHovered(false);
        }
      }
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (settingsLeaveTimeoutRef.current) clearTimeout(settingsLeaveTimeoutRef.current);
    };
  }, []);

  // Hover handler de entrada: ativação imediata
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setDockMode("scoop");
  }, []);

  const handleItemClick = (tabId) => {
    if (activeTab === tabId && onToggleFlyout) {
      onToggleFlyout();
    } else {
      onTabChange?.(tabId);
    }
  };

  // Peek Trigger da Bolha de Configurações
  const handleSettingsMouseEnter = () => {
    if (settingsLeaveTimeoutRef.current) {
      clearTimeout(settingsLeaveTimeoutRef.current);
      settingsLeaveTimeoutRef.current = null;
    }
    setIsSettingsHovered(true);
  };

  const handleSettingsMouseLeave = () => {
    if (settingsLeaveTimeoutRef.current) {
      clearTimeout(settingsLeaveTimeoutRef.current);
    }
    settingsLeaveTimeoutRef.current = setTimeout(() => {
      setIsSettingsHovered(false);
    }, 180);
  };

  const handleContractToPuck = () => {
    invoke("set_dragging_puck", { enabled: true }).catch((err) => {
      console.error("Falha ao recolher dock para modo bolinha:", err);
    });
  };

  // Desambiguação de clique vs arrasto no Modo Puck
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
        data-cortex-interactive="true"
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
        data-cortex-interactive="true"
        transition={springConfig}
        onDoubleClick={handleContractToPuck}
        aria-label="Cortex Navigation Pill TopCenter"
        className="obsidian-surface fixed top-0 left-1/2 -translate-x-1/2 z-50 flex flex-row items-center h-11 w-[260px] px-3 py-1 gap-2 rounded-full border border-white/[0.12] shadow-2xl shadow-black/60 select-none pointer-events-auto cursor-default"
      >
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

        <div className="h-4 w-px bg-white/10 shrink-0" />

        <nav 
          className="flex flex-row gap-1 items-center flex-1 justify-center"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {ALL_NAV_ITEMS.map((item) => {
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

        <div className="h-4 w-px bg-white/10 shrink-0" />

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

  // ==========================================
  // MODO VERTICAL (Right ou Left)
  // Ancoragem Fixa de 60px x 300px (Zero Resize Cocoa no Hover)
  // Transplante Niko: Orelhas Radiais Invertidas e Hit-Testing Passivo
  // ==========================================
  const isLeft = preset === "Left";
  const tooltipSide = isLeft ? "right" : "left";

  const isExpanded = isVerticalPreset
    ? dockMode === "scoop" || dockMode === "flyout" || isOpen || isHovered
    : Boolean(isOpen || isHovered);

  const showSettingsBubble = isSettingsHovered || activeTab === "settings";

  // Container de 60px fixo, 100% transparente, sem bordas ou sombras vazando
  const containerClasses = cn(
    "fixed top-1/2 -translate-y-1/2 z-50 flex flex-col justify-center select-none pointer-events-auto h-[300px] w-[60px] bg-transparent border-none outline-none shadow-none",
    isLeft ? "left-0 items-start" : "right-0 items-end"
  );

  return (
    <aside
      aria-label="Cortex Navigation Rail"
      className={containerClasses}
      onMouseEnter={handleMouseEnter}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!isExpanded ? (
          /* ==============================================================
             ESTADO RETRAÍDO: O Edge Notch na Borda
             Zero caminhos Bézier quebrados: Acabamento límpido com orelhas radiais
             Colado estritamente à borda da tela.
             ============================================================== */
          <motion.div
            key="dock-notch"
            data-cortex-interactive="true"
            initial={{ opacity: 0, x: isLeft ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isLeft ? -16 : 16 }}
            transition={{ duration: 0.18, ease: MACOS_EASING }}
            style={{ willChange: "transform, opacity", transform: "translate3d(0,0,0)" }}
            className={cn(
              "relative flex flex-col items-center justify-center w-[22px] h-[132px] pointer-events-auto cursor-pointer drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] group border-none bg-[#08080a]/90 backdrop-blur-2xl border-y border-white/[0.08]",
              isLeft ? "rounded-r-[12px] border-r" : "rounded-l-[12px] border-l"
            )}
            onClick={() => {
              setIsHovered(true);
              setDockMode("scoop");
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
                setDockMode("scoop");
                if (!isOpen && onToggleFlyout) {
                  onToggleFlyout();
                }
              }
            }}
          >
            {/* Orelha superior radial invertida do Notch */}
            <div
              className={cn("absolute -top-[10px] w-[10px] h-[10px] pointer-events-none", isLeft ? "left-0" : "right-0")}
              style={{
                background: isLeft
                  ? "radial-gradient(circle at 0 0, transparent 9.5px, #08080a 10px)"
                  : "radial-gradient(circle at 100% 0, transparent 9.5px, #08080a 10px)",
              }}
            />

            {/* Orelha inferior radial invertida do Notch */}
            <div
              className={cn("absolute -bottom-[10px] w-[10px] h-[10px] pointer-events-none", isLeft ? "left-0" : "right-0")}
              style={{
                background: isLeft
                  ? "radial-gradient(circle at 0 100%, transparent 9.5px, #08080a 10px)"
                  : "radial-gradient(circle at 100% 100%, transparent 9.5px, #08080a 10px)",
              }}
            />

            {/* Conteúdo interno: 4 dots de grip e CORTEX vertical */}
            <div
              className={cn(
                "relative z-10 flex flex-col items-center justify-center gap-2 pointer-events-none",
                isLeft ? "pl-0.5" : "pr-0.5"
              )}
            >
              {/* Grip icon: 4 dots '::' */}
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

              {/* Tipografia Vertical "CORTEX" */}
              <span
                className="text-[8.5px] font-semibold tracking-[0.22em] text-white/60 group-hover:text-white/90 uppercase select-none transition-colors"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                CORTEX
              </span>
            </div>
          </motion.div>
        ) : (
          /* ==============================================================
             ESTADO EXPANDIDO: THE SCOOP COM ORELHAS RADIAIS INVERTIDAS
             1. Orelhas radiais de 14px com delta 0.5px conectando à borda da tela.
             2. Corpo em border-radius 18px com acabamento #08080a/90 backdrop-blur-2xl.
             3. 3 Botões em slots de 32px com anel esmeralda no ativo.
             4. Tracinho minimalista na base que infla na bolha de configurações.
             ============================================================== */
          <div
            key="dock-expanded-group"
            className={cn(
              "flex flex-col justify-center w-[60px] pointer-events-auto border-none bg-transparent",
              isLeft ? "items-start" : "items-end"
            )}
          >
            {/* 1. CÁPSULA SUPERIOR: The Scoop (3 Botões em Slots de 32px) */}
            <motion.div
              key="dock-scoop"
              data-cortex-interactive="true"
              initial={{ opacity: 0, x: isLeft ? -28 : 28 }}
              animate={{ opacity: 1, x: 0, transition: SPRING_TRANSITION }}
              exit={{ opacity: 0, x: isLeft ? -28 : 28, transition: CUBIC_EXIT_TRANSITION }}
              style={{ willChange: "transform, opacity", transform: "translate3d(0,0,0)" }}
              className={cn(
                "relative flex flex-col items-center justify-center w-[52px] py-3.5 pointer-events-auto drop-shadow-[0_8px_32px_rgba(0,0,0,0.65)] bg-[#08080a]/90 backdrop-blur-2xl border-y border-white/[0.08]",
                isLeft
                  ? "rounded-r-[18px] border-r border-l-0"
                  : "rounded-l-[18px] border-l border-r-0"
              )}
            >
              {/* Orelha superior radial invertida (14px com delta de anti-aliasing de 0.5px) */}
              <div
                className={cn("absolute -top-[14px] w-[14px] h-[14px] pointer-events-none", isLeft ? "left-0" : "right-0")}
                style={{
                  background: isLeft
                    ? "radial-gradient(circle at 0 0, transparent 13.5px, #08080a 14px)"
                    : "radial-gradient(circle at 100% 0, transparent 13.5px, #08080a 14px)",
                }}
              />

              {/* Orelha inferior radial invertida (14px com delta de anti-aliasing de 0.5px) */}
              <div
                className={cn("absolute -bottom-[14px] w-[14px] h-[14px] pointer-events-none", isLeft ? "left-0" : "right-0")}
                style={{
                  background: isLeft
                    ? "radial-gradient(circle at 0 100%, transparent 13.5px, #08080a 14px)"
                    : "radial-gradient(circle at 100% 100%, transparent 13.5px, #08080a 14px)",
                }}
              />

              {/* 3 Botões em slots de 32px (Inbox, Calendário, Notas) com anel circular esmeralda no item ativo */}
              <nav
                className="relative z-10 flex flex-col items-center justify-center gap-2 pointer-events-auto border-none bg-transparent"
                aria-label="Cortex Apps"
              >
                {SCOOP_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const showBadge = item.badgeField === "unread" && highUrgencyCount > 0;

                  return (
                    <Tooltip key={item.id} delayDuration={150}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleItemClick(item.id)}
                          className={cn(
                            "relative flex items-center justify-center w-8 h-8 rounded-full outline-none transition-all duration-150 cursor-pointer select-none",
                            isActive
                              ? "ring-1.5 ring-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)] bg-emerald-500/10 text-white"
                              : "text-white/70 hover:text-white bg-transparent hover:bg-white/[0.08] active:scale-95"
                          )}
                          aria-label={item.label}
                          aria-pressed={isActive}
                        >
                          <Icon className={cn("w-4 h-4 stroke-[1.8]", isActive ? "text-white" : "text-white/80")} />
                          {showBadge && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white shadow-[0_0_6px_rgba(239,68,68,0.8)] border border-black/40">
                              {highUrgencyCount > 9 ? "9+" : highUrgencyCount}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side={tooltipSide}
                        sideOffset={14}
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
            </motion.div>

            {/* 2. PEEK TRIGGER DE CONFIGURAÇÕES:
                Em repouso: tracinho minimalista na base
                Ao hover: revela a bolha de configurações de 32px com a engrenagem
            */}
            <div
              data-cortex-interactive="true"
              className={cn(
                "mt-2.5 relative flex items-center w-[52px] h-9 pointer-events-auto border-none bg-transparent justify-center"
              )}
              onMouseEnter={handleSettingsMouseEnter}
              onMouseLeave={handleSettingsMouseLeave}
            >
              <AnimatePresence mode="wait">
                {!showSettingsBubble ? (
                  /* Tracinho minimalista na base que revela a bolha ao passar o mouse */
                  <motion.div
                    key="settings-dash"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.18, ease: MACOS_EASING }}
                    className="flex items-center justify-center cursor-pointer p-2 group border-none bg-transparent"
                    onClick={() => handleItemClick(SETTINGS_NAV_ITEM.id)}
                    aria-label="Configurações (Expandir)"
                  >
                    <div className="w-4 h-[2.5px] rounded-full bg-white/30 group-hover:bg-white/70 transition-all duration-150" />
                  </motion.div>
                ) : (
                  /* Bolha circular de 32px com a engrenagem */
                  <motion.div
                    key="settings-bubble"
                    initial={{ opacity: 0, scale: 0.7, x: isLeft ? -8 : 8 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.7, x: isLeft ? -8 : 8 }}
                    transition={{ duration: 0.18, ease: MACOS_EASING }}
                    style={{ willChange: "transform, opacity", transform: "translate3d(0,0,0)" }}
                    className="flex items-center justify-center pointer-events-auto border-none bg-transparent"
                  >
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleItemClick(SETTINGS_NAV_ITEM.id)}
                          className={cn(
                            "relative flex items-center justify-center w-8 h-8 rounded-full outline-none transition-all duration-150 cursor-pointer select-none",
                            "bg-[#08080a]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.6)]",
                            activeTab === SETTINGS_NAV_ITEM.id
                              ? "ring-1.5 ring-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)] text-white bg-emerald-500/10"
                              : "text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-95"
                          )}
                          aria-label={SETTINGS_NAV_ITEM.label}
                          aria-pressed={activeTab === SETTINGS_NAV_ITEM.id}
                        >
                          <Settings className={cn("w-[15px] h-[15px] stroke-[1.8]", activeTab === SETTINGS_NAV_ITEM.id ? "text-white" : "text-white/70 group-hover:text-white")} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side={tooltipSide}
                        sideOffset={14}
                        className="bg-[#181820]/95 backdrop-blur-md border-white/10 text-white shadow-xl text-xs py-1 px-2.5 rounded-lg flex items-center gap-2"
                      >
                        <span>{SETTINGS_NAV_ITEM.label}</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-white/40 bg-white/[0.06] rounded border border-white/10">
                          {SETTINGS_NAV_ITEM.shortcut}
                        </kbd>
                      </TooltipContent>
                    </Tooltip>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </AnimatePresence>
    </aside>
  );
}

export default DockRail;
