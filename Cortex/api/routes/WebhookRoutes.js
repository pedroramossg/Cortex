import express from 'express';
import { handleGmailPush } from '../webhooks/gmail.js';

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
router.post("/gmail", handleGmailPush);

export default router;
