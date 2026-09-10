import express from 'express';
import * as briefingController from '../controllers/BriefingController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validate.js';
import { getBriefingQuerySchema } from '../validators/BriefingValidator.js';

const router = express.Router();

/**
 * @swagger
 * /briefing/today:
 *   get:
 *     summary: Retrieve today's executive morning briefing
 *     description: Returns aggregated urgencies, pending approvals, and today's first calendar commitment.
 *     tags:
 *       - Briefing
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: forceRefresh
 *         schema:
 *           type: boolean
 *         description: Force bypass Redis cache and re-aggregate
 *     responses:
 *       200:
 *         description: Morning briefing retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/today', requireAuth, validateQuery(getBriefingQuerySchema), briefingController.getTodayBriefing);

export default router;
