import briefingService from '../services/BriefingService.js';
import * as User from '../models/Auth.js';

export const getTodayBriefing = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const forceRefresh = req.query.forceRefresh === true || req.query.forceRefresh === 'true';
        const briefing = await briefingService.getTodayBriefing(user, { forceRefresh });

        return res.status(200).json({
            success: true,
            data: briefing
        });
    } catch (error) {
        next(error);
    }
};
