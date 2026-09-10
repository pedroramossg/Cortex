import { jest } from '@jest/globals';

const mockGetOAuth2Client = jest.fn().mockReturnValue({});
jest.unstable_mockModule('./CalendarService.js', () => ({
    default: {
        getOAuth2Client: mockGetOAuth2Client
    }
}));

const mockGenerateContactDossier = jest.fn();
jest.unstable_mockModule('./LLMService.js', () => ({
    default: {
        generateContactDossier: mockGenerateContactDossier
    }
}));

const mockGetMessagesByContact = jest.fn();
jest.unstable_mockModule('../models/TriageModel.js', () => ({
    getMessagesByContact: mockGetMessagesByContact
}));

const mockGet = jest.fn();
const mockSetEx = jest.fn();
jest.unstable_mockModule('../config/redis.js', () => ({
    default: {
        get: mockGet,
        setEx: mockSetEx
    }
}));

const mockCalList = jest.fn();
const mockGmailThreadsList = jest.fn();
const mockGmailThreadsGet = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
    google: {
        calendar: jest.fn().mockReturnValue({
            events: { list: mockCalList }
        }),
        gmail: jest.fn().mockReturnValue({
            users: {
                threads: {
                    list: mockGmailThreadsList,
                    get: mockGmailThreadsGet
                }
            }
        })
    }
}));

const { default: contactDossierService } = await import('./ContactDossierService.js');

describe('ContactDossierService Unit Tests', () => {
    const mockUser = {
        id: 'user-contact-1',
        name: 'Pedro Ramos',
        email: 'pedro@cortex.dev'
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return cached dossier from Redis if present', async () => {
        const cachedDossier = {
            contact: { email: 'carlos@empresa.com' },
            relationship_summary: 'Sócio e investidor.',
            open_action_items: []
        };
        mockGet.mockResolvedValue(JSON.stringify(cachedDossier));

        const result = await contactDossierService.getContactDossier(mockUser, 'carlos@empresa.com');

        expect(result).toEqual(cachedDossier);
        expect(mockGenerateContactDossier).not.toHaveBeenCalled();
    });

    it('should cross-reference calendar, gmail and LLM to synthesize fresh dossier', async () => {
        mockGet.mockResolvedValue(null);

        mockCalList.mockResolvedValue({
            data: {
                items: [
                    { id: 'meet-1', summary: 'Alinhamento Q4', start: { dateTime: '2026-09-12T14:00:00Z' } }
                ]
            }
        });

        mockGmailThreadsList.mockResolvedValue({
            data: {
                threads: [{ id: 'th-1' }]
            }
        });

        mockGmailThreadsGet.mockResolvedValue({
            data: {
                messages: [
                    {
                        payload: {
                            headers: [
                                { name: 'Subject', value: 'Proposta Comercial' },
                                { name: 'Date', value: 'Wed, 09 Sep 2026 10:00:00 GMT' }
                            ]
                        },
                        snippet: 'Segue a proposta conforme conversamos.'
                    }
                ]
            }
        });

        mockGenerateContactDossier.mockResolvedValue({
            relationship_summary: 'Cliente prioritário em fase de contratação.',
            last_interaction_summary: 'Envio de proposta comercial.',
            open_action_items: ['Validar escopo técnico'],
            talking_points: ['Discussão dos valores de implementação']
        });

        const result = await contactDossierService.getContactDossier(mockUser, 'carlos@empresa.com');

        expect(result.contact.email).toBe('carlos@empresa.com');
        expect(result.upcoming_meetings).toHaveLength(1);
        expect(result.recent_threads).toHaveLength(1);
        expect(result.relationship_summary).toBe('Cliente prioritário em fase de contratação.');
        expect(result.talking_points).toHaveLength(1);

        // Verify cached in Redis
        expect(mockSetEx).toHaveBeenCalledWith(
            'contact_dossier:user-contact-1:carlos@empresa.com',
            600,
            expect.any(String)
        );
    });
});
