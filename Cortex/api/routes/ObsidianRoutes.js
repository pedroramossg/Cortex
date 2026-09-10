import express from 'express';
import * as obsidianController from '../controllers/ObsidianController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { formatNoteSchema } from '../validators/ObsidianValidator.js';

const router = express.Router();

/**
 * @swagger
 * /obsidian/format:
 *   post:
 *     summary: Format an Obsidian note
 *     description: Sanitizes note metadata, generates YAML frontmatter, formats markdown with Obsidian syntax, and produces an obsidian:// URI for local saving in Tauri.
 *     tags:
 *       - Obsidian
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
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note formatted successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/format', requireAuth, validate(formatNoteSchema), obsidianController.formatNote);

/**
 * @swagger
 * /obsidian/suggestions:
 *   get:
 *     summary: Get Obsidian formatting suggestions
 *     description: Retrieves syntax tips, callout styles, and wikilink conventions used by Obsidian.
 *     tags:
 *       - Obsidian
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Formatting suggestions
 *       401:
 *         description: Unauthorized
 */
router.get('/suggestions', requireAuth, obsidianController.getSuggestions);

export default router;
