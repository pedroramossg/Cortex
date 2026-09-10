import express from 'express';
import * as gmailDraftController from '../controllers/GmailDraftController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { llmLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { createDraftReplySchema } from '../validators/DraftReplyValidator.js';

const router = express.Router();

/**
 * @swagger
 * /gmail/draft-reply:
 *   post:
 *     summary: Generate 3 contextual auto-draft reply intents
 *     description: Analyzes the Gmail thread and generates 3 tailored reply intents (Confirm, Reschedule, Clarify), optionally creating a draft directly in Gmail.
 *     tags:
 *       - Gmail
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - threadId
 *             properties:
 *               threadId:
 *                 type: string
 *               customInstruction:
 *                 type: string
 *               createInGmail:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Draft reply options generated successfully
 *       400:
 *         description: Validation error or Google account not connected
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: AI rate limit exceeded
 */
router.post('/draft-reply', requireAuth, llmLimiter, validate(createDraftReplySchema), gmailDraftController.createDraftReply);

export default router;
