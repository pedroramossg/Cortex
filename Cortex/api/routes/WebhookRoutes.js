import express from 'express';
import { handleGmailPush } from '../webhooks/gmail.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import { verifyGoogleOIDC } from '../middleware/verifyGoogleOIDC.js';

const router = express.Router();

/**
 * @swagger
 * /webhooks/gmail:
 *   post:
 *     summary: Receive Google Pub/Sub push notifications for Gmail
 *     description: Enqueues the notification for background processing.
 *     tags:
 *       - Webhooks
 */
router.post("/gmail", webhookLimiter, verifyGoogleOIDC, handleGmailPush);

export default router;
