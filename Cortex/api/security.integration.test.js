import { jest } from '@jest/globals';
import request from 'supertest';
import app from './server.js';
import * as User from './models/Auth.js';
import redisClient from './config/redis.js';
import jwt from 'jsonwebtoken';

jest.mock('./models/Auth.js');
// We need to mock redis publish, setEx, get, del
jest.mock('./config/redis.js', () => ({
    __esModule: true,
    default: {
        sendCommand: jest.fn(),
        setEx: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        publish: jest.fn()
    }
}));

// Mock google-auth-library
jest.mock('google-auth-library', () => {
    return {
        OAuth2Client: jest.fn().mockImplementation(() => {
            return {
                verifyIdToken: jest.fn().mockImplementation(async ({ idToken }) => {
                    if (idToken === 'valid_google_token') {
                        return {
                            getPayload: () => ({ iss: 'https://accounts.google.com' })
                        };
                    }
                    throw new Error("Invalid token");
                })
            };
        })
    };
});

// Mock queue
jest.mock('./jobs/queue.js', () => ({
    addGmailWebhookJob: jest.fn()
}));

const mockRedis = (await import('./config/redis.js')).default;
const { addGmailWebhookJob } = await import('./jobs/queue.js');

describe('Security & DevSecOps Integration Tests', () => {
    
    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Zero Trust: Zod Validation', () => {
        it('should return 400 when sending unmapped extra properties to /auth/login (Parameter Pollution)', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    admin: true // Unmapped property
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.errors[0].message).toContain("Unrecognized key(s) in object: 'admin'");
        });

        it('should return 400 when sending a password larger than 255 chars (DoS Protection)', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'a'.repeat(300)
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.errors[0].message).toContain("Password is too long");
        });
    });

    describe('Defense in Depth: AuthZ and Blocklist', () => {
        it('should block access to /auth/logout if JWT is in Redis blocklist', async () => {
            const token = jwt.sign({ id: 'user_1', email: 'test@example.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            
            // Mock Redis to return 'revoked' for this token
            mockRedis.get.mockResolvedValueOnce('revoked');

            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Token has been revoked');
        });

        it('should return 401 for /auth/logout if JWT is forged/invalid signature', async () => {
            const fakeToken = jwt.sign({ id: 'user_1' }, 'wrong_secret');
            
            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${fakeToken}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Invalid token');
        });
    });

    describe('Idempotency & Webhooks OIDC', () => {
        it('should return 401 Unauthorized for /webhooks/gmail without Google OIDC Token', async () => {
            const response = await request(app)
                .post('/webhooks/gmail')
                .send({
                    message: { data: 'base64data' }
                });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Missing Authorization header');
        });

        it('should return 401 for /webhooks/gmail with a forged OIDC Token', async () => {
            const response = await request(app)
                .post('/webhooks/gmail')
                .set('Authorization', 'Bearer fake_google_token')
                .send({
                    message: { data: 'base64data' }
                });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Invalid or expired OIDC token');
        });

        it('should process webhook if Google OIDC Token is valid', async () => {
            const response = await request(app)
                .post('/webhooks/gmail')
                .set('Authorization', 'Bearer valid_google_token')
                .send({
                    message: { data: 'base64data' },
                    subscription: 'sub'
                });

            expect(response.status).toBe(200);
            expect(addGmailWebhookJob).toHaveBeenCalledTimes(1);
        });

        it('should handle webhook concurrency (simulated rapid fire)', async () => {
            // Rapid fire 5 concurrent requests with the same valid token and payload
            const reqs = Array(5).fill().map(() => 
                request(app)
                    .post('/webhooks/gmail')
                    .set('Authorization', 'Bearer valid_google_token')
                    .send({
                        message: { data: 'base64data', messageId: '12345' },
                        subscription: 'sub'
                    })
            );

            const responses = await Promise.all(reqs);
            
            // All should return 200
            responses.forEach(r => expect(r.status).toBe(200));
            
            // In a real database we'd check for race conditions, 
            // but here we ensure BullMQ enqueue was called 5 times.
            // (BullMQ's jobId guarantees idempotency, which is handled at the queue layer).
            expect(addGmailWebhookJob).toHaveBeenCalledTimes(5);
        });
    });
});
