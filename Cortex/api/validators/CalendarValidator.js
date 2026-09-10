import { z } from 'zod';

export const createCalendarEventSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(255, "Title must not exceed 255 characters"),
    description: z.string().trim().max(5000, "Description must not exceed 5000 characters").optional(),
    location: z.string().trim().max(500, "Location must not exceed 500 characters").optional(),
    start: z.string().datetime({ message: "Start time must be a valid ISO 8601 datetime" }),
    end: z.string().datetime({ message: "End time must be a valid ISO 8601 datetime" }),
    timeZone: z.string().trim().max(100).optional(),
    allDay: z.boolean().default(false),
    attendees: z.array(z.string().email("Invalid attendee email address")).max(50, "Max 50 attendees").optional(),
    reminders: z.object({
        useDefault: z.boolean().default(true),
        overrides: z.array(z.object({
            method: z.enum(['email', 'popup']),
            minutes: z.number().int().min(0).max(40320)
        }).strict()).optional()
    }).strict().optional()
})
.strict()
.refine((data) => new Date(data.end) > new Date(data.start), {
    message: "End time must be after start time",
    path: ["end"]
});

export const listCalendarEventsSchema = z.object({
    timeMin: z.string().datetime().optional(),
    timeMax: z.string().datetime().optional(),
    maxResults: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(250)).optional(),
    calendarId: z.string().trim().max(255).optional()
}).strict();
