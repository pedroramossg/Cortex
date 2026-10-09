import React, { useState } from "react";
import { 
  AlertCircle, 
  Check, 
  Clock, 
  Mail, 
  Hash, 
  MessageSquare, 
  Camera 
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/**
 * Extracts initials from a sender string (e.g. "Satya Nadella <satya@...>" -> "SN")
 */
function getInitials(sender = "") {
  const cleanName = sender.replace(/<.*?>/, "").trim();
  if (!cleanName) return "??";
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleanName.slice(0, 2).toUpperCase();
}

/**
 * Extracts clean display name from sender
 */
function getDisplayName(sender = "") {
  const cleanName = sender.replace(/<.*?>/, "").trim();
  return cleanName || sender;
}

/**
 * Formats relative time (e.g. "Há 5 min", "Há 2h")
 */
function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

/**
 * Service icon resolver
 */
function ServiceIcon({ service }) {
  switch (service) {
    case "gmail":
      return <Mail className="w-3 h-3 text-red-400" />;
    case "slack":
      return <Hash className="w-3 h-3 text-emerald-400" />;
    case "whatsapp":
      return <MessageSquare className="w-3 h-3 text-green-400" />;
    case "instagram":
      return <Camera className="w-3 h-3 text-pink-400" />;
    default:
      return <Mail className="w-3 h-3 text-blue-400" />;
  }
}

/**
 * NotificationCard: Card de notificação para a Sidebar
 * Estilizado com tokens e profundidade do Niko (.cartao, checkbox circular tátil)
 */
export function NotificationCard({
  message,
  isSelected = false,
  onClick,
}) {
  const [completed, setCompleted] = useState(false);

  const {
    sender = "",
    subject = "",
    snippet = "",
    urgency = "MEDIUM",
    is_approval_pending = false,
    requires_action = false,
    received_at,
    service = "gmail",
  } = message || {};

  const initials = getInitials(sender);
  const displayName = getDisplayName(sender);
  const formattedTime = formatRelativeTime(received_at);

  const handleToggleCheck = (e) => {
    e.stopPropagation();
    setCompleted((prev) => !prev);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "cartao-clicavel rounded-[14px] p-3.5 flex flex-col gap-2 relative select-none transition-all",
        "bg-[#161618] border border-white/[0.06] hover:border-white/[0.14]",
        isSelected && "border-[#a78bfa]/50 bg-[#1d1d20] shadow-[0_0_16px_rgba(167,139,250,0.15)] ring-1 ring-[#a78bfa]/40",
        completed && "opacity-55"
      )}
    >
      {/* Header: Checkbox Circular Tátil, Avatar, Remetente, Serviço e Timestamp */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Checkbox Circular Tátil */}
          <button
            type="button"
            onClick={handleToggleCheck}
            className={cn(
              "w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-150 shrink-0 cursor-pointer outline-none mt-0.5",
              completed
                ? "bg-[#a78bfa] border-[#a78bfa] text-[#0e0e10] shadow-[0_0_8px_rgba(167,139,250,0.5)] scale-105"
                : "border-white/20 bg-white/[0.04] hover:border-white/40 active:scale-90"
            )}
            title={completed ? "Marcar como pendente" : "Concluir pendência"}
            aria-label={completed ? "Marcar como pendente" : "Concluir pendência"}
          >
            {completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </button>

          <div className="relative shrink-0">
            <Avatar className="w-6 h-6 bg-white/10 border border-white/15 text-[10px] font-semibold text-white">
              <AvatarFallback className="bg-gradient-to-br from-white/15 to-white/5 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            {urgency === "HIGH" && !completed && (
              <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex flex-col flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-xs font-semibold text-[#f2f2f2] truncate",
                completed && "line-through text-white/50"
              )}>
                {displayName}
              </span>
              <ServiceIcon service={service} />
            </div>
            <span className="text-[11px] font-medium text-[#9a9aa0] truncate">
              {subject}
            </span>
          </div>
        </div>

        <span className="text-[10px] text-white/40 font-mono tabular-nums shrink-0 whitespace-nowrap">
          {formattedTime}
        </span>
      </div>

      {/* Snippet de Texto Seguro (Anti-XSS: Zero dangerouslySetInnerHTML) */}
      <p className="text-[11px] text-[#9a9aa0] line-clamp-2 leading-relaxed pl-6.5">
        {snippet}
      </p>

      {/* Tags Coloridas Modulares */}
      <div className="flex items-center gap-1.5 pl-6.5 flex-wrap">
        {urgency === "HIGH" && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-red-500/30 text-red-300 bg-red-500/15 font-semibold tracking-wide uppercase"
          >
            <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
            Urgente
          </Badge>
        )}

        {requires_action && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-300 bg-amber-500/15 font-medium tracking-wide uppercase"
          >
            Ação Requerida
          </Badge>
        )}

        {is_approval_pending && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-blue-500/30 text-blue-300 bg-blue-500/15 font-medium tracking-wide uppercase"
          >
            <Clock className="w-2.5 h-2.5 mr-0.5" />
            Pendente
          </Badge>
        )}
      </div>
    </div>
  );
}

export default NotificationCard;
