import React from "react";
import { 
  Inbox, 
  Mail, 
  Hash, 
  MessageSquare, 
  Camera 
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "cn";

/**
 * Service tab configuration for AppSwitcherPills
 */
const SERVICES = [
  { id: "all", label: "Geral", icon: Inbox },
  { id: "gmail", label: "Gmail", icon: Mail },
  { id: "slack", label: "Slack", icon: Hash },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "instagram", label: "Instagram", icon: Camera },
];

/**
 * AppSwitcherPills: ToggleGroup em estilo pílula para filtrar mensagens por serviço
 * 
 * @param {Object} props
 * @param {string} props.selectedApp - Serviço selecionado ('all', 'gmail', etc.)
 * @param {(service: string) => void} props.onSelectApp - Callback disparado na troca de serviço
 * @param {Record<string, number>} [props.counts] - Mapeamento de contadores por serviço
 */
export function AppSwitcherPills({
  selectedApp = "all",
  onSelectApp,
  counts = {},
}) {
  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-none">
      <ToggleGroup
        type="single"
        value={selectedApp}
        onValueChange={(val) => {
          if (val) onSelectApp?.(val);
        }}
        className="flex items-center gap-1 p-0.5 bg-white/[0.04] border border-white/10 rounded-xl w-fit"
      >
        {SERVICES.map((service) => {
          const Icon = service.icon;
          const isSelected = selectedApp === service.id;
          const count = counts[service.id] || 0;

          return (
            <ToggleGroupItem
              key={service.id}
              value={service.id}
              aria-label={service.label}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 h-6 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer",
                isSelected
                  ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] border border-white/15"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent"
              )}
            >
              <Icon className={cn("w-3 h-3", isSelected ? "text-blue-400" : "text-white/50")} />
              <span>{service.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-[9px] font-mono px-1 py-0.2 rounded-full min-w-3.5 text-center leading-tight",
                    isSelected
                      ? "bg-blue-500/30 text-blue-200 border border-blue-500/40"
                      : "bg-white/10 text-white/50"
                  )}
                >
                  {count}
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

export default AppSwitcherPills;
