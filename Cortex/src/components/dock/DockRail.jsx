import React from "react";
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
 * DockRail: Barra lateral flutuante estilo macOS (Liquid Glass)
 * 
 * @param {Object} props
 * @param {DockTab} props.activeTab - Aba atualmente ativa
 * @param {(tab: DockTab) => void} props.onTabChange - Callback disparado ao selecionar aba
 * @param {number} [props.highUrgencyCount=0] - Contagem de mensagens urgentes para o badge
 * @param {boolean} [props.isOpen=true] - Se o painel flyout está expandido
 * @param {() => void} [props.onToggleFlyout] - Alterna visibilidade do flyout
 */
export function DockRail({
  activeTab = "inbox",
  onTabChange,
  highUrgencyCount = 0,
  isOpen = true,
  onToggleFlyout,
}) {
  const handleItemClick = (tabId) => {
    if (activeTab === tabId && onToggleFlyout) {
      // Clicar no item já ativo alterna o flyout
      onToggleFlyout();
    } else {
      onTabChange?.(tabId);
    }
  };

  return (
    <aside
      aria-label="Cortex Navigation Rail"
      className="dock-surface fixed right-3 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center py-3 px-2 rounded-2xl select-none pointer-events-auto"
    >
      {/* Top Brand Logo / Pulse Indicator */}
      <div className="mb-4 flex items-center justify-center">
        <div 
          className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] cursor-pointer hover:bg-white/[0.1] transition-colors"
          onClick={onToggleFlyout}
          title="Alternar Painel Cortex"
        >
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex flex-col gap-2 items-center">
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
                      className="absolute -left-1.5 w-1 h-5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
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
                side="left" 
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
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-col items-center">
        <span 
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isOpen ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-white/20"
          }`}
          title={isOpen ? "Painel Aberto" : "Painel Fechado"}
        />
      </div>
    </aside>
  );
}

export default DockRail;
