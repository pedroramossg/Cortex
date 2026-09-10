import { jest } from '@jest/globals';

// Setup ESM module mocks
jest.unstable_mockModule('../models/Auth.js', () => ({
    updateGoogleTokens: jest.fn(),
    findById: jest.fn()
}));

const mockInsert = jest.fn();
const mockList = jest.fn();

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
                insert: mockInsert,
                list: mockList
            }
        })
    }
}));

const { default: calendarService } = await import('./CalendarService.js');

describe('CalendarService Unit Tests', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    const mockUser = {
        id: 'user-uuid-1',
        email: 'user@example.com',
        google_access_token: 'valid_access_token',
        google_refresh_token: 'valid_refresh_token'
    };

    describe('createEvent', () => {
        it('should successfully create an event and generate iCal data', async () => {
            mockInsert.mockResolvedValue({
                data: {
                    id: 'gcal-event-123',
                    summary: 'Tech Lead Sync',
                    htmlLink: 'https://calendar.google.com/event?id=123'
                }
            });

            const eventData = {
                title: 'Tech Lead Sync',
                description: 'Review architecture and Obsidian integration',
                location: 'Google Meet',
                start: '2026-09-09T14:00:00.000Z',
                end: '2026-09-09T15:00:00.000Z',
                timeZone: 'America/Sao_Paulo',
                allDay: false,
                attendees: ['lead@example.com']
            };

            const result = await calendarService.createEvent(mockUser, eventData);

            expect(mockInsert).toHaveBeenCalledTimes(1);
            expect(mockInsert).toHaveBeenCalledWith({
                calendarId: 'primary',
                requestBody: {
                    summary: 'Tech Lead Sync',
                    description: 'Review architecture and Obsidian integration',
                    location: 'Google Meet',
                    start: { dateTime: '2026-09-09T14:00:00.000Z', timeZone: 'America/Sao_Paulo' },
                    end: { dateTime: '2026-09-09T15:00:00.000Z', timeZone: 'America/Sao_Paulo' },
                    attendees: [{ email: 'lead@example.com' }],
                    reminders: { useDefault: true }
                }
            });

            expect(result.id).toBe('gcal-event-123');
            expect(result.ics).toContain('BEGIN:VCALENDAR');
            expect(result.ics).toContain('SUMMARY:Tech Lead Sync');
            expect(result.ics).toContain('END:VCALENDAR');
        });

        it('should throw an operational 400 error if user has no Google tokens', async () => {
            const unlinkedUser = { id: 'user-uuid-2', email: 'no_tokens@example.com' };
            const eventData = {
                title: 'Test',
                start: '2026-09-09T14:00:00.000Z',
                end: '2026-09-09T15:00:00.000Z'
            };

            await expect(calendarService.createEvent(unlinkedUser, eventData))
                .rejects
                .toMatchObject({
                    statusCode: 400,
                    message: expect.stringContaining('Google Calendar not connected')
                });
        });
    });

    describe('listEvents and getTodayEvents', () => {
        it('should list events for the specified range', async () => {
            mockList.mockResolvedValue({
                data: {
                    items: [
                        { id: 'ev-1', summary: 'Daily Standup' },
                        { id: 'ev-2', summary: 'Sprint Review' }
                    ]
                }
            });

            const items = await calendarService.listEvents(mockUser, {
                timeMin: '2026-09-09T00:00:00.000Z',
                timeMax: '2026-09-09T23:59:59.000Z'
            });

            expect(items).toHaveLength(2);
            expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
                calendarId: 'primary',
                singleEvents: true,
                orderBy: 'startTime'
            }));
        });

        it('should fetch today events using day boundaries', async () => {
            mockList.mockResolvedValue({
                data: {
                    items: [{ id: 'today-1', summary: 'Today Meeting' }]
                }
            });

            const items = await calendarService.getTodayEvents(mockUser);
            expect(items).toHaveLength(1);
            expect(mockList).toHaveBeenCalledTimes(1);
        });
    });

    describe('generateICalString', () => {
        it('should generate valid RFC 5545 iCalendar content', () => {
            const ics = calendarService.generateICalString({
                id: 'apple-cal-test',
                title: 'Lunch Meeting',
                description: 'Talk with team\nBring notes',
                location: 'Downtown Cafe',
                start: '2026-09-09T12:00:00.000Z',
                end: '2026-09-09T13:00:00.000Z',
                allDay: false
            });

            expect(ics).toContain('BEGIN:VCALENDAR');
            expect(ics).toContain('PRODID:-//Cortex//AppleCalendarBridge//EN');
            expect(ics).toContain('SUMMARY:Lunch Meeting');
            expect(ics).toContain('LOCATION:Downtown Cafe');
            expect(ics).toContain('DESCRIPTION:Talk with team\\nBring notes');
            expect(ics).toContain('END:VCALENDAR');
        });
    });
});
