import express from 'express';
import * as contactController from '../controllers/ContactController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { llmLimiter } from '../middleware/rateLimiter.js';
import { validateQuery } from '../middleware/validate.js';
import { getContactContextQuerySchema } from '../validators/ContactValidator.js';

const router = express.Router();

/**
 * @swagger
 * /contacts/context:
 *   get:
 *     summary: Retrieve contact dossier and pre-meeting intelligence
 *     description: Cross-references calendar meetings and email history to synthesize talking points and open action items.
 *     tags:
 *       - Contacts
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Contact email address
 *     responses:
 *       200:
 *         description: Contact dossier retrieved successfully
 *       400:
 *         description: Invalid email parameter
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: AI rate limit exceeded
 */
router.get('/context', requireAuth, llmLimiter, validateQuery(getContactContextQuerySchema), contactController.getContactContext);

export default router;
