import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { sharedAuthMock, sharedRedisMock, resetTestMocks } from './testUtils/setupMocks.js';

// Setup ESM module mocks for Database & Redis
jest.unstable_mockModule('./models/Auth.js', () => sharedAuthMock);
jest.unstable_mockModule('./config/redis.js', () => ({
    default: sharedRedisMock
}));

const mockInsert = jest.fn();
const mockList = jest.fn();
const mockDelete = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
    google: {
        auth: {
            OAuth2: jest.fn().mockImplementation(() => ({
                setCredentials: jest.fn(),
                on: jest.fn()
            }))
        },
        calendar: jest.fn().mockReturnValue({
            events: {
                insert: mockInsert,
                list: mockList,
                delete: mockDelete
            }
        })
    }
}));

const { default: app } = await import('./server.js');
const { 
    getAppleCalendars, 
    createAppleCalendarEvent, 
    deleteAppleCalendarEvent, 
    loadDayEvents,
    getCachedDayEvents,
    setCachedDayEvents,
    clearCalendarCache,
    getDateKey,
    getLocalDateKey,
    parseLocalDate,
    formatTimeHHMM
} = await import('../src/services/calendarApi.js');

describe('Calendar Real Integration & Audit Sync (Frontend <-> Backend API)', () => {
    let validToken;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_jwt_secret_min_32_characters';
        validToken = jwt.sign(
            { id: 'user-calendar-1', email: 'techlead@cortex.dev' },
            process.env.JWT_SECRET
        );
    });

    afterEach(() => {
        resetTestMocks();
        jest.clearAllMocks();
    });

    describe('API Backend Routes: POST, GET, DELETE /calendar/events', () => {
        const samplePayload = {
            title: 'Q4 Product Roadmap Sync',
            description: 'Aligning Cortex features',
            location: 'Google Meet',
            start: '2026-09-18T14:00:00.000Z',
            end: '2026-09-18T14:45:00.000Z',
            timeZone: 'America/Sao_Paulo',
            allDay: false,
            attendees: ['pedro@cortex.dev']
        };

        it('POST /calendar/events should create an event and return 201 with data and ics', async () => {
            mockInsert.mockResolvedValue({
                data: {
                    id: 'gcal-evt-101',
                    summary: samplePayload.title,
                    description: samplePayload.description,
                    htmlLink: 'https://calendar.google.com/event?eid=101'
                }
            });

            const res = await request(app)
                .post('/calendar/events')
                .set('Authorization', `Bearer ${validToken}`)
                .send(samplePayload);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id).toBe('gcal-evt-101');
            expect(res.body.data.summary).toBe(samplePayload.title);
            expect(typeof res.body.data.ics).toBe('string');
            expect(mockInsert).toHaveBeenCalledTimes(1);
        });

        it('GET /calendar/today should fetch today events and return 200', async () => {
            mockList.mockResolvedValue({
                data: {
                    items: [
                        {
                            id: 'gcal-today-1',
                            summary: 'Architecture Review',
                            start: { dateTime: '2026-09-18T10:00:00Z' },
                            end: { dateTime: '2026-09-18T11:00:00Z' }
                        }
                    ]
                }
            });

            const res = await request(app)
                .get('/calendar/today')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data[0].id).toBe('gcal-today-1');
            expect(mockList).toHaveBeenCalledTimes(1);
        });

        it('GET /calendar/events should accept query parameters for time boundaries', async () => {
            mockList.mockResolvedValue({
                data: { items: [] }
            });

            const res = await request(app)
                .get('/calendar/events?timeMin=2026-09-18T00:00:00Z&timeMax=2026-09-18T23:59:59Z')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
                timeMin: '2026-09-18T00:00:00Z',
                timeMax: '2026-09-18T23:59:59Z'
            }));
        });

        it('DELETE /calendar/events/:id should delete the event and return 200', async () => {
            mockDelete.mockResolvedValue({});

            const res = await request(app)
                .delete('/calendar/events/gcal-evt-101')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Calendar event deleted successfully');
            expect(mockDelete).toHaveBeenCalledWith({
                calendarId: 'primary',
                eventId: 'gcal-evt-101'
            });
        });

        it('DELETE /calendar/events/:id should return 401 without authentication', async () => {
            const res = await request(app).delete('/calendar/events/gcal-evt-101');
            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Authentication required');
        });
    });

    describe('calendarApi: Frontend Service & Native Bridges', () => {
        it('getAppleCalendars should return real or fallback calendars with valid colorHex and isWritable flag', async () => {
            const calendars = await getAppleCalendars();
            expect(Array.isArray(calendars)).toBe(true);
            expect(calendars.length).toBeGreaterThanOrEqual(1);

            for (const cal of calendars) {
                expect(cal).toHaveProperty('id');
                expect(cal).toHaveProperty('title');
                expect(cal).toHaveProperty('colorHex');
                expect(cal.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
                expect(typeof cal.isWritable).toBe('boolean');
            }
        });

        it('createAppleCalendarEvent and deleteAppleCalendarEvent should execute without throwing', async () => {
            const newId = await createAppleCalendarEvent({
                calendarName: 'Home',
                title: 'Local Sync Verification',
                startTime: '16:00',
                endTime: '16:45',
                date: '2026-09-18'
            });

            expect(typeof newId).toBe('string');
            expect(newId.length).toBeGreaterThan(0);

            const deleted = await deleteAppleCalendarEvent(newId);
            expect(typeof deleted).toBe('boolean');
        });

        it('loadDayEvents should normalize events into the timeline schema and preserve fallback mocks', async () => {
            const fallbackMocks = [
                {
                    id: 'mock-evt-1',
                    title: 'Fallback Test Event',
                    startTime: '08:00',
                    endTime: '08:30',
                    duration: '30 min',
                    categoryColor: '#10B981',
                    attendees: []
                }
            ];

            const events = await loadDayEvents(new Date('2026-09-18'), fallbackMocks, validToken);
            expect(Array.isArray(events)).toBe(true);
            expect(events.length).toBeGreaterThanOrEqual(1);

            const first = events[0];
            expect(first).toHaveProperty('id');
            expect(first).toHaveProperty('title');
            expect(first).toHaveProperty('startTime');
            expect(first).toHaveProperty('categoryColor');
        });
    });

    describe('SWR In-Memory Cache & Optimistic Mutation Suite', () => {
        const testDate = '2026-09-18';

        beforeEach(() => {
            clearCalendarCache();
        });

        it('should return null when cache is empty and allow manual population', () => {
            expect(getCachedDayEvents(testDate)).toBeNull();

            const sample = [{ id: 'opt-1', title: 'Cached Meeting', startTime: '10:00' }];
            setCachedDayEvents(testDate, sample);

            const cached = getCachedDayEvents(testDate);
            expect(cached).toHaveLength(1);
            expect(cached[0].title).toBe('Cached Meeting');
        });

        it('createAppleCalendarEvent should optimistically insert into dayEventsCache immediately', async () => {
            const eventPayload = {
                calendarName: 'Trabalho',
                title: 'Instant Optimistic Standup',
                startTime: '09:30',
                endTime: '10:00',
                date: testDate,
            };

            const createdId = await createAppleCalendarEvent(eventPayload);
            const cachedEvents = getCachedDayEvents(testDate);

            expect(Array.isArray(cachedEvents)).toBe(true);
            expect(cachedEvents.length).toBe(1);
            expect(cachedEvents[0].title).toBe('Instant Optimistic Standup');
            expect(cachedEvents[0].calendarName).toBe('Trabalho');
            expect(cachedEvents[0].id).toBe(createdId);
        });

        it('deleteAppleCalendarEvent should optimistically evict event from dayEventsCache immediately', async () => {
            const eventPayload = {
                calendarName: 'Trabalho',
                title: 'Event To Delete',
                startTime: '11:00',
                endTime: '11:30',
                date: testDate,
            };

            const createdId = await createAppleCalendarEvent(eventPayload);
            expect(getCachedDayEvents(testDate)).toHaveLength(1);

            await deleteAppleCalendarEvent(createdId);
            const afterDeletion = getCachedDayEvents(testDate);
            expect(afterDeletion).toHaveLength(0);
        });
    });

    describe('Local Date Precision & Brasilia (UTC-3) Timezone Suite', () => {
        it('getLocalDateKey should strictly format dates in local timezone without UTC shifting', () => {
            // Test specific local Date: September 18, 2026 at 23:30 (11:30 PM)
            const lateNightDate = new Date(2026, 8, 18, 23, 30, 0); // Month 8 is September
            expect(getLocalDateKey(lateNightDate)).toBe('2026-09-18');

            // Test early morning local Date: September 18, 2026 at 00:15 (12:15 AM)
            const earlyMorningDate = new Date(2026, 8, 18, 0, 15, 0);
            expect(getLocalDateKey(earlyMorningDate)).toBe('2026-09-18');

            // Test string preservation
            expect(getLocalDateKey('2026-09-18')).toBe('2026-09-18');
            expect(getLocalDateKey('2026-09-19')).toBe('2026-09-19');
        });

        it('parseLocalDate should safely create Date anchored at midday local time', () => {
            const parsed = parseLocalDate('2026-09-18');
            expect(parsed.getFullYear()).toBe(2026);
            expect(parsed.getMonth()).toBe(8); // September
            expect(parsed.getDate()).toBe(18);
            expect(parsed.getHours()).toBe(12);
        });

        it('loadDayEvents should normalize all events to possess consistent date and dateObj', async () => {
            const mockEvents = [
                { id: 'evt-norm-1', title: 'Local Timezone Meeting', startTime: '10:00' }
            ];
            const loaded = await loadDayEvents('2026-09-18', mockEvents);
            expect(loaded).toHaveLength(1);
            expect(loaded[0].date).toBe('2026-09-18');
            expect(loaded[0].dateObj).toBeInstanceOf(Date);
            expect(loaded[0].dateObj.getDate()).toBe(18);
        });
    });

    describe('Apple Calendar Robust Time & Category Color Normalization Suite', () => {
        it('formatTimeHHMM should strictly format times with 2-digit zero-padding', () => {
            expect(formatTimeHHMM('9:5')).toBe('09:05');
            expect(formatTimeHHMM('9:00')).toBe('09:00');
            expect(formatTimeHHMM('09:00')).toBe('09:00');
            expect(formatTimeHHMM('14:30')).toBe('14:30');
            expect(formatTimeHHMM('0:0')).toBe('00:00');
            expect(formatTimeHHMM('')).toBe('09:00');
            expect(formatTimeHHMM(null)).toBe('09:00');
        });

        it('loadDayEvents should preserve real categoryColor and normalize HH:MM times from Apple Calendar', async () => {
            const appleMocks = [
                {
                    id: 'apple-real-1',
                    title: 'Executive Board Sync',
                    startTime: '9:5',
                    endTime: '10:0',
                    duration: '55 min',
                    calendarName: 'Trabalho',
                    categoryColor: '#E700F9',
                    date: '2026-09-18',
                }
            ];

            const loaded = await loadDayEvents('2026-09-18', appleMocks);
            expect(loaded).toHaveLength(1);
            expect(loaded[0].startTime).toBe('09:05');
            expect(loaded[0].endTime).toBe('10:00');
            expect(loaded[0].categoryColor).toBe('#E700F9');
            expect(loaded[0].calendarName).toBe('Trabalho');
        });

        it('loadDayEvents should NOT cache empty array [] when Tauri IPC query fails', async () => {
            clearCalendarCache();
            const date = '2026-09-25';

            // Simulate Tauri environment where invoke throws an error
            global.window = {
                __TAURI_INTERNALS__: {}
            };

            // In our implementation, invokeTauri will try to import @tauri-apps/api/core,
            // which fails in node environment and triggers IPC error/catch.
            // Following standard Promise conventions, loadDayEvents rejects, protecting React state.
            await expect(loadDayEvents(date)).rejects.toThrow();

            // SWR cache must NOT contain empty array for that date
            expect(getCachedDayEvents(date)).toBeNull();

            // Cleanup
            delete global.window;
        });

        it('loadDayEvents should deduplicate concurrent in-flight requests for the same date', async () => {
            clearCalendarCache();
            const date = '2026-09-28';
            const mockEvents = [
                { id: 'concurrent-1', title: 'Concurrent Test', startTime: '10:00', endTime: '11:00' }
            ];

            // Launch two calls simultaneously
            const p1 = loadDayEvents(date, mockEvents);
            const p2 = loadDayEvents(date, mockEvents);

            // Both promises should resolve to the exact same reference from inFlightRequests
            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1).toBe(r2);
            expect(r1).toHaveLength(1);
            expect(r1[0].title).toBe('Concurrent Test');
        });
    });
});


