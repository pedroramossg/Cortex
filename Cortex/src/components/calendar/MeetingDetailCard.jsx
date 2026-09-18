import React from "react";
import { 
  Video, 
  Pencil, 
  Trash2, 
  Users, 
  CheckCircle2, 
  HelpCircle, 
  Clock, 
  Circle,
  Calendar as CalendarIcon,
  ShieldAlert
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn, isSafeMeetingUrl } from "@/lib/utils";

export { isSafeMeetingUrl };

/**
 * Extracts initials from attendee name (e.g. "Tahlia Smith" -> "TS")
 */
function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "??";
}

/**
 * Status icon resolver for attendee RSVP
 */
function AttendeeStatusIcon({ status }) {
  switch (status) {
    case "accepted":
      return (
        <span title="Confirmado" className="flex items-center text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
        </span>
      );
    case "tentative":
      return (
        <span title="Talvez / Tentativo" className="flex items-center text-amber-400">
          <HelpCircle className="w-3 h-3" />
        </span>
      );
    case "needsAction":
    default:
      return (
        <span title="Pendente" className="flex items-center text-white/40">
          <Circle className="w-3 h-3" />
        </span>
      );
  }
}

/**
 * MeetingDetailCard: Card expandido no rodapé da timeline exibindo detalhes do compromisso selecionado.
 * Segue estritamente as diretrizes do security.md (Check 2 e Check 15).
 * 
 * @param {Object} props
 * @param {Object} props.event - Evento selecionado
 * @param {(event: Object) => void} [props.onEdit] - Callback de edição
 * @param {(event: Object) => void} [props.onDelete] - Callback de exclusão
 */
export function MeetingDetailCard({
  event,
  onEdit,
  onDelete,
}) {
  if (!event) return null;

  const handleJoin = async () => {
    if (!event.meetingLink) return;

    if (!isSafeMeetingUrl(event.meetingLink)) {
      console.error("Link de reunião bloqueado por política de segurança Zero Trust:", event.meetingLink);
      return;
    }

    try {
      await openUrl(event.meetingLink);
    } catch (err) {
      console.warn("openUrl falhou ou executando fora do Tauri, aplicando fallback seguro:", err);
      if (typeof window !== "undefined") {
        window.open(event.meetingLink, "_blank", "noopener,noreferrer");
      }
    }
  };

  const getJoinButtonLabel = () => {
    if (event.platform === "zoom") return "Join with Zoom";
    if (event.platform === "meet") return "Join with Google Meet";
    return "Entrar na Reunião";
  };

  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);

  React.useEffect(() => {
    setIsConfirmingDelete(false);
  }, [event?.id]);

  const hasVideoLink = Boolean(event.meetingLink);

  return (
    <div 
      data-testid="meeting-detail-card"
      className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col gap-2.5 shrink-0 select-none"
    >
      {/* 1. Header com Título, Horário e Organizador */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h4 className="text-[13px] font-semibold text-white tracking-tight leading-snug truncate flex-1 min-w-0">
            {event.title}
          </h4>

          {/* Ações Secundárias Discretas (Editar / Excluir com Confirmação) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit?.(event)}
              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white/50 hover:text-white flex items-center justify-center transition-colors border border-white/10 outline-none"
              title="Editar compromisso"
              aria-label="Editar compromisso"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {isConfirmingDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete?.(event);
                  setIsConfirmingDelete(false);
                }}
                onBlur={() => setIsConfirmingDelete(false)}
                className="h-7 px-2 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[10.5px] font-medium flex items-center gap-1 border border-red-400/50 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse outline-none"
                title="Confirmar exclusão deste compromisso"
              >
                <span>Excluir?</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-red-500/20 text-white/50 hover:text-red-400 flex items-center justify-center transition-colors border border-white/10 hover:border-red-500/30 outline-none"
                title="Excluir compromisso"
                aria-label="Excluir compromisso"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Metadados: Data/Hora e Organizador */}
        <div className="flex items-center justify-between text-[11px] text-white/50 min-w-0 gap-1.5">
          <span className="flex items-center gap-1.5 shrink-0">
            <Clock className="w-3 h-3 text-white/35 shrink-0" />
            <span className="truncate">{event.startTime} - {event.endTime} ({event.duration})</span>
          </span>
          <span className="truncate max-w-[120px] text-right font-medium text-white/60 shrink-0">
            {event.isOrganizer ? "Organizado por você" : `Por ${event.organizer}`}
          </span>
        </div>
      </div>

      {/* 2. Botão Primário com Ação de Vídeo (Zoom / Meet) */}
      {hasVideoLink && (
        <button
          type="button"
          onClick={handleJoin}
          className={cn(
            "w-full py-2 px-3 rounded-xl font-medium text-xs tracking-tight",
            "flex items-center justify-center gap-2 transition-all active:scale-[0.98] outline-none shadow-md",
            event.platform === "zoom"
              ? "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_16px_rgba(37,99,235,0.4)] border border-blue-400/40"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)] border border-emerald-400/40"
          )}
        >
          <Video className="w-3.5 h-3.5 shrink-0" />
          <span>{getJoinButtonLabel()}</span>
        </button>
      )}

      {/* 3. Lista de Participantes (Invitees com status de presença) */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/40">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-white/30" />
              <span>Participantes ({event.attendees.length})</span>
            </span>
            <span className="text-[9px] text-white/30 lowercase">
              {event.attendees.filter(a => a.status === "accepted").length} confirmados
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[64px] overflow-y-auto pr-0.5">
            {event.attendees.map((attendee, idx) => (
              <div
                key={attendee.email || `${attendee.name}-${idx}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-white/80"
                title={`${attendee.name} (${attendee.status || "pendente"})`}
              >
                <span className="w-4 h-4 rounded-full bg-white/10 text-[8.5px] font-bold text-white/90 flex items-center justify-center shrink-0 border border-white/10">
                  {getInitials(attendee.name)}
                </span>
                <span className="truncate max-w-[90px]">
                  {attendee.isYou ? "Você" : attendee.name.split(" ")[0]}
                </span>
                <AttendeeStatusIcon status={attendee.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingDetailCard;
