import { jest } from '@jest/globals';

const mockGetOAuth2Client = jest.fn().mockReturnValue({});
jest.unstable_mockModule('./CalendarService.js', () => ({
    default: {
        getOAuth2Client: mockGetOAuth2Client
    }
}));

const mockGenerateDraftReplies = jest.fn();
jest.unstable_mockModule('./LLMService.js', () => ({
    default: {
        generateDraftReplies: mockGenerateDraftReplies
    }
}));

const mockThreadsGet = jest.fn();
const mockDraftsCreate = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
    google: {
        gmail: jest.fn().mockReturnValue({
            users: {
                threads: { get: mockThreadsGet },
                drafts: { create: mockDraftsCreate }
            }
        })
    }
}));

const { default: draftReplyService } = await import('./DraftReplyService.js');

describe('DraftReplyService Unit Tests', () => {
    const mockUser = {
        id: 'user-draft-1',
        name: 'Pedro Ramos',
        email: 'pedro@cortex.dev',
        google_access_token: 'valid_access_token'
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should generate 3 reply options and inject draft into Gmail when createInGmail is true', async () => {
        mockThreadsGet.mockResolvedValue({
            data: {
                messages: [
                    {
                        payload: {
                            headers: [
                                { name: 'Subject', value: 'Reunião de Alinhamento' },
                                { name: 'From', value: 'cliente@empresa.com' },
                                { name: 'Message-ID', value: '<msg-123@empresa.com>' }
                            ]
                        },
                        snippet: 'Podemos nos reunir amanhã às 15h?'
                    }
                ]
            }
        });

        mockGenerateDraftReplies.mockResolvedValue({
            options: [
                { intent: 'confirm', label: 'Confirmar Reunião', subject: 'Re: Reunião de Alinhamento', body: 'Confirmado!' },
                { intent: 'reschedule', label: 'Reagendar', subject: 'Re: Reunião de Alinhamento', body: 'Pode ser sexta?' },
                { intent: 'clarify', label: 'Pedir Pauta', subject: 'Re: Reunião de Alinhamento', body: 'Qual a pauta?' }
            ]
        });

        mockDraftsCreate.mockResolvedValue({
            data: { id: 'draft-google-999' }
        });

        const result = await draftReplyService.generateDraftReplies(mockUser, {
            threadId: 'th-abc-123',
            customInstruction: 'Seja direto',
            createInGmail: true
        });

        expect(mockThreadsGet).toHaveBeenCalledWith({
            userId: 'me',
            id: 'th-abc-123',
            format: 'full'
        });

        expect(mockGenerateDraftReplies).toHaveBeenCalledWith({
            threadContext: expect.stringContaining('Reunião de Alinhamento'),
            customInstruction: 'Seja direto',
            userName: 'Pedro Ramos'
        });

        expect(mockDraftsCreate).toHaveBeenCalledTimes(1);
        expect(mockDraftsCreate).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'me',
            requestBody: expect.objectContaining({
                message: expect.objectContaining({
                    threadId: 'th-abc-123',
                    raw: expect.any(String)
                })
            })
        }));

        expect(result.createdDraftId).toBe('draft-google-999');
        expect(result.options).toHaveLength(3);
    });

    it('should NOT create draft in Gmail if createInGmail is false', async () => {
        mockThreadsGet.mockResolvedValue({
            data: {
                messages: [
                    {
                        payload: {
                            headers: [{ name: 'Subject', value: 'Dúvida rápida' }]
                        },
                        snippet: 'Você viu a mensagem?'
                    }
                ]
            }
        });

        mockGenerateDraftReplies.mockResolvedValue({
            options: [
                { intent: 'confirm', label: 'Ok', subject: 'Re: Dúvida', body: 'Vi sim!' },
                { intent: 'reschedule', label: 'Mais tarde', subject: 'Re: Dúvida', body: 'Respondo mais tarde.' },
                { intent: 'clarify', label: 'Detalhes', subject: 'Re: Dúvida', body: 'Qual mensagem?' }
            ]
        });

        const result = await draftReplyService.generateDraftReplies(mockUser, {
            threadId: 'th-xyz',
            createInGmail: false
        });

        expect(mockDraftsCreate).not.toHaveBeenCalled();
        expect(result.createdDraftId).toBeNull();
        expect(result.options).toHaveLength(3);
    });

    it('should throw 400 if user has no Google tokens', async () => {
        const unlinkedUser = { id: 'user-no-tokens', email: 'no_tokens@cortex.dev' };

        await expect(draftReplyService.generateDraftReplies(unlinkedUser, { threadId: 'th-1' }))
            .rejects
            .toMatchObject({
                statusCode: 400,
                message: expect.stringContaining('Google account not connected')
            });
    });
});
