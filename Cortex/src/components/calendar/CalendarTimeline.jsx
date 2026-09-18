import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Video, 
  Users, 
  Calendar as CalendarIcon,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MOCK_CALENDAR_EVENTS } from "@/mocks/calendarEvents";
import { cn } from "cn";

/**
 * Checks if two dates represent the exact same calendar day
 */
function isSameDay(d1, d2) {
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
 * CalendarTimeline: Visualização de Timeline Diária na Sidebar do Cortex
 * Estritamente compatível com o design.md (Liquid Glass) e security.md.
 * 
 * @param {Object} props
 * @param {Array} [props.events=MOCK_CALENDAR_EVENTS]
 * @param {string} [props.initialSelectedEventId]
 * @param {(event: Object) => void} [props.onSelectEvent]
 */
export function CalendarTimeline({
  events = MOCK_CALENDAR_EVENTS,
  initialSelectedEventId = "evt-1",
  onSelectEvent,
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEventId, setSelectedEventId] = useState(initialSelectedEventId);

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

  const handleCardClick = (event) => {
    setSelectedEventId(event.id);
    onSelectEvent?.(event);
  };

  // Filtra eventos para a data selecionada (para o mock, exibimos os compromissos no dia de Hoje)
  const dayEvents = useMemo(() => {
    if (isToday) {
      return events;
    }
    return [];
  }, [events, isToday]);

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* 1. Header de Navegação do Calendário */}
      <div className="flex items-center justify-between pb-3 px-0.5 shrink-0">
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

        {/* Pílula Central da Data */}
        <button
          type="button"
          onClick={handleResetToday}
          className={cn(
            "px-2.5 py-1 rounded-full text-[12px] font-medium tracking-tight flex items-center gap-1.5 transition-all outline-none",
            isToday
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.25)] hover:bg-blue-500/25"
              : "bg-white/[0.06] text-white/80 border border-white/10 hover:bg-white/[0.1] hover:text-white"
          )}
          title={isToday ? "Hoje (Data Atual)" : "Clique para voltar para Hoje"}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{isToday ? `Hoje, ${dateDisplay.split(",")[1]?.trim() || dateDisplay}` : dateDisplay}</span>
          {!isToday && (
            <RotateCcw className="w-3 h-3 text-white/40 ml-0.5 hover:text-white" />
          )}
        </button>

        {/* Contador de Eventos do Dia */}
        <div className="text-[11px] font-mono text-white/40 px-1">
          {dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventos"}
        </div>
      </div>

      {/* 2. Timeline Rolável via ScrollArea */}
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
                    "relative flex items-stretch gap-3 p-3 rounded-xl transition-all cursor-pointer select-none",
                    "bg-white/[0.04] hover:bg-white/[0.08]",
                    "border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
                    isSelected
                      ? "bg-white/[0.10] border-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-white/10"
                      : "border-white/10 hover:border-white/15"
                  )}
                >
                  {/* Indicador visual lateral de 3px com cor da categoria */}
                  <span
                    className="w-[3.5px] rounded-full shrink-0 my-0.5 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                    style={{ backgroundColor: event.categoryColor || "#3B82F6" }}
                  />

                  {/* Conteúdo do Card */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-mono text-white/60 tracking-tight flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-white/40 shrink-0" />
                        <span>{event.startTime} • {event.duration}</span>
                      </span>

                      {event.platform && (
                        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 shrink-0">
                          <Video className="w-2.5 h-2.5" />
                          {event.platform}
                        </span>
                      )}
                    </div>

                    <h3 className="text-[13px] font-semibold text-white tracking-tight leading-snug truncate">
                      {event.title}
                    </h3>

                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-white/45">
                        <Users className="w-3 h-3 text-white/30 shrink-0" />
                        <span>{event.attendees.length} participantes</span>
                        {event.isOrganizer && (
                          <span className="text-[10px] text-emerald-400/90 font-medium ml-auto">
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
              className="mt-1 px-3 py-1 text-[11px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/70 hover:text-white transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Voltar para Hoje</span>
            </button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default CalendarTimeline;
