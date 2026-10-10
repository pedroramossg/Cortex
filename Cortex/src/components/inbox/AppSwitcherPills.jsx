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
 * AppSwitcherPills: ToggleGroup em estilo pílula minimalista (Niko/Linear)
 * Pills limpas sem bordas pesadas e contador em pill escura.
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
        className="flex items-center gap-1 p-0.5 bg-black/25 border border-white/[0.06] rounded-[10px] w-fit"
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
                "flex items-center gap-1.5 px-2 py-0.5 h-6 rounded-[8px] text-[11px] font-medium transition-all duration-150 cursor-pointer border-none",
                isSelected
                  ? "bg-white/[0.12] text-white shadow-none"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              )}
            >
              <Icon className={cn("w-3 h-3", isSelected ? "text-[#a78bfa]" : "text-white/40")} />
              <span>{service.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-[9px] font-mono px-1 py-0.2 rounded-full min-w-3.5 text-center leading-tight",
                    isSelected
                      ? "bg-black/50 text-[#c4b5fd] border border-[#a78bfa]/30"
                      : "bg-black/40 text-white/40 border border-white/[0.04]"
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
