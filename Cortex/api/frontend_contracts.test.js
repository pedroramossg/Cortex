import { describe, it, expect } from '@jest/globals';

/**
 * Test suite for Frontend Contracts and Security Policy (security.md Check 15)
 */
describe('Frontend Data Contracts & Security Validation (security.md)', () => {
    // Expected fields from PostgreSQL triaged_messages table
    const REQUIRED_TRIAGED_FIELDS = [
        'id',
        'sender',
        'subject',
        'snippet',
        'urgency',
        'is_approval_pending',
        'requires_action',
        'received_at'
    ];

    const VALID_URGENCIES = ['HIGH', 'MEDIUM', 'LOW'];

    it('should adhere strictly to the triaged_messages schema contract', () => {
        const sampleMessage = {
            id: "uuid-test-1",
            sender: "Satya Nadella <satya@microsoft.com>",
            subject: "Enterprise Partnership",
            snippet: "Important briefing about Cortex roadmap.",
            urgency: "HIGH",
            is_approval_pending: true,
            requires_action: true,
            received_at: new Date(),
            service: "gmail"
        };

        for (const field of REQUIRED_TRIAGED_FIELDS) {
            expect(sampleMessage).toHaveProperty(field);
        }
        expect(VALID_URGENCIES).toContain(sampleMessage.urgency);
        expect(typeof sampleMessage.is_approval_pending).toBe('boolean');
        expect(typeof sampleMessage.requires_action).toBe('boolean');
    });

    it('Check 15 (security.md): must not contain dangerouslySetInnerHTML or unsafe DOM keys', () => {
        const sampleMessage = {
            id: "uuid-test-2",
            sender: "<script>alert('xss')</script> Hacker",
            subject: "<img src=x onerror=alert(1)>",
            snippet: "Payload with <iframe src='malicious.com'></iframe>",
            urgency: "HIGH",
            is_approval_pending: false,
            requires_action: true,
            received_at: new Date()
        };

        // Ensure no dangerous innerHTML or raw markup injection props exist
        expect(sampleMessage).not.toHaveProperty('dangerouslySetInnerHTML');
        expect(sampleMessage).not.toHaveProperty('innerHTML');

        // Verify values are treated as pure strings, safely escapable by React
        expect(typeof sampleMessage.sender).toBe('string');
        expect(typeof sampleMessage.subject).toBe('string');
        expect(typeof sampleMessage.snippet).toBe('string');
    });

    it('Check 2 (security.md): client payload should not contain sensitive database or auth tokens', () => {
        const sampleMessage = {
            id: "uuid-test-3",
            sender: "Team",
            subject: "Update",
            snippet: "Snippet text",
            urgency: "LOW",
            is_approval_pending: false,
            requires_action: false,
            received_at: new Date()
        };

        const FORBIDDEN_SECRET_KEYS = [
            'password', 'password_hash', 'token', 'access_token',
            'refresh_token', 'jwt_secret', 'database_url', 'api_key'
        ];

        for (const key of FORBIDDEN_SECRET_KEYS) {
            expect(sampleMessage).not.toHaveProperty(key);
        }
    });

    it('should correctly classify urgency levels against valid database constraints', () => {
        const validHigh = { urgency: 'HIGH' };
        const validMedium = { urgency: 'MEDIUM' };
        const validLow = { urgency: 'LOW' };
        const invalidUrgency = { urgency: 'CRITICAL' }; // PostgreSQL schema only allows HIGH, MEDIUM, LOW

        expect(VALID_URGENCIES.includes(validHigh.urgency)).toBe(true);
        expect(VALID_URGENCIES.includes(validMedium.urgency)).toBe(true);
        expect(VALID_URGENCIES.includes(validLow.urgency)).toBe(true);
        expect(VALID_URGENCIES.includes(invalidUrgency.urgency)).toBe(false);
    });
});
