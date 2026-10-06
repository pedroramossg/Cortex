import calendarService from '../services/CalendarService.js';
import nlpCalendarService from '../services/nlpCalendarService.js';
import * as User from '../models/Auth.js';

export const createEvent = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const event = await calendarService.createEvent(user, req.body);

        return res.status(201).json({
            success: true,
            message: 'Calendar event created successfully',
            data: event
        });
    } catch (error) {
        next(error);
    }
};

export const getTodayEvents = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const events = await calendarService.getTodayEvents(user);

        return res.status(200).json({
            success: true,
            data: events
        });
    } catch (error) {
        next(error);
    }
};

export const listEvents = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const events = await calendarService.listEvents(user, req.query);

        return res.status(200).json({
            success: true,
            data: events
        });
    } catch (error) {
        next(error);
    }
};

export const deleteEvent = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await calendarService.deleteEvent(user, req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Calendar event deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const quickParse = async (req, res, next) => {
    try {
        const result = await nlpCalendarService.parseQuickCalendarEvent(req.body);
        return res.status(200).json({
            success: true,
            message: 'Texto interpretado com sucesso',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

