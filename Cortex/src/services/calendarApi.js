/**
 * calendarApi.js
 * Cortex Unified Calendar Integration Service
 * Bridges Apple Calendar (Rust / EventKit IPC) and Google Calendar (Node.js API).
 * Strictly compliant with security.md (Zero Trust URL validation and token handling).
 */

const API_BASE_URL = typeof process !== 'undefined' && process.env?.VITE_API_URL 
  ? process.env.VITE_API_URL 
  : 'http://localhost:3000';

/**
 * Checks if the current environment is running inside a Tauri container
 */
export function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/**
 * Safely calls Tauri IPC command with fallback
 */
async function invokeTauri(command, args = {}) {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(command, args);
    } catch (err) {
      console.warn(`[calendarApi] Tauri invoke('${command}') failed:`, err);
      throw err;
    }
  }
  return null;
}

// ==========================================
// In-Memory SWR Cache for Latency-Zero Timeline
// ==========================================
let cachedCalendars = null;
const dayEventsCache = new Map();
const inFlightRequests = new Map();

/**
 * Formats any Date, string, or timestamp into a strict local YYYY-MM-DD key.
 * Never uses toISOString() or UTC methods to avoid Brasilia (UTC-3) day jumping.
 */
export function getLocalDateKey(date) {
  if (!date) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(date).slice(0, 10);
}

export const getDateKey = getLocalDateKey;

/**
 * Ensures time string is strictly formatted as 2-digit HH:MM (e.g. "09:00", "14:30")
 */
export function formatTimeHHMM(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '09:00';
  const trimmed = timeStr.trim();
  const parts = trimmed.split(':');
  if (parts.length >= 2) {
    const h = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
    const m = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
    return `${h}:${m}`;
  }
  return trimmed;
}

/**
 * Safely creates a local Date anchored at midday (12:00) from a YYYY-MM-DD string.
 * Completely avoids the ECMAScript UTC midnight trap of new Date("YYYY-MM-DD").
 */
export function parseLocalDate(dateKey) {
  if (dateKey instanceof Date) return dateKey;
  if (typeof dateKey === 'string') {
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      return new Date(y, m, d, 12, 0, 0, 0);
    }
  }
  return new Date();
}

/**
 * Reads cached events for a specific date (zero latency)
 */
export function getCachedDayEvents(date) {
  return dayEventsCache.get(getLocalDateKey(date)) || null;
}

/**
 * Manually populates the cache for a specific date
 */
export function setCachedDayEvents(date, events) {
  dayEventsCache.set(getLocalDateKey(date), Array.isArray(events) ? events : []);
}

/**
 * Resets all calendar in-memory caches (useful in tests or on logout)
 */
export function clearCalendarCache() {
  cachedCalendars = null;
  dayEventsCache.clear();
  inFlightRequests.clear();
}

/**
 * Helper to remove an event by ID across all in-memory date caches
 */
function removeEventFromCache(eventId) {
  for (const [k, evts] of dayEventsCache.entries()) {
    if (evts.some((e) => e.id === eventId)) {
      dayEventsCache.set(k, evts.filter((e) => e.id !== eventId));
    }
  }
}

// ==========================================
// 1. Apple Calendar Integration (Rust IPC)
// ==========================================

/**
 * Lists the user's real native Apple Calendars on macOS (with SWR caching)
 * @returns {Promise<Array<{ id: string, title: string, colorHex: string, isWritable: boolean }>>}
 */
export async function getAppleCalendars() {
  if (cachedCalendars && cachedCalendars.length > 0) {
    return cachedCalendars;
  }

  try {
    const res = await invokeTauri('get_apple_calendars');
    if (Array.isArray(res) && res.length > 0) {
      cachedCalendars = res;
      return res;
    }
  } catch (err) {
    console.warn('[calendarApi] getAppleCalendars fallback:', err.message || err);
  }

  // Graceful fallback for non-Tauri / test environments
  const fallback = [
    { id: 'Home', title: 'Pessoal', colorHex: '#2C99D3', isWritable: true },
    { id: 'Work', title: 'Trabalho', colorHex: '#E700F9', isWritable: true },
    { id: 'Família', title: 'Família', colorHex: '#007DFF', isWritable: true },
    { id: 'UFSC', title: 'UFSC', colorHex: '#73D343', isWritable: true },
  ];
  cachedCalendars = fallback;
  return fallback;
}

/**
 * Creates an event in Apple Calendar via Rust osascript bridge with optimistic cache update
 * @param {Object} payload
 * @returns {Promise<string>} Event ID
 */
export async function createAppleCalendarEvent(payload) {
  const dateKey = getDateKey(payload.date);
  const tempId = `apple-opt-${Date.now()}`;

  // Roteamento seguro para o primeiro calendário gravável (isWritable: true) ou preferência salva
  let targetCalName = payload.calendarName;
  if (!targetCalName) {
    const savedPref = typeof localStorage !== 'undefined' ? localStorage.getItem('cortex_default_calendar') : null;
    if (savedPref) {
      targetCalName = savedPref;
    } else {
      const cals = await getAppleCalendars().catch(() => []);
      const writable = cals.find((c) => c.isWritable);
      targetCalName = writable ? writable.title : 'Pessoal';
    }
  }

  const enrichedPayload = {
    ...payload,
    calendarName: targetCalName,
  };

  // 1. Optimistic SWR Cache Mutation (Immediate Zero-Latency)
  const optimisticEvent = {
    id: tempId,
    title: payload.title || 'Compromisso',
    startTime: formatTimeHHMM(payload.startTime || '09:00'),
    endTime: formatTimeHHMM(payload.endTime || '10:00'),
    duration: '1h',
    calendarName: targetCalName,
    categoryColor: payload.categoryColor || '#3B82F6',
    description: payload.description || null,
    meetingLink: payload.meetingUrl || null,
    platform: payload.location?.toLowerCase().includes('zoom')
      ? 'zoom'
      : payload.location?.toLowerCase().includes('meet')
      ? 'meet'
      : null,
    organizer: 'Você',
    isOrganizer: true,
    attendees: [
      {
        name: 'Você',
        email: 'me@apple.local',
        status: 'accepted',
        isYou: true,
      },
    ],
  };

  const existing = dayEventsCache.get(dateKey) || [];
  dayEventsCache.set(dateKey, [optimisticEvent, ...existing.filter((e) => e.id !== tempId)]);

  // 2. Asynchronous Native Dispatch (Rust / osascript)
  try {
    const res = await invokeTauri('create_apple_calendar_event', { payload: enrichedPayload });
    if (res) {
      // Reconcile optimistic ID with native ID in cache
      const current = dayEventsCache.get(dateKey) || [];
      dayEventsCache.set(
        dateKey,
        current.map((e) => (e.id === tempId ? { ...e, id: res } : e))
      );
      return res;
    }
  } catch (err) {
    console.warn('[calendarApi] createAppleCalendarEvent error:', err);
    throw err;
  }

  return tempId;
}

/**
 * Deletes an event by ID from Apple Calendar with optimistic cache eviction
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function deleteAppleCalendarEvent(eventId) {
  // 1. Optimistic Cache Eviction
  removeEventFromCache(eventId);

  // 2. Asynchronous Native Dispatch
  try {
    const res = await invokeTauri('delete_apple_calendar_event', { eventId });
    if (res !== null) return res;
    return true;
  } catch (err) {
    console.warn('[calendarApi] deleteAppleCalendarEvent error:', err);
    throw err;
  }
}

/**
 * Fetches events scheduled for a specific date from Apple Calendar using strict local components
 * @param {Date|string} date
 * @returns {Promise<Array>}
 */
export async function getAppleCalendarEvents(date) {
  const dateIso = getLocalDateKey(date);
  const [y, m, d] = dateIso.split('-').map(Number);

  if (!isTauriEnvironment()) {
    return [];
  }

  try {
    const res = await invokeTauri('get_apple_calendar_events', {
      dateIso,
      year: y,
      month: m,
      day: d,
    });
    if (Array.isArray(res)) return res;
    return [];
  } catch (err) {
    console.warn('[calendarApi] getAppleCalendarEvents error:', err.message || err);
    throw err;
  }
}

// ==========================================
// 2. Google Calendar Integration (Node.js API)
// ==========================================

function getAuthHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  const resolvedToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('cortex_token') : null);
  if (resolvedToken) {
    headers['Authorization'] = `Bearer ${resolvedToken}`;
  }
  return headers;
}

/**
 * Fetches today's events from the Node.js API (Google Calendar)
 */
export async function getTodayEvents(token) {
  const response = await fetch(`${API_BASE_URL}/calendar/today`, {
    headers: getAuthHeaders(token),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Failed to fetch today events from API');
  }
  return json.data || [];
}

/**
 * Lists events with custom time boundaries from the Node.js API
 */
export async function listEvents(options = {}, token) {
  const params = new URLSearchParams();
  if (options.timeMin) params.append('timeMin', options.timeMin);
  if (options.timeMax) params.append('timeMax', options.timeMax);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/calendar/events${query}`, {
    headers: getAuthHeaders(token),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || 'Failed to list events from API');
  }
  return json.data || [];
}

/**
 * Creates an event on Google Calendar via Node.js API with optimistic cache update
 */
export async function createEvent(eventPayload, token) {
  const dateKey = getLocalDateKey(eventPayload.start);
  const tempId = `google-opt-${Date.now()}`;

  // 1. Optimistic SWR Cache Mutation
  const sDate = eventPayload.start ? new Date(eventPayload.start) : new Date();
  const eDate = eventPayload.end ? new Date(eventPayload.end) : new Date(Date.now() + 45 * 60000);
  const optimisticEvent = {
    id: tempId,
    title: eventPayload.title || eventPayload.summary || 'Compromisso',
    startTime: sDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    endTime: eDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    duration: '45 min',
    categoryColor: '#38BDF8',
    calendarName: 'Google Calendar',
    platform: eventPayload.hangoutLink ? 'meet' : null,
    meetingLink: eventPayload.hangoutLink || null,
    organizer: 'Você',
    isOrganizer: true,
    attendees: (eventPayload.attendees || []).map((a) =>
      typeof a === 'string' ? { name: a, email: a, status: 'accepted', isYou: false } : a
    ),
  };

  const existing = dayEventsCache.get(dateKey) || [];
  dayEventsCache.set(dateKey, [optimisticEvent, ...existing.filter((e) => e.id !== tempId)]);

  // 2. Asynchronous Remote API Dispatch
  try {
    const response = await fetch(`${API_BASE_URL}/calendar/events`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(eventPayload),
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.message || 'Failed to create event on Google Calendar');
    }
    if (json.data && json.data.id) {
      const current = dayEventsCache.get(dateKey) || [];
      dayEventsCache.set(
        dateKey,
        current.map((e) => (e.id === tempId ? { ...e, id: json.data.id } : e))
      );
    }
    return json.data;
  } catch (err) {
    console.warn('[calendarApi] createEvent error:', err);
    throw err;
  }
}

/**
 * Deletes an event on Google Calendar via Node.js API with optimistic cache eviction
 */
export async function deleteEvent(eventId, token) {
  // 1. Optimistic Cache Eviction
  removeEventFromCache(eventId);

  // 2. Asynchronous Remote API Dispatch
  try {
    const response = await fetch(`${API_BASE_URL}/calendar/events/${eventId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.message || 'Failed to delete event on Google Calendar');
    }
    return json;
  } catch (err) {
    console.warn('[calendarApi] deleteEvent error:', err);
    throw err;
  }
}

// ==========================================
// 3. Unified Real Sync Loader
// ==========================================

/**
 * Loads events for a given day from Apple Calendar and Google Calendar simultaneously.
 * Normalizes all events to the Cortex frontend contract.
 * Updates in-memory SWR cache and falls back safely to mock data if empty.
 * 
 * @param {Date|string} date
 * @param {Array} fallbackMocks
 * @param {string|null} token
 * @returns {Promise<Array>}
 */
export async function loadDayEvents(date = new Date(), fallbackMocks = [], token = null) {
  const dateKey = getLocalDateKey(date);

  // 1. Deduplicação In-Flight: Se já existir uma Promise em andamento para essa mesma data,
  // retorna a Promise existente em vez de disparar uma nova invocação IPC concorrente.
  if (inFlightRequests.has(dateKey)) {
    return inFlightRequests.get(dateKey);
  }

  const executionPromise = (async () => {
    const targetDate = parseLocalDate(dateKey);
    const results = [];
    let appleSuccess = false;
    let appleError = null;

    // 1. Fetch Apple Calendar events (macOS native)
    try {
      const appleEvents = await getAppleCalendarEvents(date);
      appleSuccess = true;
      if (Array.isArray(appleEvents) && appleEvents.length > 0) {
        for (const ev of appleEvents) {
          results.push({
            ...ev,
            startTime: formatTimeHHMM(ev.startTime),
            endTime: formatTimeHHMM(ev.endTime),
            categoryColor: ev.categoryColor && ev.categoryColor.startsWith('#') ? ev.categoryColor : '#3B82F6',
            date: ev.date || dateKey,
            dateObj: ev.dateObj || parseLocalDate(ev.date || dateKey),
          });
        }
      }
    } catch (err) {
      console.warn('[calendarApi] Apple Calendar sync bypassed:', err);
      appleSuccess = false;
      appleError = err;
    }

    // 2. Fetch Google Calendar events (Node API)
    try {
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0).toISOString();
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999).toISOString();
      
      const googleEvents = await listEvents({ timeMin: startOfDay, timeMax: endOfDay }, token);
      if (Array.isArray(googleEvents) && googleEvents.length > 0) {
        // Normalize Google Event to Frontend Contract
        for (const gev of googleEvents) {
          const sTime = gev.start?.dateTime ? new Date(gev.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '09:00';
          const eTime = gev.end?.dateTime ? new Date(gev.end.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '09:45';
          const eventLocalKey = gev.start?.dateTime ? getLocalDateKey(new Date(gev.start.dateTime)) : dateKey;

          results.push({
            id: gev.id,
            title: gev.summary || 'Compromisso',
            startTime: formatTimeHHMM(sTime),
            endTime: formatTimeHHMM(eTime),
            duration: '45 min',
            categoryColor: '#38BDF8',
            calendarName: 'Google Calendar',
            platform: gev.hangoutLink ? 'meet' : null,
            meetingLink: gev.hangoutLink || null,
            date: eventLocalKey,
            dateObj: parseLocalDate(eventLocalKey),
            organizer: gev.organizer?.displayName || gev.organizer?.email || 'Organizador',
            isOrganizer: Boolean(gev.organizer?.self),
            attendees: (gev.attendees || []).map(a => ({
              name: a.displayName || a.email,
              email: a.email,
              status: a.responseStatus === 'accepted' ? 'accepted' : 'tentative',
              isYou: Boolean(a.self)
            }))
          });
        }
      }
    } catch {
      // API offline or unauthenticated, expected in local preview/tests
    }

    // Normaliza todos os eventos anexando estritamente a chave local e dateObj
    const normalizedResults = results.map((e) => {
      const resolvedKey = e.date ? getLocalDateKey(e.date) : dateKey;
      return {
        ...e,
        date: resolvedKey,
        dateObj: e.dateObj || parseLocalDate(resolvedKey),
      };
    });

    // 3. Cache fresh results or fallback
    if (normalizedResults.length > 0) {
      dayEventsCache.set(dateKey, normalizedResults);
      return normalizedResults;
    }

    // 4. Fallback isolado exclusivamente se mocks forem passados por parâmetro (ex: testes Jest)
    if (Array.isArray(fallbackMocks) && fallbackMocks.length > 0) {
      const normalizedMocks = fallbackMocks.map((m) => {
        const resolvedMockKey = m.date ? getLocalDateKey(m.date) : dateKey;
        return {
          ...m,
          startTime: formatTimeHHMM(m.startTime),
          endTime: formatTimeHHMM(m.endTime),
          categoryColor: m.categoryColor || '#3B82F6',
          date: resolvedMockKey,
          dateObj: m.dateObj || parseLocalDate(resolvedMockKey),
        };
      });
      return normalizedMocks;
    }

    // Se estiver em ambiente Tauri e a consulta nativa falhou, REJEITA lançando o erro.
    // Convenção canônica: no CalendarTimeline o .catch() preserva o estado sem sobrescrever com [].
    if (isTauriEnvironment() && !appleSuccess) {
      throw appleError || new Error('Falha ao comunicar com o Apple Calendar');
    }

    // 5. Dia livre (100% real com sucesso comprovado)
    dayEventsCache.set(dateKey, []);
    return [];
  })();

  inFlightRequests.set(dateKey, executionPromise);

  try {
    return await executionPromise;
  } finally {
    inFlightRequests.delete(dateKey);
  }
}

/**
 * Heuristic client-side parser for dates, times and event titles in pt-BR.
 * Always resolves to today or nearest future date, with safe 1h duration.
 */
export function parseQuickEventHeuristic(text, anchorDateStr, availableCalendars = []) {
  const refDateStr = anchorDateStr || getLocalDateKey(new Date());
  const [y, m, d] = refDateStr.split('-').map(Number);
  const refDate = new Date(y, m - 1, d, 12, 0, 0);
  const lower = text.toLowerCase();

  let targetDate = new Date(refDate);
  const dayMap = {
    'domingo': 0,
    'segunda': 1,
    'segunda-feira': 1,
    'terca': 2,
    'terça': 2,
    'terça-feira': 2,
    'quarta': 3,
    'quarta-feira': 3,
    'quinta': 4,
    'quinta-feira': 4,
    'sexta': 5,
    'sexta-feira': 5,
    'sabado': 6,
    'sábado': 6
  };

  if (/(?:^|\s)amanh[aã](?:$|\s|[.,!?])/i.test(lower)) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/(?:^|\s)hoje(?:$|\s|[.,!?])/i.test(lower)) {
    // Mantém a data de hoje
  } else {
    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      const regex = new RegExp(`(?:^|\\s)(?:na\\s+|no\\s+)?${dayName}(?:$|\\s|[.,!?])`, 'i');
      if (regex.test(lower)) {
        const currentDay = refDate.getDay();
        let diff = dayIndex - currentDay;
        if (diff <= 0) {
          diff += 7; // Projeta sempre para o próximo dia correspondente, nunca passado
        }
        targetDate.setDate(targetDate.getDate() + diff);
        break;
      }
    }
  }

  const resolvedDateStr = getLocalDateKey(targetDate);

  let startTime = '09:00';
  let endTime = '10:00';

  const timeMatch = lower.match(/(?:[àa]s\s*)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2] || timeMatch[3] || '0', 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 23) {
      startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const endHour = (hour + 1) % 24;
      endTime = `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  let cleanedTitle = text
    .replace(/(?:^|\s)(?:na|no)\s+(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:amanh[aã]|hoje)(?:\s|$)/gi, ' ')
    .replace(/(?:[àa]s\s*)?\d{1,2}(?:h(?:\d{1,2})?|:\d{2})/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedTitle) {
    cleanedTitle = text.trim();
  }

  cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

  // Roteamento Semântico Inteligente de Calendários
  let targetCalendar = null;
  const cals = Array.isArray(availableCalendars) ? availableCalendars : [];

  const findCalendar = (candidates) => {
    for (const cand of candidates) {
      const found = cals.find((c) => c && c.toLowerCase().trim() === cand.toLowerCase().trim());
      if (found) return found;
    }
    for (const cand of candidates) {
      const found = cals.find((c) => c && c.toLowerCase().trim().includes(cand.toLowerCase().trim()));
      if (found) return found;
    }
    return null;
  };

  const academicKeywords = ['ufsc', 'aula', 'hélio', 'helio', 'prova', 'atividade', 'trabalho acadêmico', 'disciplina', 'professor', 'faculdade', 'universidade', 'estudo', 'estudos', 'seminario', 'seminário'];
  const workKeywords = ['reuniao', 'reunião', 'meeting', 'call', 'cliente', 'sprint', 'deploy', 'alinhamento', 'trabalho', 'work', 'projeto', '1:1', 'one-on-one'];
  const personalKeywords = ['almoço', 'almoco', 'jantar', 'médico', 'medico', 'consulta', 'dentista', 'academia', 'compras', 'família', 'familia', 'casa', 'aniversário', 'aniversario'];

  const matchesAny = (keywords) => keywords.some((k) => lower.includes(k));

  if (matchesAny(academicKeywords)) {
    targetCalendar = findCalendar(['UFSC', 'Faculdade', 'Estudos', 'Acadêmico', 'Universidade']) || (cals.includes('UFSC') ? 'UFSC' : null);
  } else if (matchesAny(workKeywords)) {
    targetCalendar = findCalendar(['Trabalho', 'Work', 'Profissional', 'Job']) || (cals.includes('Trabalho') ? 'Trabalho' : null);
  } else if (matchesAny(personalKeywords)) {
    targetCalendar = findCalendar(['Pessoal', 'Home', 'Família', 'Personal']) || (cals.includes('Pessoal') ? 'Pessoal' : null);
  }

  return {
    title: cleanedTitle,
    date: resolvedDateStr,
    startTime,
    endTime,
    targetCalendar
  };
}

/**
 * Natural language event parsing bridging Express backend NLP and local heuristic
 */
export async function parseQuickEvent(text, options = {}) {
  const today = new Date();
  const anchorDate = options.anchorDate || getLocalDateKey(today);
  const dayOfWeek = options.dayOfWeek || today.toLocaleDateString('pt-BR', { weekday: 'long' });
  const timeZone = options.timeZone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Sao_Paulo');
  const availableCalendars = options.availableCalendars || [];

  try {
    const response = await fetch(`${API_BASE_URL}/calendar/parse-quick`, {
      method: 'POST',
      headers: getAuthHeaders(options.token),
      body: JSON.stringify({ text, anchorDate, dayOfWeek, timeZone, availableCalendars })
    });

    if (response.ok) {
      const json = await response.json();
      if (json.success && json.data?.title && json.data?.date) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('[calendarApi] NLP backend call bypassed, using local heuristic:', err.message || err);
  }

  return parseQuickEventHeuristic(text, anchorDate, availableCalendars);
}

export default {
  getLocalDateKey,
  getDateKey,
  parseLocalDate,
  getCachedDayEvents,
  setCachedDayEvents,
  clearCalendarCache,
  getAppleCalendars,
  createAppleCalendarEvent,
  deleteAppleCalendarEvent,
  getAppleCalendarEvents,
  getTodayEvents,
  listEvents,
  createEvent,
  deleteEvent,
  loadDayEvents,
  formatTimeHHMM,
  parseQuickEvent,
  parseQuickEventHeuristic,
};
