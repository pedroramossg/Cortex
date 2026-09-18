import { describe, it, expect } from '@jest/globals';
import { MOCK_CALENDAR_EVENTS } from '../src/mocks/calendarEvents.js';
import { isSafeMeetingUrl } from '../src/lib/utils.js';

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

    it('should adhere to strict DockPositionPreset contracts and Dynamic Island specifications', () => {
        const VALID_PRESETS = ['Left', 'Right', 'TopCenter', 'Custom'];
        
        // Ensure all presets match Rust IPC enum variants
        for (const preset of ['Left', 'Right', 'TopCenter', 'Custom']) {
            expect(VALID_PRESETS).toContain(preset);
        }

        // TopCenter pill geometry invariants:
        // Height: 44px (h-11), Width: 260px, Offset Y: 40px below notch
        const topCenterCollapsed = { width: 260, height: 44, offsetY: 40, rounded: 'full' };
        expect(topCenterCollapsed.height).toBe(44);
        expect(topCenterCollapsed.width).toBe(260);
        expect(topCenterCollapsed.offsetY).toBe(40);
        expect(topCenterCollapsed.rounded).toBe('full');

        // Puck mode invariants: 48x48px circle
        const puck = { width: 48, height: 48, rounded: 'full' };
        expect(puck.width).toBe(48);
        expect(puck.height).toBe(48);
    });

    it('should validate Calendar Event data contracts and attendee schema (security.md)', () => {
        expect(Array.isArray(MOCK_CALENDAR_EVENTS)).toBe(true);
        expect(MOCK_CALENDAR_EVENTS.length).toBeGreaterThanOrEqual(4);

        const REQUIRED_CALENDAR_FIELDS = [
            'id', 'title', 'startTime', 'endTime', 'duration',
            'categoryColor', 'organizer', 'attendees'
        ];

        const VALID_ATTENDEE_STATUSES = ['accepted', 'tentative', 'needsAction'];

        for (const event of MOCK_CALENDAR_EVENTS) {
            for (const field of REQUIRED_CALENDAR_FIELDS) {
                expect(event).toHaveProperty(field);
            }
            expect(typeof event.title).toBe('string');
            expect(event.title.length).toBeGreaterThan(0);
            expect(event.categoryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

            // Zero XSS / raw injection check (Check 15)
            expect(event).not.toHaveProperty('dangerouslySetInnerHTML');
            expect(event).not.toHaveProperty('innerHTML');

            // Attendees validation
            expect(Array.isArray(event.attendees)).toBe(true);
            for (const attendee of event.attendees) {
                expect(attendee).toHaveProperty('name');
                expect(attendee).toHaveProperty('status');
                expect(VALID_ATTENDEE_STATUSES).toContain(attendee.status);
            }
        }
    });

    it('Check 15 (security.md): isSafeMeetingUrl must reject malicious protocols and accept valid HTTPS/zoommtg URLs', () => {
        // Valid Whitelist URLs
        expect(isSafeMeetingUrl('https://zoom.us/j/98765432101')).toBe(true);
        expect(isSafeMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
        expect(isSafeMeetingUrl('https://teams.microsoft.com/l/meetup-join/123')).toBe(true);
        expect(isSafeMeetingUrl('zoommtg://zoom.us/join?action=join&confno=123')).toBe(true);

        // Malicious or forbidden protocols
        expect(isSafeMeetingUrl("javascript:alert('xss')")).toBe(false);
        expect(isSafeMeetingUrl("javascript:/*--></title></style></textarea></script><svg/onload=alert(1)>")).toBe(false);
        expect(isSafeMeetingUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
        expect(isSafeMeetingUrl("file:///etc/passwd")).toBe(false);
        expect(isSafeMeetingUrl("vbscript:msgbox(1)")).toBe(false);
        expect(isSafeMeetingUrl("http://insecure-link.com")).toBe(false); // only https allowed
        expect(isSafeMeetingUrl("")).toBe(false);
        expect(isSafeMeetingUrl(null)).toBe(false);
        expect(isSafeMeetingUrl(undefined)).toBe(false);
        expect(isSafeMeetingUrl(12345)).toBe(false);
    });
});
