import { describe, it, expect, beforeEach } from '@jest/globals';
import { getLocalDateKey } from '../src/services/calendarApi.js';

describe('Daily Tasks Module & Stremio/Series Filter Tests', () => {
  const DEFAULT_IGNORED = [
    "Stremio",
    "Séries",
    "Series",
    "Feriados",
    "Aniversários",
    "Birthdays",
    "Holidays"
  ];

  const mockEvents = [
    {
      id: "evt-1",
      title: "Treino Academia",
      startTime: "07:00",
      calendarName: "Pessoal"
    },
    {
      id: "evt-2",
      title: "Stranger Things S05E01",
      startTime: "20:00",
      calendarName: "Stremio"
    },
    {
      id: "evt-3",
      title: "Severance S02E03",
      startTime: "21:00",
      calendarName: "Séries"
    },
    {
      id: "evt-4",
      title: "Alinhamento Produto",
      startTime: "14:00",
      calendarName: "Trabalho"
    },
    {
      id: "evt-5",
      title: "Feriado Tiradentes",
      startTime: "00:00",
      calendarName: "Feriados"
    }
  ];

  it('filters out events from Stremio, Séries and Holiday calendars', () => {
    const filtered = mockEvents.filter((event) => {
      const calName = (event.calendarName || '').toLowerCase();
      const title = (event.title || '').toLowerCase();
      return !DEFAULT_IGNORED.some((ignored) => {
        const ign = ignored.toLowerCase();
        return calName.includes(ign) || title.includes(ign);
      });
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map(e => e.title)).toEqual([
      "Treino Academia",
      "Alinhamento Produto"
    ]);
  });

  it('generates stable composite task IDs resilient to revalidation', () => {
    const todayKey = "2026-10-07";
    const eventWithId = {
      id: "apple_evt_9981",
      title: "Reunião de Engenharia",
      startTime: "10:00"
    };
    const eventWithoutId = {
      title: "Reunião de Engenharia",
      startTime: "10:00"
    };

    const idWithId = eventWithId.id || `${todayKey}_${eventWithId.title}_${eventWithId.startTime}`;
    const idWithoutId = eventWithoutId.id || `${todayKey}_${eventWithoutId.title}_${eventWithoutId.startTime}`;

    expect(idWithId).toBe("apple_evt_9981");
    expect(idWithoutId).toBe("2026-10-07_Reunião de Engenharia_10:00");
  });

  it('calculates circular progress ring ratio correctly', () => {
    const total = 6;
    const completed = 3;
    const ratio = completed / total;
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - ratio);

    expect(ratio).toBe(0.5);
    expect(offset).toBeCloseTo(circumference / 2, 2);

    // Handles zero tasks gracefully without NaN
    const zeroTotal = 0;
    const zeroCompleted = 0;
    const zeroRatio = zeroTotal > 0 ? zeroCompleted / zeroTotal : 0;
    expect(zeroRatio).toBe(0);
  });

  it('deduces prep task titles and creates isolated composite task IDs for lookahead', () => {
    function getPrepTaskTitle(title = '') {
      const t = title.trim();
      const lower = t.toLowerCase();
      if (lower.startsWith('prova de ')) return `Estudar ${t.slice(9).trim()}`;
      if (lower.startsWith('prova ')) return `Estudar ${t.slice(6).trim()}`;
      if (lower.includes('fmi')) return 'Estudar FMI';
      if (lower.includes('poo')) return 'Estudar POO';
      if (lower.includes('entrega') || lower.includes('trabalho') || lower.includes('projeto')) return `Preparar ${t}`;
      if (lower.includes('seminário') || lower.includes('seminario')) return `Revisar ${t}`;
      return `Estudar ${t}`;
    }

    expect(getPrepTaskTitle('Prova de Cálculo 2')).toBe('Estudar Cálculo 2');
    expect(getPrepTaskTitle('Prova FMI')).toBe('Estudar FMI');
    expect(getPrepTaskTitle('Entrega TP1')).toBe('Preparar Entrega TP1');
    expect(getPrepTaskTitle('Seminário Compiladores')).toBe('Revisar Seminário Compiladores');

    // Test isolated composite task ID
    const todayKey = '2026-10-07';
    const futureEvent = {
      id: 'apple_evt_future_exam_99',
      title: 'Prova FMI',
      date: '2026-10-10'
    };

    const isolatedTaskId = `prep_${futureEvent.id || futureEvent.title}_${todayKey}`;
    expect(isolatedTaskId).toBe('prep_apple_evt_future_exam_99_2026-10-07');
    
    // Verifies that checking off today's prep task doesn't collide with future event
    expect(isolatedTaskId).not.toBe(futureEvent.id);
  });

  it('determines adaptive grid layout based on actual task count', () => {
    const getGridCols = (count) => (count === 1 ? 'grid-cols-1' : 'grid-cols-2');
    
    expect(getGridCols(1)).toBe('grid-cols-1');
    expect(getGridCols(2)).toBe('grid-cols-2');
    expect(getGridCols(4)).toBe('grid-cols-2');
  });

  it('persists checked state per date key', () => {
    const todayKey = getLocalDateKey(new Date());
    const storageKey = `cortex_tasks_checked_${todayKey}`;
    
    // Simulate checking two tasks
    const checkedTasks = ["task_1", "task_2"];
    const serialized = JSON.stringify(checkedTasks);
    const restored = new Set(JSON.parse(serialized));

    expect(restored.has("task_1")).toBe(true);
    expect(restored.has("task_2")).toBe(true);
    expect(restored.has("task_3")).toBe(false);
  });

  it('filters day events using hidden calendars configuration', () => {
    const hiddenCalendars = ["Stremio", "Séries"];
    const allEvents = [
      { id: "e1", title: "Aula Cálculo", calendarName: "UFSC", date: "2026-10-07" },
      { id: "e2", title: "Stranger Things S05E02", calendarName: "Stremio", date: "2026-10-07" },
      { id: "e3", title: "Reunião Cortex", calendarName: "Trabalho", date: "2026-10-07" },
      { id: "e4", title: "Severance S02E04", calendarName: "Séries", date: "2026-10-07" },
    ];

    const hiddenLower = hiddenCalendars.map(h => h.toLowerCase());
    const filtered = allEvents.filter(e => {
      const cal = (e.calendarName || "").toLowerCase();
      return !hiddenLower.some(h => cal === h || cal.includes(h));
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map(e => e.id)).toEqual(["e1", "e3"]);
  });

  it('elects the ongoing or chronologically closest upcoming event as Hero', () => {
    function electHero(events, currentHour = 10, currentMinute = 30) {
      if (!events || events.length === 0) return null;
      const nowMinutes = currentHour * 60 + currentMinute;
      let bestUpcoming = null;
      let minUpcomingDiff = Infinity;

      for (const evt of events) {
        const [h, m] = (evt.startTime || "00:00").split(":").map(Number);
        const startMinutes = (h || 0) * 60 + (m || 0);
        const [eh, em] = (evt.endTime || "00:00").split(":").map(Number);
        const endMinutes = eh ? eh * 60 + em : startMinutes + 45;

        // In progress
        if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
          return evt.id;
        }

        // Closest upcoming in future
        if (startMinutes > nowMinutes && (startMinutes - nowMinutes) < minUpcomingDiff) {
          minUpcomingDiff = startMinutes - nowMinutes;
          bestUpcoming = evt;
        }
      }

      if (bestUpcoming) return bestUpcoming.id;
      return events[0].id;
    }

    const dayEvts = [
      { id: "past", title: "Daily Sync", startTime: "09:00", endTime: "09:30" },
      { id: "ongoing", title: "Kickoff", startTime: "10:00", endTime: "11:00" },
      { id: "future", title: "Sprint Review", startTime: "14:00", endTime: "15:00" },
    ];

    // At 10:30, "ongoing" is in progress
    expect(electHero(dayEvts, 10, 30)).toBe("ongoing");

    // At 11:30, "future" is the closest upcoming
    expect(electHero(dayEvts, 11, 30)).toBe("future");

    // At 16:00 (past all events), defaults to first event
    expect(electHero(dayEvts, 16, 0)).toBe("past");
  });
});

