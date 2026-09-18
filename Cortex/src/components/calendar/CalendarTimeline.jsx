import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Video, 
  Users, 
  Calendar as CalendarIcon,
  RotateCcw
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { MeetingDetailCard } from "@/components/calendar/MeetingDetailCard";
import { MOCK_CALENDAR_EVENTS } from "@/mocks/calendarEvents";
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

  // Capitalize first letter (e.g. "Sex., 18 de set.")
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return { text: capitalized, isToday };
}

/**
 * CalendarTimeline: Visualização de Timeline Diária & Grade Mensal na Sidebar do Cortex
 * Estritamente compatível com o design.md (Liquid Glass) e security.md.
 * 
 * @param {Object} props
 * @param {Array} [props.events=MOCK_CALENDAR_EVENTS]
 * @param {string|null} [props.initialSelectedEventId="evt-1"]
 * @param {(event: Object|null) => void} [props.onSelectEvent]
 */
export function CalendarTimeline({
  events = MOCK_CALENDAR_EVENTS,
  initialSelectedEventId = "evt-1",
  onSelectEvent,
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEventId, setSelectedEventId] = useState(initialSelectedEventId);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "month"

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

  // Toggle de seleção do card: clicar novamente no ativo recolhe o MeetingDetailCard
  const handleCardClick = (event) => {
    if (selectedEventId === event.id) {
      setSelectedEventId(null);
      onSelectEvent?.(null);
    } else {
      setSelectedEventId(event.id);
      onSelectEvent?.(event);
    }
  };

  // Filtra eventos para a data selecionada
  const dayEvents = useMemo(() => {
    if (isToday) {
      return events;
    }
    return [];
  }, [events, isToday]);

  // Compromisso ativo selecionado para visualização no rodapé (null se recolhido)
  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !dayEvents.length) return null;
    return dayEvents.find((e) => e.id === selectedEventId) || null;
  }, [dayEvents, selectedEventId]);

  // Checa se há compromissos em uma data para exibir dots no modo mensal
  const hasEventsOnDate = (date) => {
    if (!date) return false;
    const today = new Date();
    if (isSameDay(date, today)) {
      return events.length > 0;
    }
    return events.some((e) => e.dateObj && isSameDay(date, e.dateObj));
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

            {/* Contador de Eventos do Dia */}
            <div className="text-[11px] font-mono text-white/40 px-1">
              {dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventos"}
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
                  {dayEvents.map((event) => {
                    const isSelected = event.id === selectedEventId;

                    return (
                      <motion.div
                        key={event.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleCardClick(event)}
                        className={cn(
                          "relative flex items-stretch gap-2.5 px-2.5 py-2 rounded-xl transition-all cursor-pointer select-none",
                          "bg-white/[0.04] hover:bg-white/[0.08]",
                          "border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
                          isSelected
                            ? "bg-white/[0.10] border-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-white/10"
                            : "border-white/10 hover:border-white/15"
                        )}
                      >
                        {/* Indicador visual lateral de 3px com cor da categoria */}
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
                  })}
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

            {/* 3. Card Expandido com AnimatePresence (Recolhe quando desmarcado) */}
            <AnimatePresence>
              {selectedEvent && (
                <motion.div
                  key={selectedEvent.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden shrink-0"
                >
                  <MeetingDetailCard
                    event={selectedEvent}
                    onEdit={(evt) => console.log("Editar evento:", evt.id)}
                    onDelete={(evt) => console.log("Excluir evento:", evt.id)}
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
            <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 p-2 shadow-xl backdrop-blur-xl">
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
    </div>
  );
}

export default CalendarTimeline;
