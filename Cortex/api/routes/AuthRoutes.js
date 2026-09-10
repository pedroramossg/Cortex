import express from 'express';
import * as authController from '../controllers/AuthController.js';
import * as googleAuthController from '../controllers/GoogleAuthController.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/AuthValidator.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account
 *     responses:
 *       201:
 *         description: User registered successfully
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's name
 *               email:
 *                 type: string
 *                 description: User's email
 *               password:
 *                 type: string
 *                 description: User's password
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     description: Logs in a user account
 *     responses:
 *       200:
 *         description: User logged in successfully
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: User's email
 *               password:
 *                 type: string
 *                 description: User's password
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout a user
 *     description: Logs out a user account
 *     responses:
 *       200:
 *         description: User logged out successfully
 *     tags:
 *       - Auth
 */

import { requireAuth } from '../middleware/requireAuth.js';

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/logout", requireAuth, authController.logout);

// Google OAuth Routes
router.get("/google", googleAuthController.redirectUrl);
router.get("/google/callback", authLimiter, googleAuthController.handleCallback);

/**
 * @swagger
 * /auth/google/disconnect:
 *   post:
 *     summary: Disconnect Google Account & Revoke Data
 *     description: Revokes Google OAuth access/refresh tokens and purges cached Google data
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Google account disconnected successfully
 *       401:
 *         description: Unauthorized
 *     tags:
 *       - Auth
 */
router.post("/google/disconnect", requireAuth, googleAuthController.disconnectGoogle);

export default router;
