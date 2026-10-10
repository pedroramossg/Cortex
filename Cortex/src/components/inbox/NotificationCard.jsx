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
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/**
 * Extracts clean display name from sender
 */
function getDisplayName(sender = "") {
  const cleanName = sender.replace(/<.*?>/, "").trim();
  return cleanName || sender;
}

/**
 * Formats relative time (e.g. "5m", "2h", "1d")
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

import { resolveNotificationTag } from "@/services/gmailApi";

export const getSingleTag = resolveNotificationTag;

/**
 * NotificationCard: Card compacto de notificação estilo Niko / Linear
 * Zero poluição visual: 1 tag sutil máxima, assunto vívido, preview de 1 linha.
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

  const displayName = getDisplayName(sender);
  const formattedTime = formatRelativeTime(received_at);
  const tagInfo = getSingleTag(urgency, requires_action, is_approval_pending);

  const handleToggleCheck = (e) => {
    e.stopPropagation();
    setCompleted((prev) => !prev);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "cartao-clicavel rounded-[12px] p-2.5 flex flex-col gap-1.5 relative select-none transition-all cursor-pointer",
        "bg-[#141416] border border-white/[0.05] hover:border-white/[0.12] hover:bg-[#18181b]",
        isSelected && "border-[#a78bfa]/50 bg-[#1c1c20] shadow-[0_0_14px_rgba(167,139,250,0.12)] ring-1 ring-[#a78bfa]/40",
        completed && "opacity-50"
      )}
    >
      {/* Header: Checkbox Circular, Ícone da Plataforma, Nome do Autor, Tag Única e Horário */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Checkbox Circular Tátil */}
          <button
            type="button"
            onClick={handleToggleCheck}
            className={cn(
              "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all shrink-0 cursor-pointer outline-none",
              completed
                ? "bg-[#a78bfa] border-[#a78bfa] text-[#0e0e10] shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                : "border-white/20 bg-white/[0.04] hover:border-white/40 active:scale-90"
            )}
            title={completed ? "Marcar como pendente" : "Concluir pendência"}
            aria-label={completed ? "Marcar como pendente" : "Concluir pendência"}
          >
            {completed && <Check className="w-2 h-2 stroke-[3]" />}
          </button>

          {/* Badge/Ícone sutil da plataforma */}
          <div className="shrink-0 flex items-center justify-center w-4 h-4 rounded bg-white/[0.04]">
            <ServiceIcon service={service} />
          </div>

          {/* Nome do autor */}
          <span className={cn(
            "text-xs font-semibold text-white/90 truncate",
            completed && "line-through text-white/40"
          )}>
            {displayName}
          </span>

          {/* Tag única sutil com precedência estrita */}
          {tagInfo && !completed && (
            <Badge
              variant="outline"
              className={cn("text-[9px] px-1.5 py-0 h-3.5 font-medium tracking-wide uppercase shrink-0 flex items-center", tagInfo.className)}
            >
              {tagInfo.type === "urgent" && <AlertCircle className="w-2.5 h-2.5 mr-0.5" />}
              {tagInfo.type === "pending" && <Clock className="w-2.5 h-2.5 mr-0.5" />}
              {tagInfo.label}
            </Badge>
          )}
        </div>

        {/* Horário relativo */}
        <span className="text-[10px] text-white/40 font-mono tabular-nums shrink-0 whitespace-nowrap">
          {formattedTime}
        </span>
      </div>

      {/* Título / Assunto em branco vívido */}
      <h4 className={cn(
        "text-white/90 font-medium text-sm truncate pl-5.5",
        completed && "line-through text-white/40"
      )}>
        {subject || "(Sem assunto)"}
      </h4>

      {/* Preview: Exatamente 1 linha com snippet real do texto */}
      <p className="text-white/45 text-xs truncate leading-normal pl-5.5">
        {snippet || "(Sem prévia disponível)"}
      </p>
    </div>
  );
}

export default NotificationCard;
