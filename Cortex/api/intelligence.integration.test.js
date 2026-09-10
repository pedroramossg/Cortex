import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockUser = {
    id: 'user-intel-1',
    name: 'Pedro Ramos',
    email: 'pedro@cortex.dev',
    google_access_token: 'valid_access_token',
    google_refresh_token: 'valid_refresh_token'
};

jest.unstable_mockModule('./models/Auth.js', () => ({
    findById: jest.fn().mockImplementation(async (id) => {
        if (id === 'user-intel-1') return mockUser;
        return null;
    }),
    updateGoogleTokens: jest.fn()
}));

jest.unstable_mockModule('./models/TriageModel.js', () => ({
    upsertTriagedMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    getRecentUrgencies: jest.fn().mockResolvedValue([
        { id: 'urg-1', subject: 'Servidor caiu', urgency: 'HIGH' }
    ]),
    getPendingApprovals: jest.fn().mockResolvedValue([
        { id: 'app-1', subject: 'Aprovação de verba', is_approval_pending: true }
    ]),
    getMessagesByContact: jest.fn().mockResolvedValue([]),
    saveDailyBriefing: jest.fn().mockResolvedValue({}),
    getDailyBriefing: jest.fn().mockResolvedValue(null)
}));

jest.unstable_mockModule('./config/redis.js', () => ({
    default: {
        sendCommand: jest.fn().mockResolvedValue('OK'),
        setEx: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
        publish: jest.fn().mockResolvedValue(1)
    }
}));

const mockCalendarList = jest.fn();
const mockGmailThreadsGet = jest.fn();
const mockGmailThreadsList = jest.fn();
const mockGmailDraftsCreate = jest.fn();

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
                list: mockCalendarList
            }
        }),
        gmail: jest.fn().mockReturnValue({
            users: {
                threads: {
                    get: mockGmailThreadsGet,
                    list: mockGmailThreadsList
                },
                drafts: {
                    create: mockGmailDraftsCreate
                }
            }
        })
    }
}));

const { default: app } = await import('./server.js');

describe('Cortex Intelligence Integration Tests', () => {
    let validToken;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_jwt_secret_min_32_characters';
        validToken = jwt.sign({ id: 'user-intel-1', email: 'pedro@cortex.dev' }, process.env.JWT_SECRET);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /briefing/today (Morning Briefing & Urgency Triage)', () => {
        it('should return 401 if unauthorized', async () => {
            const res = await request(app).get('/briefing/today');
            expect(res.status).toBe(401);
        });

        it('should return 400 when sending unrecognized query params (Parameter Pollution)', async () => {
            const res = await request(app)
                .get('/briefing/today')
                .query({ maliciousParam: 'hack' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
        });

        it('should return 200 with structured morning briefing', async () => {
            mockCalendarList.mockResolvedValue({
                data: {
                    items: [
                        {
                            id: 'cal-1',
                            summary: 'Reunião de Diretoria',
                            start: { dateTime: '2026-09-10T14:00:00Z' },
                            end: { dateTime: '2026-09-10T15:00:00Z' }
                        }
                    ]
                }
            });

            const res = await request(app)
                .get('/briefing/today')
                .query({ forceRefresh: 'true' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('first_commitment');
            expect(res.body.data.first_commitment.title).toBe('Reunião de Diretoria');
            expect(res.body.data).toHaveProperty('urgencies');
            expect(res.body.data).toHaveProperty('pending_approvals');
            expect(res.body.data).toHaveProperty('stats');
            expect(res.body.data.stats.total_meetings).toBe(1);
        });
    });

    describe('GET /contacts/context (Contact Dossier & Pre-Meeting Intelligence)', () => {
        it('should return 401 if unauthorized', async () => {
            const res = await request(app).get('/contacts/context?email=carlos@empresa.com');
            expect(res.status).toBe(401);
        });

        it('should return 400 if email is missing or invalid', async () => {
            const res = await request(app)
                .get('/contacts/context')
                .query({ email: 'not-an-email' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toContain('Invalid contact email format');
        });

        it('should return 400 if extra query parameters are injected', async () => {
            const res = await request(app)
                .get('/contacts/context')
                .query({ email: 'carlos@empresa.com', extraKey: 'exploit' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(400);
            expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
        });

        it('should return 200 with synthesized contact dossier', async () => {
            mockCalendarList.mockResolvedValue({
                data: {
                    items: [{ id: 'meet-1', summary: 'Alinhamento Q3', start: { dateTime: '2026-09-12T10:00:00Z' } }]
                }
            });

            mockGmailThreadsList.mockResolvedValue({
                data: { threads: [] }
            });

            const res = await request(app)
                .get('/contacts/context')
                .query({ email: 'carlos@empresa.com' })
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.contact.email).toBe('carlos@empresa.com');
            expect(res.body.data).toHaveProperty('relationship_summary');
            expect(res.body.data).toHaveProperty('talking_points');
        });
    });

    describe('POST /gmail/draft-reply (Smart Auto-Draft Replies)', () => {
        it('should return 401 if unauthorized', async () => {
            const res = await request(app)
                .post('/gmail/draft-reply')
                .send({ threadId: 'th-123' });

            expect(res.status).toBe(401);
        });

        it('should return 400 if threadId is missing', async () => {
            const res = await request(app)
                .post('/gmail/draft-reply')
                .set('Authorization', `Bearer ${validToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toMatch(/threadId is required|expected string/);
        });

        it('should return 400 on parameter pollution (.strict)', async () => {
            const res = await request(app)
                .post('/gmail/draft-reply')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    threadId: 'th-123',
                    adminInject: true
                });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
        });

        it('should return 200 with 3 reply intents and createdDraftId', async () => {
            mockGmailThreadsGet.mockResolvedValue({
                data: {
                    messages: [
                        {
                            payload: {
                                headers: [
                                    { name: 'Subject', value: 'Proposta Comercial' },
                                    { name: 'From', value: 'contato@cliente.com' },
                                    { name: 'Message-ID', value: '<msg-1@cliente.com>' }
                                ]
                            },
                            snippet: 'Gostaria de agendar para alinharmos os pontos.'
                        }
                    ]
                }
            });

            mockGmailDraftsCreate.mockResolvedValue({
                data: { id: 'draft-999-google' }
            });

            const res = await request(app)
                .post('/gmail/draft-reply')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    threadId: 'th-123',
                    customInstruction: 'Seja cordial',
                    createInGmail: true
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.threadId).toBe('th-123');
            expect(res.body.data.createdDraftId).toBe('draft-999-google');
            expect(res.body.data.options).toHaveLength(3);
            expect(res.body.data.options[0]).toHaveProperty('intent');
            expect(res.body.data.options[0]).toHaveProperty('body');
        });
    });
});
