import { jest } from '@jest/globals';

const mockUpsert = jest.fn();
jest.unstable_mockModule('../models/TriageModel.js', () => ({
    upsertTriagedMessage: mockUpsert
}));

const mockSendCommand = jest.fn();
const mockDel = jest.fn();
const mockPublish = jest.fn();

jest.unstable_mockModule('../config/redis.js', () => ({
    default: {
        sendCommand: mockSendCommand,
        del: mockDel,
        publish: mockPublish
    }
}));

const { default: triageService } = await import('./TriageService.js');

describe('TriageService Unit Tests', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('classifyEmail', () => {
        it('should classify critical blocker / urgent emails as HIGH', () => {
            const result = triageService.classifyEmail({
                subject: 'URGENTE: Incidente em produção no Gateway',
                snippet: 'Estamos com bloqueador crítico afetando pagamentos.',
                from: 'cto@empresa.com'
            });

            expect(result.urgency).toBe('HIGH');
            expect(result.requiresAction).toBe(true);
        });

        it('should detect pending approvals and classify as HIGH', () => {
            const result = triageService.classifyEmail({
                subject: 'Contrato de Parceria',
                snippet: 'Olá Pedro, aguardo aprovação da minuta para prosseguirmos.',
                from: 'juridico@empresa.com'
            });

            expect(result.urgency).toBe('HIGH');
            expect(result.isApprovalPending).toBe(true);
            expect(result.requiresAction).toBe(true);
        });

        it('should classify newsletters and automated alerts as LOW', () => {
            const result = triageService.classifyEmail({
                subject: 'Weekly Tech Digest #142',
                snippet: 'Click here to unsubscribe from this newsletter.',
                from: 'newsletter@medium.com'
            });

            expect(result.urgency).toBe('LOW');
            expect(result.isApprovalPending).toBe(false);
        });

        it('should classify regular messages as MEDIUM', () => {
            const result = triageService.classifyEmail({
                subject: 'Ideias para o design system',
                snippet: 'Segue o link do Figma com as telas atualizadas.',
                from: 'designer@empresa.com'
            });

            expect(result.urgency).toBe('MEDIUM');
        });
    });

    describe('processAndTriage and Cache Debouncing', () => {
        it('should upsert message, publish to websocket and debounced invalidate cache for HIGH urgency', async () => {
            mockUpsert.mockResolvedValue({ id: 'msg-1', urgency: 'HIGH' });
            // Simulate lock acquired (returns 'OK' or 1)
            mockSendCommand.mockResolvedValue('OK');

            await triageService.processAndTriage({
                messageId: 'msg-1',
                threadId: 'th-1',
                from: 'boss@empresa.com',
                recipient: 'pedro@cortex.dev',
                subject: 'URGENTE: Assinar documento hoje',
                snippet: 'Favor aprovar',
                userId: 'user-123'
            });

            expect(mockUpsert).toHaveBeenCalledTimes(1);
            // Verify lock was checked with NX
            expect(mockSendCommand).toHaveBeenCalledWith([
                'SET',
                'lock:briefing_invalidation:user-123',
                '1',
                'EX',
                '5',
                'NX'
            ]);
            expect(mockDel).toHaveBeenCalledTimes(1);
            expect(mockPublish).toHaveBeenCalledTimes(1);
        });

        it('should NOT delete cache if debounce lock was NOT acquired (preventing cache thrashing)', async () => {
            mockUpsert.mockResolvedValue({ id: 'msg-2', urgency: 'HIGH' });
            // Simulate lock not acquired (null)
            mockSendCommand.mockResolvedValue(null);

            await triageService.processAndTriage({
                messageId: 'msg-2',
                threadId: 'th-2',
                from: 'boss@empresa.com',
                recipient: 'pedro@cortex.dev',
                subject: 'URGENTE: Segundo email em 100ms',
                snippet: 'Favor aprovar',
                userId: 'user-123'
            });

            expect(mockDel).not.toHaveBeenCalled();
        });
    });
});
