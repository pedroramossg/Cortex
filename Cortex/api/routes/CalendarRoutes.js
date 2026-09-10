import express from 'express';
import * as calendarController from '../controllers/CalendarController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { createCalendarEventSchema } from '../validators/CalendarValidator.js';

const router = express.Router();

/**
 * @swagger
 * /calendar/events:
 *   post:
 *     summary: Create a calendar event
 *     description: Creates an event on Google Calendar, syncing seamlessly with Apple Calendar.
 *     tags:
 *       - Calendar
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - start
 *               - end
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               start:
 *                 type: string
 *                 format: date-time
 *               end:
 *                 type: string
 *                 format: date-time
 *               timeZone:
 *                 type: string
 *               allDay:
 *                 type: boolean
 *               attendees:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Validation error or Google Calendar not connected
 *       401:
 *         description: Unauthorized
 */
router.post('/events', requireAuth, validate(createCalendarEventSchema), calendarController.createEvent);

/**
 * @swagger
 * /calendar/today:
 *   get:
 *     summary: Get today's events
 *     description: Retrieves all calendar events scheduled for today.
 *     tags:
 *       - Calendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of today's events
 *       401:
 *         description: Unauthorized
 */
router.get('/today', requireAuth, calendarController.getTodayEvents);

/**
 * @swagger
 * /calendar/events:
 *   get:
 *     summary: List calendar events
 *     description: Retrieves calendar events filtered by timeMin and timeMax.
 *     tags:
 *       - Calendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of events
 *       401:
 *         description: Unauthorized
 */
router.get('/events', requireAuth, calendarController.listEvents);

export default router;
