import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { isSafeMeetingUrl } from "@/lib/utils";
import { cn } from "cn";
import { Calendar as CalendarIcon, Clock, Link2, Sparkles, Video } from "lucide-react";

const CATEGORIES = [
  { id: "meeting", label: "Reunião", color: "#10B981" },
  { id: "focus", label: "Foco", color: "#38BDF8" },
  { id: "one_on_one", label: "1:1 Sync", color: "#F59E0B" },
  { id: "strategy", label: "Estratégia", color: "#A855F7" },
];

/**
 * Calculates human readable duration between two time strings ("HH:MM")
 */
function calculateDuration(start, end) {
  if (!start || !end) return "30 min";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return "30 min";
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins} min`;
}

/**
 * Detects platform name based on URL
 */
function detectPlatform(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("zoom")) return "zoom";
  if (lower.includes("meet.google")) return "meet";
  if (lower.includes("teams")) return "teams";
  return "video";
}

/**
 * EventFormDialog: Modal de Criação e Edição de Compromissos no Cortex
 * Estilo Liquid Glass, estritamente alinhado ao security.md.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {(eventData: Object) => void} props.onSave
 * @param {Object|null} [props.initialData]
 * @param {Date} [props.currentDate]
 */
export function EventFormDialog({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  currentDate = new Date(),
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:45");
  const [meetingLink, setMeetingLink] = useState("");
  const [category, setCategory] = useState("meeting");
  const [categoryColor, setCategoryColor] = useState("#10B981");
  const [destination, setDestination] = useState("apple"); // 'apple' | 'google'
  const [urlError, setUrlError] = useState("");

  // Pré-popula campos quando estiver em modo de edição
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || "");
      setStartTime(initialData.startTime || "09:00");
      setEndTime(initialData.endTime || "09:45");
      setMeetingLink(initialData.meetingLink || "");
      setCategory(initialData.category || "meeting");
      setCategoryColor(initialData.categoryColor || "#10B981");
      setDestination(initialData.destination || "apple");
      setUrlError("");
    } else {
      // Valores padrão para novo evento
      setTitle("");
      setStartTime("09:00");
      setEndTime("09:45");
      setMeetingLink("");
      setCategory("meeting");
      setCategoryColor("#10B981");
      setDestination("apple");
      setUrlError("");
    }
  }, [initialData, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    // Validação Zero Trust de URL de reunião se fornecida
    const trimmedLink = meetingLink.trim();
    if (trimmedLink) {
      if (!isSafeMeetingUrl(trimmedLink)) {
        setUrlError("Link inválido. Deve começar com https:// ou zoommtg://");
        return;
      }
    }

    const duration = calculateDuration(startTime, endTime);
    const platform = detectPlatform(trimmedLink);

    const eventPayload = {
      id: initialData?.id || `evt-${Date.now()}`,
      title: trimmedTitle,
      description: initialData?.description || "Compromisso sincronizado via Cortex.",
      startTime,
      endTime,
      duration,
      category,
      categoryColor,
      platform,
      meetingLink: trimmedLink || null,
      destination,
      organizer: initialData?.organizer || "Pedro Ramos (You)",
      isOrganizer: initialData ? initialData.isOrganizer : true,
      // Preservação rigorosa do contrato de attendees (Google Calendar / EventKit)
      attendees: initialData?.attendees || [
        { name: "Pedro Ramos", email: "pedro@cortex.ai", status: "accepted", isYou: true }
      ]
    };

    onSave(eventPayload);
    onClose();
  };

  const isEditing = Boolean(initialData);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="bg-[#14141b]/95 border-white/15 text-white backdrop-blur-2xl shadow-2xl rounded-2xl max-w-[340px] p-4.5 sm:max-w-[360px]"
        showCloseButton={true}
      >
        <DialogHeader className="text-left pb-1 border-b border-white/10">
          <DialogTitle className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor }} />
            <span>{isEditing ? "Editar Compromisso" : "Novo Compromisso"}</span>
          </DialogTitle>
          <DialogDescription className="text-[11px] text-white/50">
            Sincronização integrada com Apple e Google Calendar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-1">
          {/* 1. Título do Evento */}
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-medium text-white/60">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Alinhamento de Produto"
              required
              maxLength={120}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
            />
          </div>

          {/* 2. Horários de Início e Fim */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10.5px] font-medium text-white/60 flex items-center gap-1">
                <Clock className="w-3 h-3 text-white/35" />
                <span>Início</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10.5px] font-medium text-white/60 flex items-center gap-1">
                <Clock className="w-3 h-3 text-white/35" />
                <span>Fim</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
              />
            </div>
          </div>

          {/* 3. Link da Reunião (Zoom, Meet, Teams) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-medium text-white/60 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3 text-white/35" />
                <span>Link da Reunião (Opcional)</span>
              </span>
              <span className="text-[9.5px] text-white/35">Zoom / Meet</span>
            </label>
            <input
              type="text"
              value={meetingLink}
              onChange={(e) => {
                setMeetingLink(e.target.value);
                setUrlError("");
              }}
              placeholder="https://zoom.us/j/... ou Meet"
              className={cn(
                "w-full bg-white/[0.06] border rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none transition-all",
                urlError
                  ? "border-red-500/60 focus:ring-1 focus:ring-red-500/30"
                  : "border-white/10 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
              )}
            />
            {urlError && (
              <span className="text-[10px] text-red-400 font-medium leading-tight">
                {urlError}
              </span>
            )}
          </div>

          {/* 4. Categoria & Cor */}
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-medium text-white/60">
              Categoria & Cor
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = categoryColor === cat.color;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategory(cat.id);
                      setCategoryColor(cat.color);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all text-center outline-none",
                      isSelected
                        ? "bg-white/[0.12] border-white/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] ring-1 ring-white/10"
                        : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shadow-[0_0_6px_rgba(255,255,255,0.2)]"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-[9px] font-medium text-white/80 truncate w-full">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Toggle de Destino (Apple vs Google) */}
          <div className="flex flex-col gap-1 pt-0.5">
            <label className="text-[10.5px] font-medium text-white/60">
              Destino
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDestination("apple")}
                className={cn(
                  "py-1.5 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all outline-none",
                  destination === "apple"
                    ? "bg-blue-600/25 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                    : "bg-white/[0.04] text-white/50 border-white/10 hover:text-white/80"
                )}
              >
                <span> Apple Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => setDestination("google")}
                className={cn(
                  "py-1.5 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all outline-none",
                  destination === "google"
                    ? "bg-blue-600/25 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                    : "bg-white/[0.04] text-white/50 border-white/10 hover:text-white/80"
                )}
              >
                <span>Google Calendar</span>
              </button>
            </div>
          </div>

          {/* 6. Ações (Cancelar / Salvar) */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs text-white/60 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors outline-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.4)] border border-blue-400/40 transition-all active:scale-[0.98] outline-none"
            >
              {isEditing ? "Salvar Alterações" : "Criar Evento"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EventFormDialog;
