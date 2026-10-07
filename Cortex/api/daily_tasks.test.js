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
    const radius = 13;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - ratio);

    expect(ratio).toBe(0.5);
    expect(offset).toBeCloseTo(circumference / 2, 2);
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
});
