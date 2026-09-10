import calendarService from '../services/CalendarService.js';
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
