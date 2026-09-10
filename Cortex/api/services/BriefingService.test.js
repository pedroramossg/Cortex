import { jest } from '@jest/globals';

const mockGetRecentUrgencies = jest.fn();
const mockGetPendingApprovals = jest.fn();
const mockSaveDailyBriefing = jest.fn();

jest.unstable_mockModule('../models/TriageModel.js', () => ({
    getRecentUrgencies: mockGetRecentUrgencies,
    getPendingApprovals: mockGetPendingApprovals,
    saveDailyBriefing: mockSaveDailyBriefing
}));

const mockGetTodayEvents = jest.fn();
jest.unstable_mockModule('./CalendarService.js', () => ({
    default: {
        getTodayEvents: mockGetTodayEvents
    }
}));

const mockGet = jest.fn();
const mockSetEx = jest.fn();

jest.unstable_mockModule('../config/redis.js', () => ({
    default: {
        get: mockGet,
        setEx: mockSetEx
    }
}));

const { default: briefingService } = await import('./BriefingService.js');

describe('BriefingService Unit Tests', () => {
    const mockUser = {
        id: 'user-briefing-1',
        name: 'Pedro Ramos',
        email: 'pedro@cortex.dev',
        google_access_token: 'token_123'
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return cached briefing from Redis if available', async () => {
        const cachedPayload = {
            date: '2026-09-10',
            greeting: 'Bom dia, Pedro',
            first_commitment: null,
            urgencies: [],
            pending_approvals: [],
            stats: { total_meetings: 0, urgent_count: 0 }
        };
        mockGet.mockResolvedValue(JSON.stringify(cachedPayload));

        const result = await briefingService.getTodayBriefing(mockUser);

        expect(result).toEqual(cachedPayload);
        expect(mockGetTodayEvents).not.toHaveBeenCalled();
    });

    it('should aggregate calendar events, urgencies, and approvals when cache is empty', async () => {
        mockGet.mockResolvedValue(null);

        const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
        const endTime = new Date(Date.now() + 120 * 60 * 1000).toISOString();

        mockGetTodayEvents.mockResolvedValue([
            {
                id: 'evt-2',
                summary: 'Alinhamento da Tarde',
                start: { dateTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() },
                end: { dateTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString() }
            },
            {
                id: 'evt-1',
                summary: 'Daily Standup com Time',
                start: { dateTime: futureTime },
                end: { dateTime: endTime },
                location: 'Google Meet'
            }
        ]);

        mockGetRecentUrgencies.mockResolvedValue([
            { id: 'u-1', subject: 'Incidente Crítico', urgency: 'HIGH' }
        ]);

        mockGetPendingApprovals.mockResolvedValue([
            { id: 'a-1', subject: 'Aprovação de Deploy', is_approval_pending: true }
        ]);

        const result = await briefingService.getTodayBriefing(mockUser, { forceRefresh: true });

        expect(result.first_commitment).toBeDefined();
        expect(result.first_commitment.id).toBe('evt-1');
        expect(result.first_commitment.title).toBe('Daily Standup com Time');
        expect(result.urgencies).toHaveLength(1);
        expect(result.pending_approvals).toHaveLength(1);
        expect(result.stats.total_meetings).toBe(2);
        expect(result.stats.urgent_count).toBe(1);
        expect(result.stats.pending_approvals_count).toBe(1);

        // Verify cached in Redis
        expect(mockSetEx).toHaveBeenCalledWith(
            expect.stringContaining('briefing:user-briefing-1:'),
            900,
            expect.any(String)
        );
        // Verify persisted to DB
        expect(mockSaveDailyBriefing).toHaveBeenCalledTimes(1);
    });
});
