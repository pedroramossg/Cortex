import { createCalendarEventSchema } from './CalendarValidator.js';
import { formatNoteSchema } from './ObsidianValidator.js';

describe('Validators Unit Tests', () => {
    describe('CalendarValidator', () => {
        const validPayload = {
            title: 'Sprint Planning',
            description: 'Discuss upcoming sprint backlog and goals',
            location: 'Conference Room B / Google Meet',
            start: '2026-09-09T10:00:00.000Z',
            end: '2026-09-09T11:00:00.000Z',
            timeZone: 'America/Sao_Paulo',
            allDay: false,
            attendees: ['team@example.com', 'techlead@example.com'],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 10 },
                    { method: 'email', minutes: 30 }
                ]
            }
        };

        it('should pass with a complete, valid payload', () => {
            const parsed = createCalendarEventSchema.parse(validPayload);
            expect(parsed.title).toBe('Sprint Planning');
            expect(parsed.attendees).toHaveLength(2);
        });

        it('should FAIL when end time is earlier than start time (Zod .refine)', () => {
            const invalidPayload = {
                ...validPayload,
                start: '2026-09-09T12:00:00.000Z',
                end: '2026-09-09T11:00:00.000Z'
            };

            expect(() => createCalendarEventSchema.parse(invalidPayload)).toThrow(
                /End time must be after start time/
            );
        });

        it('should FAIL when end time is equal to start time', () => {
            const invalidPayload = {
                ...validPayload,
                start: '2026-09-09T10:00:00.000Z',
                end: '2026-09-09T10:00:00.000Z'
            };

            expect(() => createCalendarEventSchema.parse(invalidPayload)).toThrow(
                /End time must be after start time/
            );
        });

        it('should FAIL with invalid ISO 8601 datetime format', () => {
            const invalidPayload = {
                ...validPayload,
                start: 'not-a-date'
            };

            expect(() => createCalendarEventSchema.parse(invalidPayload)).toThrow();
        });

        it('should FAIL when extra properties are provided (Parameter Pollution Defense)', () => {
            const invalidPayload = {
                ...validPayload,
                maliciousField: 'exploit'
            };

            expect(() => createCalendarEventSchema.parse(invalidPayload)).toThrow(
                /Unrecognized key/
            );
        });

        it('should FAIL with invalid attendee email', () => {
            const invalidPayload = {
                ...validPayload,
                attendees: ['not-an-email']
            };

            expect(() => createCalendarEventSchema.parse(invalidPayload)).toThrow(
                /Invalid attendee email/
            );
        });
    });

    describe('ObsidianValidator', () => {
        it('should pass with valid title and content', () => {
            const payload = {
                title: 'Architecture Decisions 2026',
                content: 'Discussing [[Calendar]] and [[Obsidian]] design.',
                tags: ['architecture', 'cortex/core'],
                aliases: ['ADR-001', 'Decisions'],
                status: 'in-progress'
            };

            const parsed = formatNoteSchema.parse(payload);
            expect(parsed.title).toBe('Architecture Decisions 2026');
            expect(parsed.tags).toEqual(['architecture', 'cortex/core']);
        });

        it('should FAIL if title is empty or missing', () => {
            expect(() => formatNoteSchema.parse({ title: '   ' })).toThrow(/Title is required/);
            expect(() => formatNoteSchema.parse({})).toThrow();
        });

        it('should FAIL if tags contain spaces or invalid characters', () => {
            const invalidPayload = {
                title: 'Note with bad tag',
                tags: ['tag with spaces', 'invalid#tag']
            };

            expect(() => formatNoteSchema.parse(invalidPayload)).toThrow(
                /Tags must contain only alphanumeric/
            );
        });

        it('should FAIL on parameter pollution (.strict)', () => {
            const invalidPayload = {
                title: 'Valid Note',
                vaultPathOverride: '/etc/passwd'
            };

            expect(() => formatNoteSchema.parse(invalidPayload)).toThrow(/Unrecognized key/);
        });
    });
});
