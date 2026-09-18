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
    getDateKey
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
});

