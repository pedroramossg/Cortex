import React, { useState, useEffect, useMemo } from "react";
import { 
  Check, 
  Dumbbell, 
  BookOpen, 
  Briefcase, 
  Utensils, 
  Droplets, 
  Sparkles, 
  Settings, 
  Sun,
  GraduationCap,
  X,
  Plus
} from "lucide-react";
import { cn } from "cn";
import calendarApi, { getLocalDateKey } from "@/services/calendarApi";

const DEFAULT_IGNORED_CALENDARS = [
  "Stremio",
  "Séries",
  "Series",
  "Feriados",
  "Aniversários",
  "Birthdays",
  "Holidays"
];

const URGENT_KEYWORDS = [
  "prova",
  "fmi",
  "poo",
  "entrega",
  "seminário",
  "seminario",
  "apresentação",
  "apresentacao",
  "trabalho",
  "quiz",
  "exame",
  "teste",
  "atividade avaliativa"
];

/**
 * Dedução semântica do título de tarefa preparatória para prazos e provas futuras
 */
export function getPrepTaskTitle(title = "") {
  const t = title.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith("prova de ")) {
    return `Estudar ${t.slice(9).trim()}`;
  }
  if (lower.startsWith("prova ")) {
    return `Estudar ${t.slice(6).trim()}`;
  }
  if (lower.includes("fmi")) {
    return "Estudar FMI";
  }
  if (lower.includes("poo")) {
    return "Estudar POO";
  }
  if (lower.includes("entrega") || lower.includes("trabalho") || lower.includes("projeto")) {
    return `Preparar ${t}`;
  }
  if (lower.includes("seminário") || lower.includes("seminario") || lower.includes("apresentação") || lower.includes("apresentacao")) {
    return `Revisar ${t}`;
  }
  if (lower.includes("quiz") || lower.includes("teste") || lower.includes("exame")) {
    return `Revisar ${t}`;
  }
  return `Estudar ${t}`;
}

/**
 * Mapeia palavras-chave do título do compromisso para ícones contextuais
 */
function getTaskIcon(title = "", isPrep = false) {
  if (isPrep) return GraduationCap;
  const t = title.toLowerCase();
  if (t.includes("workout") || t.includes("treino") || t.includes("academia") || t.includes("exercício")) {
    return Dumbbell;
  }
  if (t.includes("read") || t.includes("livro") || t.includes("leitura") || t.includes("ler") || t.includes("estudo") || t.includes("aula") || t.includes("prova")) {
    return GraduationCap;
  }
  if (t.includes("water") || t.includes("água") || t.includes("hidratar")) {
    return Droplets;
  }
  if (t.includes("diet") || t.includes("comida") || t.includes("almoço") || t.includes("jantar") || t.includes("nutri")) {
    return Utensils;
  }
  if (t.includes("reunião") || t.includes("meet") || t.includes("call") || t.includes("sync") || t.includes("alinhamento") || t.includes("projeto")) {
    return Briefcase;
  }
  if (t.includes("morning") || t.includes("manhã") || t.includes("acordar")) {
    return Sun;
  }
  return Sparkles;
}

/**
 * DailyTasksWidget: Motor de tarefas diárias contextuais do Apple Calendar com Lookahead Assíncrono Não-Bloqueante.
 * - Renderiza imediatamente eventos reais de hoje a partir do cache (zero latência).
 * - Varredura assíncrona não-bloqueante em background para D+1, D+2 e D+3 para detecção de provas/prazos.
 * - Chave de tarefa preparatória isolada: `prep_${futureEvt.id || futureEvt.title}_${todayKey}`
 * - Zero mocks genéricos; layout adaptativo (1 col, 2 col ou empty state limpo).
 */
export function DailyTasksWidget({ className }) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getLocalDateKey(today), [today]);

  // Lista de calendários ignorados configurável
  const [ignoredCalendars, setIgnoredCalendars] = useState(() => {
    try {
      const saved = localStorage.getItem("cortex_ignored_calendars");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora erro de JSON
    }
    return DEFAULT_IGNORED_CALENDARS;
  });

  const [showSettings, setShowSettings] = useState(false);
  const [newIgnoreName, setNewIgnoreName] = useState("");

  // Conjunto de IDs de tarefas marcadas como concluídas hoje
  const [checkedIds, setCheckedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`cortex_tasks_checked_${todayKey}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      // Ignora erro de JSON
    }
    return new Set();
  });

  // 1. Injeção Síncrona Imediata do Cache em Memória de Hoje (Zero Latência)
  const [rawEvents, setRawEvents] = useState(() => {
    return calendarApi.getCachedDayEvents(today) || [];
  });

  // 2. Tarefas de preparação geradas pelo Lookahead assíncrono para D+1, D+2, D+3
  const [lookaheadTasks, setLookaheadTasks] = useState([]);

  useEffect(() => {
    let isCancelled = false;

    // Revalidação em background de hoje
    calendarApi.loadDayEvents(today)
      .then((evts) => {
        if (!isCancelled && Array.isArray(evts)) {
          setRawEvents(evts);
        }
      })
      .catch(() => {
        // Fallbacks utilizam cache
      });

    // Scan assíncrono não-bloqueante de D+1, D+2 e D+3 para provas e prazos futuros
    const lookaheadDates = [1, 2, 3].map((offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d;
    });

    Promise.all(
      lookaheadDates.map((d) => calendarApi.loadDayEvents(d).catch(() => []))
    ).then((results) => {
      if (isCancelled) return;
      const detectedPreps = [];
      const seenTitles = new Set();

      results.forEach((dayEvts, idx) => {
        if (!Array.isArray(dayEvts)) return;
        for (const evt of dayEvts) {
          const title = (evt.title || "").trim();
          if (!title) continue;
          const lowerTitle = title.toLowerCase();
          const calName = (evt.calendarName || "").toLowerCase();

          // Ignora calendários de ruído (Stremio, Séries, Feriados)
          const isIgnored = ignoredCalendars.some((ign) => {
            const l = ign.toLowerCase();
            return calName.includes(l) || lowerTitle.includes(l);
          });
          if (isIgnored) continue;

          // Detecta palavras-chave de prova/prazo urgente
          const isUrgent = URGENT_KEYWORDS.some((kw) => lowerTitle.includes(kw));
          if (isUrgent && !seenTitles.has(lowerTitle)) {
            seenTitles.add(lowerTitle);
            const daysAhead = idx + 1;
            const dayLabel = daysAhead === 1 ? "Amanhã" : `Em ${daysAhead}d`;
            // Chave isolada que nunca colide com o evento original futuro
            const taskId = `prep_${evt.id || title}_${todayKey}`;

            detectedPreps.push({
              id: taskId,
              title: getPrepTaskTitle(title),
              originalTitle: title,
              icon: GraduationCap,
              isPrepTask: true,
              daysAhead,
              dayLabel,
            });
          }
        }
      });

      setLookaheadTasks(detectedPreps);
    }).catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [today, todayKey, ignoredCalendars]);

  // Salva calendários ignorados no localStorage
  const handleSaveIgnored = (newList) => {
    setIgnoredCalendars(newList);
    try {
      localStorage.setItem("cortex_ignored_calendars", JSON.stringify(newList));
    } catch (e) {
      console.warn("Falha ao salvar ignored calendars:", e);
    }
  };

  const handleAddIgnored = (e) => {
    e.preventDefault();
    if (!newIgnoreName.trim()) return;
    const name = newIgnoreName.trim();
    if (!ignoredCalendars.includes(name)) {
      handleSaveIgnored([...ignoredCalendars, name]);
    }
    setNewIgnoreName("");
  };

  const handleRemoveIgnored = (nameToRemove) => {
    handleSaveIgnored(ignoredCalendars.filter((c) => c !== nameToRemove));
  };

  // Alterna status de conclusão com persistência em localStorage
  const toggleTask = (taskId) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      try {
        localStorage.setItem(
          `cortex_tasks_checked_${todayKey}`,
          JSON.stringify(Array.from(next))
        );
      } catch (err) {
        console.warn("Falha ao persistir tarefas marcadas:", err);
      }
      return next;
    });
  };

  // Filtra eventos reais de hoje excluindo ruídos
  const filteredEvents = useMemo(() => {
    return rawEvents.filter((event) => {
      const calName = (event.calendarName || "").toLowerCase();
      const title = (event.title || "").toLowerCase();
      return !ignoredCalendars.some((ignored) => {
        const ign = ignored.toLowerCase();
        return calName.includes(ign) || title.includes(ign);
      });
    });
  }, [rawEvents, ignoredCalendars]);

  // Monta lista de tarefas reais (Hoje + Prep Lookahead) - Zero Mocks
  const tasks = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    // 1. Converte eventos reais de hoje em tarefas
    for (const evt of filteredEvents) {
      const taskId = evt.id || `${todayKey}_${evt.title}_${evt.startTime || "evt"}`;
      if (!seenIds.has(taskId)) {
        seenIds.add(taskId);
        list.push({
          id: taskId,
          title: evt.title,
          icon: getTaskIcon(evt.title, false),
          isRealEvent: true,
          startTime: evt.startTime,
        });
      }
    }

    // 2. Adiciona tarefas preparatórias futuras vindas do lookahead
    for (const prep of lookaheadTasks) {
      if (!seenIds.has(prep.id)) {
        seenIds.add(prep.id);
        list.push(prep);
      }
    }

    return list;
  }, [filteredEvents, lookaheadTasks, todayKey]);

  // Contagem de concluídos e progresso circular
  const completedCount = useMemo(() => {
    return tasks.filter((t) => checkedIds.has(t.id)).length;
  }, [tasks, checkedIds]);

  const totalCount = tasks.length;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  // Parâmetros do Anel de Progresso SVG Circular
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div className={cn("obsidian-surface rounded-2xl p-2.5 select-none relative", className)}>
      {/* Header do Widget de Tarefas */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[12.5px] font-semibold text-white tracking-tight">Tasks</h3>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/40 hover:text-white/80 p-0.5 rounded transition-colors cursor-pointer"
              title="Configurar filtros de calendário (ex: Stremio/Séries)"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9.5px] text-white/50 tracking-tight">
            {totalCount === 0
              ? "Sem tarefas pendentes"
              : completedCount === totalCount
              ? "Tudo concluído por hoje! 🎉"
              : `${completedCount} de ${totalCount} concluídas`}
          </p>
        </div>

        {/* Circular Progress Ring SVG */}
        <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
          <svg className="w-8 h-8 -rotate-90 transform" viewBox="0 0 30 30">
            {/* Trilha do fundo */}
            <circle
              cx="15"
              cy="15"
              r={radius}
              className="stroke-white/15"
              strokeWidth="2"
              fill="transparent"
            />
            {/* Arco de progresso ativo com glow */}
            <circle
              cx="15"
              cy="15"
              r={radius}
              stroke="white"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300 ease-out"
              style={{
                filter: "drop-shadow(0 0 3px rgba(255,255,255,0.6))"
              }}
            />
          </svg>
          <span className="absolute text-[9px] font-semibold text-white tracking-tighter">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Painel Retrátil de Configurações de Calendários Ignorados */}
      {showSettings && (
        <div className="mb-2 p-2 rounded-xl bg-black/60 border border-white/10 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-1 border-b border-white/10 mb-1.5">
            <span className="text-[9.5px] font-mono uppercase text-white/60">Filtro de Calendários</span>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] text-white/50 mb-1.5">
            Ignorar ruídos de agenda (ex: Stremio, Séries):
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {ignoredCalendars.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[9px] text-white/80 border border-white/10"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveIgnored(name)}
                  className="hover:text-red-400 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddIgnored} className="flex gap-1">
            <input
              type="text"
              value={newIgnoreName}
              onChange={(e) => setNewIgnoreName(e.target.value)}
              placeholder="Novo calendário para ignorar..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9.5px] text-white outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded text-[9.5px] font-medium text-white flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5" /> Add
            </button>
          </form>
        </div>
      )}

      {/* Layout Adaptativo: Empty State vs 1 Coluna vs 2 Colunas */}
      {tasks.length === 0 ? (
        <div className="py-3 px-2 flex flex-col items-center justify-center text-center rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <Sparkles className="w-4 h-4 text-emerald-400/70 mb-1" />
          <p className="text-[11px] font-medium text-white/70">Nenhum compromisso ou prazo urgente hoje</p>
          <p className="text-[9.5px] text-white/40">Sua agenda está livre ☕</p>
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-1.5",
            tasks.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )}
        >
          {tasks.map((task) => {
            const isDone = checkedIds.has(task.id);
            const Icon = task.icon;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => toggleTask(task.id)}
                className={cn(
                  "w-full rounded-full py-1.5 px-2 flex items-center justify-between select-none cursor-pointer text-left transition-all duration-200",
                  isDone
                    ? "bg-white text-black shadow-[0_0_14px_rgba(255,255,255,0.35)] hover:bg-white/95"
                    : "bg-white/[0.04] text-white/80 border border-white/5 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                {/* Badge Circular com Ícone à Esquerda */}
                <div
                  className={cn(
                    "w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    isDone
                      ? "bg-black/90 text-white"
                      : task.isPrepTask
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/10 text-white/80"
                  )}
                >
                  <Icon className="w-2.5 h-2.5 stroke-[2.2]" />
                </div>

                {/* Título da Tarefa / Compromisso */}
                <span
                  className={cn(
                    "text-[10.5px] truncate flex-1 mx-1.5 transition-colors",
                    isDone
                      ? "font-semibold text-black"
                      : "font-medium text-white/80"
                  )}
                  title={task.isPrepTask ? `${task.title} (${task.originalTitle} - ${task.dayLabel})` : task.title}
                >
                  {task.title}
                </span>

                {/* Tag de Prazo Futuro (Lookahead) se aplicável */}
                {task.isPrepTask && !isDone && (
                  <span className="text-[8.5px] font-mono text-emerald-400/80 mr-1 shrink-0">
                    {task.dayLabel}
                  </span>
                )}

                {/* Indicador à Direita: Checkmark na concluída, Círculo vazio na pendente */}
                {isDone ? (
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0 animate-in zoom-in-75 duration-150">
                    <Check className="w-3 h-3 text-black stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DailyTasksWidget;
