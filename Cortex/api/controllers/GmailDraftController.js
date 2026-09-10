import draftReplyService from '../services/DraftReplyService.js';
import * as User from '../models/Auth.js';

export const createDraftReply = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { threadId, customInstruction, createInGmail } = req.body;
        const result = await draftReplyService.generateDraftReplies(user, {
            threadId,
            customInstruction,
            createInGmail
        });

        return res.status(200).json({
            success: true,
            message: 'Draft replies generated successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};
