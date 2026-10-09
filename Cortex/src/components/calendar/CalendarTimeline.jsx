import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Video, 
  Users, 
  Calendar as CalendarIcon, 
  Plus, 
  Loader2,
  SlidersHorizontal,
  Check
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MeetingDetailCard } from "@/components/calendar/MeetingDetailCard";
import { EventFormDialog } from "@/components/calendar/EventFormDialog";
import { QuickEventInput } from "@/components/calendar/QuickEventInput";
import calendarApi, { getLocalDateKey } from "@/services/calendarApi";
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
 * Formats date for month and year header (ex: "Outubro 2026")
 */
function formatMonthYearHeader(date) {
  const formatted = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Generates an array of 7 consecutive dates anchored to the current week (starting Monday)
 */
function getWeekDays(anchorDate) {
  const curr = new Date(anchorDate);
  const day = curr.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr.getFullYear(), curr.getMonth(), diff);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const nextDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push(nextDate);
  }
  return days;
}

/**
 * Memoized Timeline Event Card (120Hz ProMotion optimization)
 * Suporta modo Hero (Lavender Pill com tipografia 100% escura de alto contraste)
 * e modo padrão Obsidian Glass profundo.
 */
const TimelineEventCard = React.memo(
  function TimelineEventCard({ event, isSelected, isHero, onClick }) {
    if (isHero) {
      return (
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className={cn(
            "relative flex flex-col gap-2 p-3.5 rounded-2xl cursor-pointer select-none transition-all",
            "bg-indigo-400 text-slate-950 shadow-[0_0_20px_rgba(129,140,248,0.35)]",
            isSelected ? "ring-2 ring-white/70 scale-[1.01]" : "hover:brightness-105"
          )}
        >
          {/* Header do Hero Card: Horário em badge escuro contrastante e Plataforma */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-900 bg-black/10 px-2 py-0.5 rounded-full flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-slate-900 shrink-0" />
              <span>{event.startTime} - {event.endTime || "TBD"}</span>
            </span>

            {event.platform && (
              <span className="text-[9.5px] uppercase font-bold px-2 py-0.5 rounded bg-black/15 text-slate-950 border border-black/10 flex items-center gap-1 shrink-0">
                <Video className="w-2.5 h-2.5 shrink-0" />
                <span>{event.platform}</span>
              </span>
            )}
          </div>

          {/* Título em Alto Contraste Escuro */}
          <h3 className="text-sm font-bold text-slate-950 tracking-tight leading-snug truncate">
            {event.title}
          </h3>

          {/* Rodapé do Hero Card: Participantes e Categoria */}
          <div className="flex items-center justify-between gap-2 mt-0.5 text-xs text-slate-900/90">
            <div className="flex items-center gap-1.5 truncate">
              {/* Avatares circulares sobrepostos simulados (Imagem 3) */}
              <div className="flex -space-x-1.5 overflow-hidden py-0.5">
                <div className="inline-block h-4.5 w-4.5 rounded-full bg-slate-950/20 ring-1 ring-indigo-400 flex items-center justify-center text-[9px] font-bold text-slate-950">
                  <Users className="w-2.5 h-2.5 text-slate-900" />
                </div>
                {event.attendees && event.attendees.length > 1 && (
                  <div className="inline-block h-4.5 w-4.5 rounded-full bg-slate-950/15 ring-1 ring-indigo-400 flex items-center justify-center text-[8.5px] font-bold text-slate-950">
                    +{event.attendees.length - 1}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold text-slate-900 truncate">
                {event.calendarName || "Compromisso"}
              </span>
            </div>

            {event.isOrganizer && (
              <span className="text-[9.5px] font-bold text-slate-950/80 bg-black/10 px-1.5 py-0.5 rounded-full shrink-0">
                Organizador
              </span>
            )}
          </div>
        </motion.div>
      );
    }

    // Card Padrão em Obsidian Glass Profundo
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          "cartao cartao-clicavel rounded-[16px] relative flex items-stretch gap-2.5 px-3 py-2.5 transition-all select-none",
          isSelected
            ? "border-[var(--destaque)] bg-[var(--superficie-2)] shadow-[inset_0_1px_1px_0_rgba(167,139,250,0.3),0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-[var(--destaque)]/40"
            : "hover:border-[var(--borda-forte)]"
        )}
      >
        {/* Indicador visual lateral de 3px com cor da categoria */}
        <span
          className="w-[3px] rounded-full shrink-0 my-0.5 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
          style={{ backgroundColor: event.categoryColor || "#3B82F6" }}
        />

        {/* Conteúdo do Card */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-mono text-white/60 tracking-tight flex items-center gap-1.5 truncate min-w-0">
              <Clock className="w-3 h-3 text-white/40 shrink-0" />
              <span className="truncate">{event.startTime} • {event.duration || "45m"}</span>
            </span>

            {event.platform && (
              <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Video className="w-2.5 h-2.5 shrink-0" />
                <span>{event.platform}</span>
              </span>
            )}
          </div>

          <h3 className="text-[13px] font-semibold text-white/95 tracking-tight leading-snug truncate">
            {event.title}
          </h3>

          <div className="flex items-center justify-between gap-1.5 mt-1.5 text-[11px] text-white/45 min-w-0">
            <span className="truncate text-[10px] text-white/40">
              {event.calendarName || "Calendário"}
            </span>
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <Users className="w-3 h-3 text-white/30 shrink-0" />
                <span className="text-[10px]">{event.attendees.length}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  },
  (prev, next) =>
    prev.event === next.event &&
    prev.isSelected === next.isSelected &&
    prev.isHero === next.isHero
);

/**
 * TimelineEventSkeleton: Card esquelético com animação acelerada por GPU (120Hz ProMotion)
 */
function TimelineEventSkeleton() {
  return (
    <div
      className="h-16 w-full rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse flex items-center px-4 gap-3 mb-2.5 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
      data-testid="timeline-skeleton-card"
    >
      <span className="w-1 h-8 rounded-full bg-white/10 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-3.5 w-1/2 rounded bg-white/10 mb-1.5" />
        <div className="h-2.5 w-1/4 rounded bg-white/5" />
      </div>
    </div>
  );
}

/**
 * CalendarTimeline: Visualização de Timeline Diária & Grade Mensal na Sidebar do Cortex
 * Inclui:
 * - Carrossel Semanal Horizontal no topo (Imagem 2).
 * - Hero Event em pílula lavanda de alto contraste e tipografia escura (Imagem 3).
 * - Menu Popover para exclusão e filtro de calendários (ex: Stremio/Séries).
 * - Botão inferior "+ Create Activity".
 */
export function CalendarTimeline({
  events = [],
  initialSelectedEventId = null,
  onSelectEvent,
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const initialCached = calendarApi.getCachedDayEvents(new Date());
  const [eventsList, setEventsList] = useState(() => initialCached || events || []);
  const [isLoadingDay, setIsLoadingDay] = useState(() => !initialCached && (!events || events.length === 0));
  const [isRevalidating, setIsRevalidating] = useState(() => Boolean(initialCached));
  const [selectedEventId, setSelectedEventId] = useState(initialSelectedEventId);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "month"
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const lastFetchedKeyRef = useRef(null);
  const activeDateKeyRef = useRef(calendarApi.getLocalDateKey(new Date()));

  // Configurações de Calendários Ocultos & Filtros
  const [calendarSettings, setCalendarSettings] = useState(() => calendarApi.getCalendarSettings());
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const selectedDateKey = calendarApi.getLocalDateKey(currentDate);

  // Consulta lista de calendários reais do macOS para o menu de filtros
  useEffect(() => {
    calendarApi.getAppleCalendars()
      .then((cals) => {
        if (Array.isArray(cals)) {
          setAvailableCalendars(cals);
        }
      })
      .catch(() => {});
  }, []);

  // Reseta a seleção de evento ao navegar entre dias
  useEffect(() => {
    setSelectedEventId(null);
    onSelectEvent?.(null);
  }, [selectedDateKey, onSelectEvent]);

  // Sincronização Reativa da Timeline com o Apple Calendar
  useEffect(() => {
    let isCancelled = false;
    activeDateKeyRef.current = selectedDateKey;

    // 1. Injeção Síncrona do Cache em Memória
    const cached = calendarApi.getCachedDayEvents(currentDate);
    if (cached) {
      setEventsList(cached);
      setIsLoadingDay(false);
      setIsRevalidating(true);
    } else {
      setEventsList([]);
      setIsLoadingDay(true);
      setIsRevalidating(false);
    }

    if (lastFetchedKeyRef.current === selectedDateKey && cached) {
      setIsRevalidating(false);
      return;
    }

    // 2. Revalidação em background
    calendarApi.loadDayEvents(currentDate, [])
      .then((loaded) => {
        if (!isCancelled && activeDateKeyRef.current === selectedDateKey && Array.isArray(loaded)) {
          setEventsList(loaded);
          lastFetchedKeyRef.current = selectedDateKey;
        }
      })
      .catch((err) => {
        console.warn("[CalendarTimeline] Erro ao carregar eventos:", err.message || err);
      })
      .finally(() => {
        if (!isCancelled && activeDateKeyRef.current === selectedDateKey) {
          setIsLoadingDay(false);
          setIsRevalidating(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDateKey, viewMode, currentDate]);

  // Dias da semana corrente no carrossel horizontal
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Navegação semanal por blocos de 7 dias
  const handlePrevWeek = () => {
    setSelectedEventId(null);
    onSelectEvent?.(null);
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
  };

  const handleNextWeek = () => {
    setSelectedEventId(null);
    onSelectEvent?.(null);
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
  };

  const handleSelectDay = (dayDate) => {
    setSelectedEventId(null);
    onSelectEvent?.(null);
    setCurrentDate(dayDate);
  };

  // Alterna visibilidade de calendário no menu de filtros
  const handleToggleCalendar = (calIdentifier) => {
    const currentHidden = calendarSettings.hiddenCalendars || [];
    const exists = currentHidden.some(
      (h) => h.toLowerCase() === calIdentifier.toLowerCase()
    );

    const updatedHidden = exists
      ? currentHidden.filter((h) => h.toLowerCase() !== calIdentifier.toLowerCase())
      : [...currentHidden, calIdentifier];

    const updatedSettings = {
      ...calendarSettings,
      hiddenCalendars: updatedHidden,
    };

    setCalendarSettings(updatedSettings);
    calendarApi.saveCalendarSettings(updatedSettings);
  };

  // Filtra eventos para a data selecionada excluindo calendários ocultos (ex: Stremio)
  const dayEvents = useMemo(() => {
    const hiddenLower = (calendarSettings.hiddenCalendars || []).map((c) => c.toLowerCase());
    return eventsList.filter((e) => {
      const eventKey = e.date || (e.dateObj ? calendarApi.getLocalDateKey(e.dateObj) : null);
      if (eventKey !== selectedDateKey) return false;

      const calName = (e.calendarName || "").toLowerCase();
      const isHidden = hiddenLower.some(
        (hidden) => calName === hidden || calName.includes(hidden)
      );
      return !isHidden;
    });
  }, [eventsList, selectedDateKey, calendarSettings.hiddenCalendars]);

  // Eleição do Hero Event (Lavander Pill de alto contraste)
  const heroEventId = useMemo(() => {
    if (!dayEvents || dayEvents.length === 0) return null;

    const today = new Date();
    const isCurrentDayToday = isSameDay(currentDate, today);

    if (isCurrentDayToday) {
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      let bestUpcoming = null;
      let minUpcomingDiff = Infinity;

      for (const evt of dayEvents) {
        const [h, m] = (evt.startTime || "00:00").split(":").map(Number);
        const startMinutes = (h || 0) * 60 + (m || 0);

        const [eh, em] = (evt.endTime || "00:00").split(":").map(Number);
        const endMinutes = eh ? eh * 60 + em : startMinutes + 45;

        // Compromisso em andamento no momento
        if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
          return evt.id;
        }

        // Próximo compromisso mais próximo no futuro
        if (startMinutes > nowMinutes && startMinutes - nowMinutes < minUpcomingDiff) {
          minUpcomingDiff = startMinutes - nowMinutes;
          bestUpcoming = evt;
        }
      }

      if (bestUpcoming) return bestUpcoming.id;
    }

    // Se for data futura, passada ou nenhum próximo hoje: primeiro evento cronológico
    return dayEvents[0]?.id || null;
  }, [dayEvents, currentDate]);

  // Compromisso ativo selecionado para visualização no rodapé
  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !dayEvents.length) return null;
    return dayEvents.find((e) => e.id === selectedEventId) || null;
  }, [dayEvents, selectedEventId]);

  // Card click handler
  const handleCardClick = useCallback((event) => {
    setSelectedEventId((prev) => {
      const nextId = prev === event.id ? null : event.id;
      onSelectEvent?.(nextId ? event : null);
      return nextId;
    });
  }, [onSelectEvent]);

  // Dialog handlers
  const handleOpenCreate = () => {
    setEditingEvent(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (event) => {
    setEditingEvent(event);
    setIsDialogOpen(true);
  };

  const handleSaveEvent = async (savedEvent) => {
    const localKey = calendarApi.getLocalDateKey(savedEvent.dateObj || currentDate);
    const eventWithDate = {
      ...savedEvent,
      date: localKey,
      dateObj: savedEvent.dateObj || calendarApi.parseLocalDate(localKey),
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

    try {
      if (savedEvent.destination === "apple") {
        const nativeId = await calendarApi.createAppleCalendarEvent({
          calendarName: savedEvent.calendarName || "Home",
          title: savedEvent.title,
          description: savedEvent.description,
          startTime: savedEvent.startTime,
          endTime: savedEvent.endTime,
          date: localKey,
          location: savedEvent.platform ? `${savedEvent.platform} Meeting` : null,
        });

        if (nativeId && nativeId !== savedEvent.id) {
          setEventsList((prev) =>
            prev.map((e) => (e.id === savedEvent.id ? { ...e, id: nativeId } : e))
          );
          setSelectedEventId(nativeId);
        }
      }
    } catch (err) {
      console.warn("[CalendarTimeline] Sincronização disparada:", err.message || err);
    }
  };

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
      console.warn("[CalendarTimeline] Exclusão disparada:", err.message || err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* Quick Add em Linguagem Natural */}
      <div className="pb-2.5 px-0.5 shrink-0">
        <QuickEventInput
          placeholder="Adicionar rápido (ex: 'reunião quinta às 15h')..."
          onEventCreated={(newEvent) => {
            if (newEvent && newEvent.date === selectedDateKey) {
              setEventsList((prev) => [newEvent, ...prev.filter((e) => e.id !== newEvent.id)]);
            }
          }}
        />
      </div>

      {/* 1. Header do Mês e Ações de Navegação */}
      <div className="flex items-center justify-between pb-2 px-1 shrink-0">
        <div className="flex items-center gap-1.5">
          {viewMode === "timeline" ? (
            <>
              <button
                type="button"
                onClick={handlePrevWeek}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all outline-none cursor-pointer"
                aria-label="Semana anterior"
                title="Semana anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <h2 className="text-[13px] font-semibold text-white tracking-tight">
                {formatMonthYearHeader(currentDate)}
              </h2>

              <button
                type="button"
                onClick={handleNextWeek}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all outline-none cursor-pointer"
                aria-label="Próxima semana"
                title="Próxima semana"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <h2 className="text-[13px] font-semibold text-white tracking-tight">
              Visão Mensal
            </h2>
          )}
        </div>

        {/* Controles do Topo: Filtro de Calendários & Alternância de Visualização */}
        <div className="flex items-center gap-1">
          {viewMode === "timeline" ? (
            <>
              {/* Menu Popover de Filtro de Calendários */}
              <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all outline-none cursor-pointer",
                      calendarSettings.hiddenCalendars?.length > 0
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
                        : "text-white/60 hover:text-white hover:bg-white/[0.08]"
                    )}
                    title="Filtro de Calendários (ocultar Stremio, Séries...)"
                    aria-label="Filtro de Calendários"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="w-64 p-3 bg-[#0c0d0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl text-white z-50 select-none"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                      <h4 className="text-xs font-semibold text-white tracking-tight">Filtro de Calendários</h4>
                    </div>
                    <span className="text-[9.5px] font-mono text-white/40">
                      {availableCalendars.length - (calendarSettings.hiddenCalendars?.length || 0)}/{availableCalendars.length}
                    </span>
                  </div>

                  <p className="text-[10px] text-white/50 mb-2">
                    Marque os calendários visíveis na timeline:
                  </p>

                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                    {availableCalendars.map((cal) => {
                      const isHidden = (calendarSettings.hiddenCalendars || []).some(
                        (h) => h.toLowerCase() === (cal.title || cal.id).toLowerCase()
                      );
                      const isVisible = !isHidden;

                      return (
                        <button
                          key={cal.id}
                          type="button"
                          onClick={() => handleToggleCalendar(cal.title || cal.id)}
                          className="flex items-center justify-between p-1.5 px-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] transition-colors cursor-pointer text-left w-full"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(255,255,255,0.2)]"
                              style={{ backgroundColor: cal.colorHex || "#3B82F6" }}
                            />
                            <span className="text-xs font-medium text-white/80 truncate">
                              {cal.title}
                            </span>
                          </div>

                          <div
                            className={cn(
                              "w-4 h-4 rounded-md flex items-center justify-center transition-colors shrink-0",
                              isVisible
                                ? "bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                                : "bg-white/10 border border-white/20"
                            )}
                          >
                            {isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Botão de Alternância para Grade Mensal */}
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors outline-none cursor-pointer"
                title="Alternar para Visão Mensal"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white text-xs flex items-center gap-1 border border-white/10 transition-colors outline-none cursor-pointer"
              title="Voltar para a Timeline"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Timeline</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Carrossel Horizontal de Dias da Semana (Imagem 2) */}
      {viewMode === "timeline" && (
        <div className="grid grid-cols-7 gap-1 px-0.5 pb-2.5 pt-0.5 shrink-0">
          {weekDays.map((dayDate) => {
            const isSelected = isSameDay(dayDate, currentDate);
            const isTodayDay = isSameDay(dayDate, new Date());
            const dayAbbr = dayDate
              .toLocaleDateString("pt-BR", { weekday: "short" })
              .replace(".", "")
              .slice(0, 3);
            const capitalizedAbbr = dayAbbr.charAt(0).toUpperCase() + dayAbbr.slice(1);
            const dayNum = dayDate.getDate();

            // Guardrail de Performance: consulta estritamente o cache em memória, zero osascript lag
            const hasEvents = Boolean(calendarApi.getCachedDayEvents(dayDate)?.length > 0);

            return (
              <button
                key={dayDate.toISOString()}
                type="button"
                onClick={() => handleSelectDay(dayDate)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer outline-none relative select-none",
                  isSelected
                    ? "bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                    : isTodayDay
                    ? "bg-white/[0.06] text-white/90 border border-white/15 hover:bg-white/[0.1]"
                    : "text-white/50 hover:text-white hover:bg-white/[0.04] border border-transparent"
                )}
              >
                {/* Nome abreviado do dia */}
                <span className={cn(
                  "text-[10px] font-medium tracking-tight mb-0.5",
                  isSelected ? "text-purple-300 font-semibold" : "text-white/50"
                )}>
                  {capitalizedAbbr}
                </span>

                {/* Número do dia */}
                <span className={cn(
                  "text-xs tracking-tight",
                  isSelected ? "font-bold text-white" : isTodayDay ? "font-semibold text-white" : "font-medium"
                )}>
                  {dayNum}
                </span>

                {/* Micro-dot para dias com compromissos em cache */}
                {hasEvents && (
                  <span
                    className={cn(
                      "w-1 h-1 rounded-full mt-1 shrink-0",
                      isSelected ? "bg-purple-300 shadow-[0_0_4px_rgba(216,180,254,0.8)]" : "bg-white/40"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Conteúdo Principal da Timeline com Transição Framer Motion */}
      <AnimatePresence mode="wait">
        {viewMode === "timeline" ? (
          <motion.div
            key="timeline-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Timeline Rolável via ScrollArea */}
            <ScrollArea className="flex-1 min-h-0 pr-1">
              {isLoadingDay ? (
                <div className="flex flex-col gap-2 pb-2" data-testid="timeline-loading-skeletons">
                  <TimelineEventSkeleton key="skel-1" />
                  <TimelineEventSkeleton key="skel-2" />
                  <TimelineEventSkeleton key="skel-3" />
                </div>
              ) : dayEvents.length > 0 ? (
                <div className="flex flex-col gap-2 pb-2 animate-in fade-in duration-200">
                  {dayEvents.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      event={event}
                      isSelected={event.id === selectedEventId}
                      isHero={event.id === heroEventId}
                      onClick={() => handleCardClick(event)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2 text-white/50 h-full min-h-[180px] animate-in fade-in duration-200">
                  <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/30">
                    <CalendarIcon className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <p className="text-xs text-white/40 font-medium">
                    Nenhum compromisso agendado
                  </p>
                </div>
              )}
            </ScrollArea>

            {/* Botão Inferior de Criação Rápida "+ Create Activity" (Imagens 2 e 3) */}
            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="w-full py-2.5 px-3 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(129,140,248,0.2)] transition-all active:scale-[0.98] cursor-pointer"
                data-testid="create-activity-button"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ Create Activity</span>
              </button>
            </div>

            {/* Card Expandido de Detalhes da Reunião */}
            <AnimatePresence mode="wait">
              {selectedEvent && (
                <motion.div
                  key={selectedEvent.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="shrink-0 mt-2"
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
          /* Grade Mensal Completa */
          <motion.div
            key="month-view"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0 items-center justify-start pt-1"
          >
            <div className="relative w-full rounded-2xl bg-white/[0.03] border border-white/10 p-2 shadow-xl">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedEventId(null);
                    onSelectEvent?.(null);
                    setCurrentDate(date);
                    setViewMode("timeline");
                  }
                }}
                className="w-full p-0 select-none bg-transparent"
              />
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
