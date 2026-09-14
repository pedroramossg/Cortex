import React from "react";
import { 
  AlertCircle, 
  CheckCircle2, 
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
  // Remove email if present in brackets
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
  if (diffMinutes < 60) return `Há ${diffMinutes}m`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  return `Há ${diffDays}d`;
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
 * Estritamente tipado contra a tabela triaged_messages.
 * Zero dangerouslySetInnerHTML conforme security.md Check 15.
 * 
 * @param {Object} props
 * @param {Object} props.message
 * @param {string} props.message.id
 * @param {string} props.message.sender
 * @param {string} props.message.subject
 * @param {string} props.message.snippet
 * @param {'HIGH' | 'MEDIUM' | 'LOW'} [props.message.urgency]
 * @param {boolean} [props.message.is_approval_pending]
 * @param {boolean} [props.message.requires_action]
 * @param {string|Date} [props.message.received_at]
 * @param {string} [props.message.service]
 * @param {boolean} [props.isSelected]
 * @param {() => void} [props.onClick]
 */
export function NotificationCard({
  message,
  isSelected = false,
  onClick,
}) {
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

  return (
    <div
      onClick={onClick}
      className={cn(
        "card-surface rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all duration-150 relative select-none",
        isSelected
          ? "border-blue-500/40 bg-white/[0.08] shadow-[inset_0_1px_0_0_rgba(59,130,246,0.2)]"
          : "border-white/10 hover:border-white/20 hover:bg-white/[0.06]"
      )}
    >
      {/* Header: Avatar, Remetente, Serviço e Timestamp */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <Avatar className="w-7 h-7 bg-white/10 border border-white/15 text-[11px] font-semibold text-white">
              <AvatarFallback className="bg-gradient-to-br from-white/15 to-white/5 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Unread indicator dot */}
            {urgency === "HIGH" && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-white/95 truncate">
                {displayName}
              </span>
              <ServiceIcon service={service} />
            </div>
            <span className="text-[11px] font-medium text-white/80 truncate">
              {subject}
            </span>
          </div>
        </div>

        <span className="text-[10px] text-white/40 font-mono shrink-0 whitespace-nowrap">
          {formattedTime}
        </span>
      </div>

      {/* Snippet de Texto Seguro (Anti-XSS: Zero dangerouslySetInnerHTML) */}
      <p className="text-[11px] text-white/60 line-clamp-2 leading-relaxed pl-9">
        {snippet}
      </p>

      {/* Badges de Status & Urgência */}
      <div className="flex items-center gap-1.5 pl-9 flex-wrap">
        {urgency === "HIGH" && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-red-500/40 text-red-300 bg-red-500/15 font-semibold"
          >
            <AlertCircle className="w-2.5 h-2.5 mr-1" />
            URGENTE
          </Badge>
        )}

        {requires_action && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-300 bg-amber-500/15"
          >
            Ação Requerida
          </Badge>
        )}

        {is_approval_pending && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-blue-500/40 text-blue-300 bg-blue-500/15"
          >
            <Clock className="w-2.5 h-2.5 mr-1" />
            Pendente
          </Badge>
        )}
      </div>
    </div>
  );
}

export default NotificationCard;
