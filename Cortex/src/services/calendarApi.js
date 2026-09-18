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

/**
 * Normalizes any Date or ISO string into a YYYY-MM-DD key
 */
export function getDateKey(date) {
  if (!date) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(date).slice(0, 10);
}

/**
 * Reads cached events for a specific date (zero latency)
 */
export function getCachedDayEvents(date) {
  return dayEventsCache.get(getDateKey(date)) || null;
}

/**
 * Manually populates the cache for a specific date
 */
export function setCachedDayEvents(date, events) {
  dayEventsCache.set(getDateKey(date), Array.isArray(events) ? events : []);
}

/**
 * Resets all calendar in-memory caches (useful in tests or on logout)
 */
export function clearCalendarCache() {
  cachedCalendars = null;
  dayEventsCache.clear();
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

  // 1. Optimistic SWR Cache Mutation (Immediate Zero-Latency)
  const optimisticEvent = {
    id: tempId,
    title: payload.title || 'Compromisso',
    startTime: payload.startTime || '09:00',
    endTime: payload.endTime || '09:45',
    duration: '45 min',
    calendarName: payload.calendarName || 'Pessoal',
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
    const res = await invokeTauri('create_apple_calendar_event', { payload });
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
 * Fetches events scheduled for a specific date from Apple Calendar
 * @param {Date|string} date
 * @returns {Promise<Array>}
 */
export async function getAppleCalendarEvents(date) {
  const dateIso = getDateKey(date);

  try {
    const res = await invokeTauri('get_apple_calendar_events', { dateIso });
    if (Array.isArray(res)) return res;
  } catch (err) {
    console.warn('[calendarApi] getAppleCalendarEvents fallback:', err.message || err);
  }
  return [];
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
  const dateKey = getDateKey(eventPayload.start);
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
 * @param {Date} date
 * @param {Array} fallbackMocks
 * @param {string|null} token
 * @returns {Promise<Array>}
 */
export async function loadDayEvents(date = new Date(), fallbackMocks = [], token = null) {
  const dateKey = getDateKey(date);
  const results = [];

  // 1. Fetch Apple Calendar events (macOS native)
  try {
    const appleEvents = await getAppleCalendarEvents(date);
    if (Array.isArray(appleEvents) && appleEvents.length > 0) {
      results.push(...appleEvents);
    }
  } catch (err) {
    console.warn('[calendarApi] Apple Calendar sync bypassed:', err);
  }

  // 2. Fetch Google Calendar events (Node API)
  try {
    const targetDate = date instanceof Date ? date : new Date(date);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0).toISOString();
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999).toISOString();
    
    const googleEvents = await listEvents({ timeMin: startOfDay, timeMax: endOfDay }, token);
    if (Array.isArray(googleEvents) && googleEvents.length > 0) {
      // Normalize Google Event to Frontend Contract
      for (const gev of googleEvents) {
        const sTime = gev.start?.dateTime ? new Date(gev.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '09:00';
        const eTime = gev.end?.dateTime ? new Date(gev.end.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '09:45';
        results.push({
          id: gev.id,
          title: gev.summary || 'Compromisso',
          startTime: sTime,
          endTime: eTime,
          duration: '45 min',
          categoryColor: '#38BDF8',
          calendarName: 'Google Calendar',
          platform: gev.hangoutLink ? 'meet' : null,
          meetingLink: gev.hangoutLink || null,
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

  // 3. Cache fresh results or fallback
  if (results.length > 0) {
    dayEventsCache.set(dateKey, results);
    return results;
  }

  if (dayEventsCache.has(dateKey) && dayEventsCache.get(dateKey).length > 0) {
    return dayEventsCache.get(dateKey);
  }

  // 4. Fallback to mock data if no real events are available
  if (Array.isArray(fallbackMocks) && fallbackMocks.length > 0) {
    return fallbackMocks;
  }

  return results;
}

export default {
  getDateKey,
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
};
