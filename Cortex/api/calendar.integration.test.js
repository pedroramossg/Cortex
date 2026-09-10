import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Setup ESM module mocks
const mockUserWithTokens = {
    id: 'user-calendar-1',
    name: 'Tech Lead',
    email: 'techlead@cortex.dev',
    google_access_token: 'valid_access_token',
    google_refresh_token: 'valid_refresh_token'
};

const mockUserNoTokens = {
    id: 'user-calendar-2',
    name: 'No Tokens User',
    email: 'notokens@cortex.dev',
    google_access_token: null,
    google_refresh_token: null
};

jest.unstable_mockModule('./models/Auth.js', () => ({
    findById: jest.fn().mockImplementation(async (id) => {
        if (id === 'user-calendar-1') return mockUserWithTokens;
        if (id === 'user-calendar-2') return mockUserNoTokens;
        return null;
    }),
    updateGoogleTokens: jest.fn()
}));

jest.unstable_mockModule('./config/redis.js', () => ({
    default: {
        sendCommand: jest.fn(),
        setEx: jest.fn(),
        get: jest.fn().mockResolvedValue(null), // no blocklist
        del: jest.fn(),
        publish: jest.fn()
    }
}));

const mockInsert = jest.fn();
const mockList = jest.fn();

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
                list: mockList
            }
        })
    }
}));

const { default: app } = await import('./server.js');
const mockRedis = (await import('./config/redis.js')).default;

describe('Calendar Integration Tests', () => {
    let validToken;
    let noTokensUserToken;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_jwt_secret_min_32_characters';
        validToken = jwt.sign({ id: 'user-calendar-1', email: 'techlead@cortex.dev' }, process.env.JWT_SECRET);
        noTokensUserToken = jwt.sign({ id: 'user-calendar-2', email: 'notokens@cortex.dev' }, process.env.JWT_SECRET);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /calendar/events', () => {
        const validPayload = {
            title: 'Q3 Product Strategy',
            description: 'Aligning Cortex roadmaps and Apple Calendar sync',
            location: 'Cupertino / Google Meet',
            start: '2026-09-09T14:00:00.000Z',
            end: '2026-09-09T15:00:00.000Z',
            timeZone: 'America/Sao_Paulo',
            allDay: false,
            attendees: ['team@cortex.dev']
        };

        it('should return 401 if no Authorization header is provided', async () => {
            const res = await request(app)
                .post('/calendar/events')
                .send(validPayload);

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Authentication required');
        });

        it('should return 400 when end time <= start time (Zod .refine)', async () => {
            const res = await request(app)
                .post('/calendar/events')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    ...validPayload,
                    start: '2026-09-09T16:00:00.000Z',
                    end: '2026-09-09T15:00:00.000Z'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toBe('End time must be after start time');
        });

        it('should return 400 if extra properties are injected (Parameter Pollution)', async () => {
            const res = await request(app)
                .post('/calendar/events')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    ...validPayload,
                    maliciousAdminOverride: true
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
        });

        it('should return 400 if user has not connected Google Calendar', async () => {
            const res = await request(app)
                .post('/calendar/events')
                .set('Authorization', `Bearer ${noTokensUserToken}`)
                .send(validPayload);

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Google Calendar not connected');
        });

        it('should return 201 and created event with iCal string when successful', async () => {
            mockInsert.mockResolvedValue({
                data: {
                    id: 'gcal-evt-999',
                    summary: 'Q3 Product Strategy',
                    htmlLink: 'https://calendar.google.com/event?id=999'
                }
            });

            const res = await request(app)
                .post('/calendar/events')
                .set('Authorization', `Bearer ${validToken}`)
                .send(validPayload);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id).toBe('gcal-evt-999');
            expect(res.body.data.ics).toContain('BEGIN:VCALENDAR');
            expect(res.body.data.ics).toContain('SUMMARY:Q3 Product Strategy');
        });
    });

    describe('GET /calendar/today', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app).get('/calendar/today');
            expect(res.status).toBe(401);
        });

        it('should return 200 with today events list', async () => {
            mockList.mockResolvedValue({
                data: {
                    items: [
                        { id: 'today-1', summary: 'Daily Standup' },
                        { id: 'today-2', summary: 'Architecture Sync' }
                    ]
                }
            });

            const res = await request(app)
                .get('/calendar/today')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });
    });

    describe('GET /calendar/events', () => {
        it('should return 200 with list of events', async () => {
            mockList.mockResolvedValue({
                data: {
                    items: [{ id: 'ev-1', summary: 'Sprint Review' }]
                }
            });

            const res = await request(app)
                .get('/calendar/events')
                .query({ timeMin: '2026-09-09T00:00:00.000Z' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
        });
    });
});
