import { google } from 'googleapis';
import * as User from '../models/Auth.js';

class CalendarService {
    /**
     * Set up OAuth2 client with auto-refresh token persistence
     */
    getOAuth2Client(user) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: user.google_access_token,
            refresh_token: user.google_refresh_token
        });

        // Automatically update tokens in DB if they are refreshed
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token || tokens.access_token) {
                await User.updateGoogleTokens(user.id, {
                    google_access_token: tokens.access_token || user.google_access_token,
                    google_refresh_token: tokens.refresh_token || user.google_refresh_token
                });
            }
        });

        return oauth2Client;
    }

    /**
     * Create an event in Google Calendar (seamlessly syncing with Apple Calendar)
     * @param {Object} user 
     * @param {Object} eventData 
     */
    async createEvent(user, eventData) {
        if (!user.google_access_token && !user.google_refresh_token) {
            const error = new Error("Google Calendar not connected. Please authenticate with Google first.");
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        const auth = this.getOAuth2Client(user);
        const calendar = google.calendar({ version: 'v3', auth });

        const timeZone = eventData.timeZone || process.env.DEFAULT_TIMEZONE || 'UTC';

        const requestBody = {
            summary: eventData.title,
            description: eventData.description || '',
            location: eventData.location || '',
            start: eventData.allDay
                ? { date: eventData.start.split('T')[0] }
                : { dateTime: eventData.start, timeZone },
            end: eventData.allDay
                ? { date: eventData.end.split('T')[0] }
                : { dateTime: eventData.end, timeZone },
            attendees: eventData.attendees
                ? eventData.attendees.map(email => ({ email }))
                : undefined,
            reminders: eventData.reminders || { useDefault: true }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody
        });

        const createdEvent = response.data;

        // Generate iCalendar (.ics) string for direct Apple Calendar local import/fallback
        const icsData = this.generateICalString({
            id: createdEvent.id,
            title: eventData.title,
            description: eventData.description,
            location: eventData.location,
            start: eventData.start,
            end: eventData.end,
            allDay: eventData.allDay
        });

        return {
            ...createdEvent,
            ics: icsData
        };
    }

    /**
     * List calendar events with time boundaries
     */
    async listEvents(user, options = {}) {
        if (!user.google_access_token && !user.google_refresh_token) {
            const error = new Error("Google Calendar not connected. Please authenticate with Google first.");
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        const auth = this.getOAuth2Client(user);
        const calendar = google.calendar({ version: 'v3', auth });

        const response = await calendar.events.list({
            calendarId: options.calendarId || 'primary',
            timeMin: options.timeMin,
            timeMax: options.timeMax,
            maxResults: options.maxResults || 50,
            singleEvents: true,
            orderBy: 'startTime'
        });

        return response.data.items || [];
    }

    /**
     * Fetch events for the current day
     */
    async getTodayEvents(user) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

        return await this.listEvents(user, {
            timeMin: startOfDay,
            timeMax: endOfDay
        });
    }

    /**
     * Standard RFC 5545 iCalendar string generator for Apple Calendar compatibility
     */
    generateICalString({ id, title, description, location, start, end, allDay }) {
        const formatICSDate = (isoStr, isAllDay) => {
            const d = new Date(isoStr);
            if (isAllDay) {
                return d.toISOString().slice(0, 10).replace(/-/g, '');
            }
            return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const dtStart = formatICSDate(start, allDay);
        const dtEnd = formatICSDate(end, allDay);
        const dtStamp = formatICSDate(new Date().toISOString(), false);

        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Cortex//AppleCalendarBridge//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${id || 'cortex-' + Date.now()}`,
            `DTSTAMP:${dtStamp}`,
            allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
            allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
            `SUMMARY:${title || 'Untitled Event'}`,
            description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
            location ? `LOCATION:${location}` : '',
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR'
        ].filter(Boolean).join('\r\n');
    }
}

export default new CalendarService();
