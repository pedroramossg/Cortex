import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAppleCalendars } from "@/services/calendarApi";
import { isSafeMeetingUrl } from "@/lib/utils";
import { cn } from "cn";
import { Clock, Link2, Sparkles, Calendar as CalendarIcon } from "lucide-react";

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
 * Estilo Liquid Glass, com seleção de calendários reais do sistema (macOS / Apple Calendar).
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
  const [availableCalendars, setAvailableCalendars] = useState([
    { id: "Home", title: "Pessoal", colorHex: "#2C99D3", isWritable: true },
    { id: "Work", title: "Trabalho", colorHex: "#E700F9", isWritable: true },
  ]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("Home");
  const [categoryColor, setCategoryColor] = useState("#2C99D3");
  const [destination, setDestination] = useState("apple"); // 'apple' | 'google'
  const [urlError, setUrlError] = useState("");

  // Busca os calendários reais do macOS
  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      getAppleCalendars().then((cals) => {
        if (isMounted && Array.isArray(cals) && cals.length > 0) {
          setAvailableCalendars(cals);
          if (!initialData) {
            const defaultCal = cals.find((c) => c.isWritable) || cals[0];
            setSelectedCalendarId(defaultCal.id);
            setCategoryColor(defaultCal.colorHex || "#2C99D3");
          }
        }
      }).catch((err) => {
        console.warn("[EventFormDialog] Erro ao carregar calendários reais:", err);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, initialData]);

  // Pré-popula campos quando estiver em modo de edição
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || "");
      setStartTime(initialData.startTime || "09:00");
      setEndTime(initialData.endTime || "09:45");
      setMeetingLink(initialData.meetingLink || "");
      setSelectedCalendarId(initialData.calendarName || initialData.category || "Home");
      setCategoryColor(initialData.categoryColor || "#2C99D3");
      setDestination(initialData.destination || "apple");
      setUrlError("");
    } else {
      setTitle("");
      setStartTime("09:00");
      setEndTime("09:45");
      setMeetingLink("");
      setDestination("apple");
      setUrlError("");
    }
  }, [initialData, isOpen]);

  const handleCalendarChange = (calId) => {
    setSelectedCalendarId(calId);
    const found = availableCalendars.find((c) => c.id === calId);
    if (found && found.colorHex) {
      setCategoryColor(found.colorHex);
    }
  };

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
    const chosenCal = availableCalendars.find((c) => c.id === selectedCalendarId);
    const calendarTitle = chosenCal?.title || selectedCalendarId;

    const eventPayload = {
      id: initialData?.id || `evt-${Date.now()}`,
      title: trimmedTitle,
      description: initialData?.description || "Compromisso sincronizado via Cortex.",
      startTime,
      endTime,
      duration,
      category: selectedCalendarId,
      categoryColor: chosenCal?.colorHex || categoryColor,
      calendarName: calendarTitle,
      platform,
      meetingLink: trimmedLink || null,
      destination,
      organizer: initialData?.organizer || "Pedro Ramos (You)",
      isOrganizer: initialData ? initialData.isOrganizer : true,
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
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
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
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
            />
          </div>

          {/* 2. Horários (Início e Fim) */}
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

          {/* 4. Agenda Real do Sistema (Shadcn Select) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-medium text-white/60 flex items-center gap-1">
              <CalendarIcon className="w-3 h-3 text-white/35" />
              <span>Agenda do Sistema</span>
            </label>
            <Select 
              value={selectedCalendarId} 
              onValueChange={handleCalendarChange}
            >
              <SelectTrigger 
                className="w-full bg-white/[0.06] border border-white/10 text-xs text-white rounded-xl h-9 px-3 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
              >
                <SelectValue placeholder="Selecione a agenda" />
              </SelectTrigger>
              <SelectContent className="bg-[#181824] border-white/15 text-white backdrop-blur-2xl rounded-xl">
                {availableCalendars.map((cal) => (
                  <SelectItem 
                    key={cal.id} 
                    value={cal.id}
                    disabled={cal.isWritable === false}
                    className="focus:bg-white/10 focus:text-white text-xs cursor-pointer py-2 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(255,255,255,0.3)]" 
                        style={{ backgroundColor: cal.colorHex || "#3B82F6" }} 
                      />
                      <span className="font-medium text-white">{cal.title}</span>
                      {cal.isWritable === false && (
                        <span className="text-[9px] text-white/40 ml-1">(Leitura)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  "py-1.5 px-2 rounded-xl text-xs font-medium border transition-all text-center outline-none",
                  destination === "apple"
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                    : "bg-white/[0.04] border-white/10 text-white/60 hover:text-white"
                )}
              >
                Apple Calendar
              </button>
              <button
                type="button"
                onClick={() => setDestination("google")}
                className={cn(
                  "py-1.5 px-2 rounded-xl text-xs font-medium border transition-all text-center outline-none",
                  destination === "google"
                    ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                    : "bg-white/[0.04] border-white/10 text-white/60 hover:text-white"
                )}
              >
                Google Calendar
              </button>
            </div>
          </div>

          {/* 6. Botões de Ação */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition-all outline-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_16px_rgba(37,99,235,0.4)] border border-blue-400/40 active:scale-95 transition-all outline-none"
            >
              {isEditing ? "Salvar Alterações" : "Criar Compromisso"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EventFormDialog;
