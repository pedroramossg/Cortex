import { jest } from '@jest/globals';
import gmailService from './GmailService.js';
import * as User from '../models/Auth.js';
import { google } from 'googleapis';

// Mock dependencies
jest.mock('../models/Auth.js');
jest.mock('googleapis');
jest.mock('../config/redis.js', () => ({
    __esModule: true,
    default: {
        publish: jest.fn()
    }
}));

describe('GmailService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('processWebhookPayload should process new messages', async () => {
        // Mock User DB
        const mockUser = { id: 'uuid-1', google_access_token: 'access-1', google_refresh_token: 'refresh-1' };
        User.findByEmail.mockResolvedValue(mockUser);

        // Mock Gmail API
        const mockHistoryList = jest.fn().mockResolvedValue({
            data: {
                history: [
                    {
                        messagesAdded: [
                            { message: { id: 'msg-1' } }
                        ]
                    }
                ]
            }
        });

        const mockMessagesGet = jest.fn().mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'Subject', value: 'Test Subject' },
                        { name: 'From', value: 'test@example.com' }
                    ]
                },
                snippet: 'This is a test snippet'
            }
        });

        google.gmail.mockReturnValue({
            users: {
                history: { list: mockHistoryList },
                messages: { get: mockMessagesGet }
            }
        });

        const payload = {
            message: {
                data: Buffer.from(JSON.stringify({ emailAddress: 'test@example.com', historyId: '12345' })).toString('base64')
            }
        };

        await gmailService.processWebhookPayload(payload);

        // Assertions
        expect(User.findByEmail).toHaveBeenCalledWith({ email: 'test@example.com' });
        expect(mockHistoryList).toHaveBeenCalledWith({
            userId: 'me',
            startHistoryId: '12345',
            historyTypes: ['messageAdded']
        });
        expect(mockMessagesGet).toHaveBeenCalledWith({
            userId: 'me',
            id: 'msg-1',
            format: 'full'
        });
    });

    test('processWebhookPayload should throw if user is not found', async () => {
        User.findByEmail.mockResolvedValue(null);

        const payload = {
            message: {
                data: Buffer.from(JSON.stringify({ emailAddress: 'notfound@example.com', historyId: '123' })).toString('base64')
            }
        };

        await expect(gmailService.processWebhookPayload(payload))
            .rejects
            .toThrow('User notfound@example.com not found or has no Google tokens');
    });
});
