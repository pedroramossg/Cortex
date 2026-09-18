import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Video, 
  Users, 
  Calendar as CalendarIcon,
  RotateCcw,
  Plus
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { MeetingDetailCard } from "@/components/calendar/MeetingDetailCard";
import { EventFormDialog } from "@/components/calendar/EventFormDialog";
import { MOCK_CALENDAR_EVENTS } from "@/mocks/calendarEvents";
import calendarApi from "@/services/calendarApi";
import { cn } from "cn";

/**
 * Checks if two dates represent the exact same calendar day
 */
function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Formats date for the central navigation pill
 */
function formatPillDate(date) {
  const today = new Date();
  const isToday = isSameDay(date, today);

  const formatted = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return { text: capitalized, isToday };
}

/**
 * Memoized Timeline Event Card (120Hz ProMotion optimization)
 * Prevents re-rendering untouched sibling cards on selection changes.
 */
const TimelineEventCard = React.memo(
  function TimelineEventCard({ event, isSelected, onClick }) {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          "relative flex items-stretch gap-2.5 px-2.5 py-2 rounded-xl transition-colors cursor-pointer select-none",
          "bg-white/[0.04] hover:bg-white/[0.08]",
          "border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
          isSelected
            ? "bg-white/[0.10] border-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-white/10"
            : "border-white/10 hover:border-white/15"
        )}
      >
        {/* Indicador visual lateral de 3px com cor da categoria/agenda */}
        <span
          className="w-[3px] rounded-full shrink-0 my-0.5 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
          style={{ backgroundColor: event.categoryColor || "#3B82F6" }}
        />

        {/* Conteúdo do Card com min-w-0 e truncate estritos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-mono text-white/60 tracking-tight flex items-center gap-1.5 truncate min-w-0">
              <Clock className="w-3 h-3 text-white/40 shrink-0" />
              <span className="truncate">{event.startTime} • {event.duration}</span>
            </span>

            {event.platform && (
              <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Video className="w-2.5 h-2.5 shrink-0" />
                <span>{event.platform}</span>
              </span>
            )}
          </div>

          <h3 className="text-[13px] font-semibold text-white tracking-tight leading-snug truncate">
            {event.title}
          </h3>

          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center justify-between gap-1.5 mt-1.5 text-[11px] text-white/45 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <Users className="w-3 h-3 text-white/30 shrink-0" />
                <span className="truncate">{event.attendees.length} participantes</span>
              </div>
              {event.isOrganizer && (
                <span className="text-[10px] text-emerald-400/90 font-medium shrink-0 truncate max-w-[120px]">
                  Organizado por você
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  },
  (prev, next) => prev.event === next.event && prev.isSelected === next.isSelected
);

/**
 * CalendarTimeline: Visualização de Timeline Diária & Grade Mensal na Sidebar do Cortex
 * Conectada ao Apple Calendar (EventKit) e Node.js API, com renderização otimizada para 120Hz.
 */
export function CalendarTimeline({
  events = MOCK_CALENDAR_EVENTS,
  initialSelectedEventId = "evt-1",
  onSelectEvent,
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  // Inicialização com cache SWR em memória para renderização com latência zero
  const [eventsList, setEventsList] = useState(() => calendarApi.getCachedDayEvents(new Date()) || events);
  const [selectedEventId, setSelectedEventId] = useState(initialSelectedEventId);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "month"
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // Carrega eventos reais da agenda (Apple Calendar nativo + Google Calendar) via SWR
  useEffect(() => {
    let isCancelled = false;

    // 1. Aplicação imediata de dados em cache se disponíveis (zero latency)
    const cached = calendarApi.getCachedDayEvents(currentDate);
    if (cached && cached.length > 0) {
      setEventsList(cached);
    }

    // 2. Revalidação em background não-bloqueante
    calendarApi.loadDayEvents(currentDate, events)
      .then((loaded) => {
        if (!isCancelled && Array.isArray(loaded) && loaded.length > 0) {
          setEventsList(loaded);
        }
      })
      .catch((err) => {
        console.warn("[CalendarTimeline] Erro ao carregar eventos:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentDate, events]);

  const { text: dateDisplay, isToday } = useMemo(
    () => formatPillDate(currentDate),
    [currentDate]
  );

  const handlePrevDay = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  };

  const handleNextDay = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  };

  const handleResetToday = () => {
    setCurrentDate(new Date());
  };

  // Toggle de seleção estável (useCallback) para não invalidar o React.memo dos cards
  const handleCardClick = useCallback((event) => {
    setSelectedEventId((prev) => {
      const nextId = prev === event.id ? null : event.id;
      onSelectEvent?.(nextId ? event : null);
      return nextId;
    });
  }, [onSelectEvent]);

  // Abertura de modal para criação ou edição
  const handleOpenCreate = () => {
    setEditingEvent(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (event) => {
    setEditingEvent(event);
    setIsDialogOpen(true);
  };

  // Salva evento criado ou editado no estado local e despacha para backend / Apple Calendar
  const handleSaveEvent = async (savedEvent) => {
    const eventWithDate = {
      ...savedEvent,
      dateObj: savedEvent.dateObj || (isToday ? new Date() : currentDate),
    };

    setEventsList((prev) => {
      const exists = prev.some((e) => e.id === eventWithDate.id);
      if (exists) {
        return prev.map((e) => (e.id === eventWithDate.id ? eventWithDate : e));
      }
      return [...prev, eventWithDate];
    });

    setSelectedEventId(eventWithDate.id);
    onSelectEvent?.(eventWithDate);

    // Sincronização em background com a agenda escolhida
    try {
      if (savedEvent.destination === "apple") {
        const nativeId = await calendarApi.createAppleCalendarEvent({
          calendarName: savedEvent.calendarName || "Home",
          title: savedEvent.title,
          description: savedEvent.description,
          startTime: savedEvent.startTime,
          endTime: savedEvent.endTime,
          date: (savedEvent.dateObj || currentDate).toISOString().slice(0, 10),
          location: savedEvent.platform ? `${savedEvent.platform} Meeting` : null,
        });

        if (nativeId && nativeId !== savedEvent.id) {
          setEventsList((prev) =>
            prev.map((e) => (e.id === savedEvent.id ? { ...e, id: nativeId } : e))
          );
          setSelectedEventId(nativeId);
        }
      } else if (savedEvent.destination === "google") {
        const startIso = new Date(currentDate);
        const [sh, sm] = (savedEvent.startTime || "09:00").split(":").map(Number);
        startIso.setHours(sh, sm, 0, 0);

        const endIso = new Date(currentDate);
        const [eh, em] = (savedEvent.endTime || "09:45").split(":").map(Number);
        endIso.setHours(eh, em, 0, 0);

        await calendarApi.createEvent({
          title: savedEvent.title,
          description: savedEvent.description,
          start: startIso.toISOString(),
          end: endIso.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          allDay: false,
          attendees: (savedEvent.attendees || []).map((a) => a.email).filter(Boolean),
        });
      }
    } catch (err) {
      console.warn("[CalendarTimeline] Sincronização com agenda disparada:", err.message || err);
    }
  };

  // Exclui evento da lista e da agenda nativa/remota
  const handleDeleteEvent = async (eventToDelete) => {
    setEventsList((prev) => prev.filter((e) => e.id !== eventToDelete.id));
    if (selectedEventId === eventToDelete.id) {
      setSelectedEventId(null);
      onSelectEvent?.(null);
    }

    try {
      if (eventToDelete.calendarName && eventToDelete.calendarName !== "Google Calendar") {
        await calendarApi.deleteAppleCalendarEvent(eventToDelete.id);
      } else {
        await calendarApi.deleteEvent(eventToDelete.id);
      }
    } catch (err) {
      console.warn("[CalendarTimeline] Exclusão remota disparada:", err.message || err);
    }
  };

  // Filtra eventos para a data selecionada
  const dayEvents = useMemo(() => {
    if (isToday) {
      return eventsList.filter((e) => !e.dateObj || isSameDay(e.dateObj, new Date()));
    }
    return eventsList.filter((e) => e.dateObj && isSameDay(currentDate, e.dateObj));
  }, [eventsList, isToday, currentDate]);

  // Compromisso ativo selecionado para visualização no rodapé
  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !dayEvents.length) return null;
    return dayEvents.find((e) => e.id === selectedEventId) || null;
  }, [dayEvents, selectedEventId]);

  // Checa se há compromissos em uma data para exibir dots no modo mensal
  const hasEventsOnDate = (date) => {
    if (!date) return false;
    const today = new Date();
    if (isSameDay(date, today)) {
      return eventsList.some((e) => !e.dateObj || isSameDay(e.dateObj, today));
    }
    return eventsList.some((e) => e.dateObj && isSameDay(date, e.dateObj));
  };

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* 1. Header de Navegação (Timeline vs Mês) */}
      <div className="flex items-center justify-between pb-2.5 px-0.5 shrink-0">
        {viewMode === "timeline" ? (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevDay}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all outline-none"
                aria-label="Dia anterior"
                title="Dia anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all outline-none"
                aria-label="Próximo dia"
                title="Próximo dia"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Pílula Central da Data (Alterna para Visão Mensal) */}
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[12px] font-medium tracking-tight flex items-center gap-1.5 transition-all outline-none cursor-pointer",
                isToday
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.25)] hover:bg-blue-500/30"
                  : "bg-white/[0.06] text-white/80 border border-white/10 hover:bg-white/[0.1] hover:text-white"
              )}
              title="Clique para alternar para a Grade Mensal"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{isToday ? `Hoje, ${dateDisplay.split(",")[1]?.trim() || dateDisplay}` : dateDisplay}</span>
              <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-white/10 text-white/60 ml-0.5">
                Mês
              </span>
            </button>

            {/* Ações da Timeline: Botão Criar (+) e Contador */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenCreate}
                data-testid="create-event-button"
                className="w-7 h-7 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 flex items-center justify-center transition-all active:scale-95 outline-none shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                title="Novo compromisso"
                aria-label="Novo compromisso"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <div className="text-[11px] font-mono text-white/40 px-0.5">
                {dayEvents.length}
              </div>
            </div>
          </>
        ) : (
          /* Header do Modo Mensal */
          <>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white text-xs flex items-center gap-1 border border-white/10 transition-colors outline-none"
              title="Voltar para a Timeline Diária"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Timeline</span>
            </button>

            <span className="text-xs font-semibold text-white tracking-tight">
              Visão Mensal
            </span>

            <button
              type="button"
              onClick={() => {
                setCurrentDate(new Date());
                setViewMode("timeline");
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-300 bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 transition-colors outline-none"
              title="Ir para o dia de Hoje"
            >
              Hoje
            </button>
          </>
        )}
      </div>

      {/* 2. Conteúdo Principal com Transição Framer Motion */}
      <AnimatePresence mode="wait">
        {viewMode === "timeline" ? (
          <motion.div
            key="timeline-view"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Timeline Rolável via ScrollArea */}
            <ScrollArea className="flex-1 min-h-0 pr-1">
              {dayEvents.length > 0 ? (
                <div className="flex flex-col gap-2 pb-2">
                  {dayEvents.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      event={event}
                      isSelected={event.id === selectedEventId}
                      onClick={() => handleCardClick(event)}
                    />
                  ))}
                </div>
              ) : (
                /* Empty State Elegante para dias sem compromissos */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3 text-white/50 h-full min-h-[220px]">
                  <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/40">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white/80">
                      Dia Livre
                    </h4>
                    <p className="text-[11px] text-white/40 mt-1 max-w-[200px] leading-relaxed">
                      Nenhum compromisso registrado para este dia.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetToday}
                    className="mt-1 px-3 py-1 text-[11px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/70 hover:text-white transition-all flex items-center gap-1.5 outline-none"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Voltar para Hoje</span>
                  </button>
                </div>
              )}
            </ScrollArea>

            {/* 3. Card Expandido com AnimatePresence GPU Compositing (Sem layout thrashing a 120Hz) */}
            <AnimatePresence mode="wait">
              {selectedEvent && (
                <motion.div
                  key={selectedEvent.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="shrink-0"
                >
                  <MeetingDetailCard
                    event={selectedEvent}
                    onEdit={handleOpenEdit}
                    onDelete={handleDeleteEvent}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* Grade Mensal com Zoom-In ao clicar em um dia */
          <motion.div
            key="month-view"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0 items-center justify-start pt-1"
          >
            <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 p-2 shadow-xl">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => {
                  if (date) {
                    setCurrentDate(date);
                    setViewMode("timeline");
                  }
                }}
                modifiers={{
                  hasEvent: (date) => hasEventsOnDate(date),
                }}
                modifiersClassNames={{
                  hasEvent: "relative text-blue-300 font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-blue-400 after:shadow-[0_0_6px_rgba(59,130,246,0.9)]",
                }}
                className="w-full p-0 select-none bg-transparent"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-2",
                  month_caption: "flex justify-center pt-0.5 relative items-center h-7 text-xs font-semibold text-white",
                  nav: "flex items-center justify-between absolute inset-x-0 top-0 w-full px-0.5",
                  button_previous: "h-6 w-6 bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white rounded-md p-0 flex items-center justify-center border border-white/10 transition-colors",
                  button_next: "h-6 w-6 bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white rounded-md p-0 flex items-center justify-center border border-white/10 transition-colors",
                  month_grid: "w-full border-collapse mt-1",
                  weekdays: "flex justify-between w-full mb-1 px-1",
                  weekday: "text-white/40 rounded-md w-8 font-mono text-[9.5px] text-center uppercase tracking-wider",
                  week: "flex justify-between w-full mt-1 px-1",
                  day: "h-8 w-8 text-center text-xs p-0 relative flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors focus-within:relative focus-within:z-20 cursor-pointer",
                  today: "bg-white/[0.08] text-white font-bold border border-white/20",
                  selected: "bg-blue-600 text-white font-semibold shadow-[0_0_12px_rgba(37,99,235,0.6)] border border-blue-400/50 hover:bg-blue-500",
                  outside: "text-white/20 opacity-40 hover:bg-transparent",
                  disabled: "text-white/10 opacity-30",
                }}
              />
            </div>

            <div className="flex items-center justify-center gap-2 mt-3 text-[11px] text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
              <span>Dias com compromissos</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Criação / Edição de Compromissos */}
      <EventFormDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
        initialData={editingEvent}
        currentDate={currentDate}
      />
    </div>
  );
}

export default CalendarTimeline;
