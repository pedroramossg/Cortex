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

const DEFAULT_HABITS = [
  { id: "habit_workout", title: "First Workout", iconType: "workout" },
  { id: "habit_read", title: "Read 10 pages", iconType: "read" },
  { id: "habit_water", title: "Drink water", iconType: "water" },
  { id: "habit_diet", title: "Healthy diet", iconType: "diet" },
  { id: "habit_deep_work", title: "Deep Work", iconType: "work" },
  { id: "habit_review", title: "Daily Review", iconType: "sparkles" },
];

/**
 * Mapeia palavras-chave do título do compromisso para ícones contextuais
 */
function getTaskIcon(title = "", iconType = null) {
  const t = title.toLowerCase();
  if (iconType === "workout" || t.includes("workout") || t.includes("treino") || t.includes("academia") || t.includes("exercício")) {
    return Dumbbell;
  }
  if (iconType === "read" || t.includes("read") || t.includes("livro") || t.includes("leitura") || t.includes("ler") || t.includes("estudo") || t.includes("aula") || t.includes("prova")) {
    return iconType === "read" ? BookOpen : GraduationCap;
  }
  if (iconType === "water" || t.includes("water") || t.includes("água") || t.includes("hidratar")) {
    return Droplets;
  }
  if (iconType === "diet" || t.includes("diet") || t.includes("comida") || t.includes("almoço") || t.includes("jantar") || t.includes("nutri")) {
    return Utensils;
  }
  if (iconType === "work" || t.includes("reunião") || t.includes("meet") || t.includes("call") || t.includes("sync") || t.includes("alinhamento") || t.includes("projeto")) {
    return Briefcase;
  }
  if (t.includes("morning") || t.includes("manhã") || t.includes("acordar")) {
    return Sun;
  }
  return Sparkles;
}

/**
 * DailyTasksWidget: Módulo de tarefas diárias no Tray Popover inspirado fielmente na Imagem 4.
 * - Header com título, subtítulo e anel de progresso circular SVG (X/Y).
 * - Grade de 2 colunas com pílulas táteis (completas: branco radiante; pendentes: dark glass).
 * - Filtro configurável de calendários ignorados (Stremio, Séries, etc.).
 * - Persistência estável em localStorage por data (cortex_tasks_checked_YYYY-MM-DD).
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

  // Modal / Popover de configurações de filtros
  const [showSettings, setShowSettings] = useState(false);
  const [newIgnoreName, setNewIgnoreName] = useState("");

  // Conjunto de IDs de tarefas marcadas como concluídas
  const [checkedIds, setCheckedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`cortex_tasks_checked_${todayKey}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      // Ignora erro de JSON
    }
    return new Set();
  });

  // Eventos reais do calendário para hoje
  const [rawEvents, setRawEvents] = useState(() => {
    return calendarApi.getCachedDayEvents(today) || [];
  });

  useEffect(() => {
    let isCancelled = false;
    calendarApi.loadDayEvents(today)
      .then((evts) => {
        if (!isCancelled && Array.isArray(evts)) {
          setRawEvents(evts);
        }
      })
      .catch(() => {
        // Falhas silenciosas utilizam o cache ou fallback
      });
    return () => {
      isCancelled = true;
    };
  }, [today]);

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

  // Filtra eventos reais excluindo calendários ignorados (Stremio, Séries, Feriados)
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

  // Monta lista de 4 a 6 tarefas combinando eventos reais e hábitos saudáveis
  const tasks = useMemo(() => {
    const list = [];

    // 1. Converte eventos reais em tarefas
    for (const evt of filteredEvents) {
      // Chave composta estável à prova de revalidação
      const taskId = evt.id || `${todayKey}_${evt.title}_${evt.startTime}`;
      list.push({
        id: taskId,
        title: evt.title,
        icon: getTaskIcon(evt.title),
        isRealEvent: true,
        startTime: evt.startTime,
      });
    }

    // 2. Se houver menos de 6 tarefas, preenche com hábitos padrão (fiel à Imagem 4)
    if (list.length < 6) {
      for (const habit of DEFAULT_HABITS) {
        if (list.length >= 6) break;
        const habitId = `${todayKey}_${habit.id}`;
        // Não duplica se já existir tarefa com mesmo título
        if (!list.some((t) => t.title.toLowerCase() === habit.title.toLowerCase())) {
          list.push({
            id: habitId,
            title: habit.title,
            icon: getTaskIcon(habit.title, habit.iconType),
            isRealEvent: false,
          });
        }
      }
    }

    return list.slice(0, 6);
  }, [filteredEvents, todayKey]);

  // Contagem de concluídos e progresso circular
  const completedCount = useMemo(() => {
    return tasks.filter((t) => checkedIds.has(t.id)).length;
  }, [tasks, checkedIds]);

  const totalCount = tasks.length;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  // Parâmetros do Anel de Progresso SVG Circular (Imagem 4)
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div className={cn("obsidian-surface rounded-2xl p-3 select-none relative", className)}>
      {/* Header do Widget de Tarefas */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-semibold text-white tracking-tight">Tasks</h3>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/40 hover:text-white/80 p-0.5 rounded transition-colors"
              title="Configurar calendários ignorados (Stremio/Séries)"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-white/50 tracking-tight">
            {completedCount === totalCount && totalCount > 0
              ? "All done for today! 🎉"
              : "Great start to the day"}
          </p>
        </div>

        {/* Circular Progress Ring SVG (Imagem 4) */}
        <div className="relative flex items-center justify-center w-9 h-9 shrink-0">
          <svg className="w-9 h-9 -rotate-90 transform" viewBox="0 0 32 32">
            {/* Trilha do fundo */}
            <circle
              cx="16"
              cy="16"
              r={radius}
              className="stroke-white/15"
              strokeWidth="2.2"
              fill="transparent"
            />
            {/* Arco de progresso ativo com glow */}
            <circle
              cx="16"
              cy="16"
              r={radius}
              stroke="white"
              strokeWidth="2.2"
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
          <span className="absolute text-[9.5px] font-semibold text-white tracking-tighter">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Painel Retrátil de Configurações de Calendários Ignorados */}
      {showSettings && (
        <div className="mb-2.5 p-2 rounded-xl bg-black/60 border border-white/10 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-1.5">
            <span className="text-[10px] font-mono uppercase text-white/60">Filtro de Calendários</span>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-white/40 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9.5px] text-white/50 mb-1.5">
            Ignorar séries, filmes ou ruídos de agenda (ex: Stremio):
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {ignoredCalendars.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[9.5px] text-white/80 border border-white/10"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveIgnored(name)}
                  className="hover:text-red-400"
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
              className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded text-[10px] font-medium text-white flex items-center gap-0.5"
            >
              <Plus className="w-2.5 h-2.5" /> Add
            </button>
          </form>
        </div>
      )}

      {/* Grade de 2 Colunas com Cartões em Formato de Pílula (Imagem 4) */}
      <div className="grid grid-cols-2 gap-2">
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
                  ? "bg-white text-black shadow-[0_0_16px_rgba(255,255,255,0.35)] hover:bg-white/95"
                  : "bg-white/[0.04] text-white/80 border border-white/5 hover:bg-white/[0.08] hover:text-white"
              )}
            >
              {/* Badge Circular com Ícone à Esquerda */}
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  isDone
                    ? "bg-black/90 text-white"
                    : "bg-white/10 text-white/80"
                )}
              >
                <Icon className="w-3 h-3 stroke-[2.2]" />
              </div>

              {/* Título da Tarefa / Compromisso */}
              <span
                className={cn(
                  "text-[11px] truncate flex-1 mx-1.5 transition-colors",
                  isDone
                    ? "font-semibold text-black"
                    : "font-medium text-white/80"
                )}
                title={task.title}
              >
                {task.title}
              </span>

              {/* Indicador à Direita: Checkmark na concluída, Círculo vazio na pendente */}
              {isDone ? (
                <div className="w-4 h-4 flex items-center justify-center shrink-0 animate-in zoom-in-75 duration-150">
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                </div>
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DailyTasksWidget;
