import express from 'express';
import * as authController from '../controllers/AuthController.js';
import { checkCache } from '../middleware/cacheMiddleware.js';
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

import * as googleAuthController from '../controllers/GoogleAuthController.js';

router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.post("/auth/logout", authController.logout);

// Google OAuth Routes
router.get("/auth/google", googleAuthController.redirectUrl);
router.get("/auth/google/callback", googleAuthController.handleCallback);

export default router;
