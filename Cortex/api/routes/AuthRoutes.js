import express from 'express';
import * as authController from '../controllers/AuthController.js';
import { checkCache } from '../middleware/cacheMiddleware.js';
const router = express.Router();

router.post("/auth/register", checkCache, authController.register);
router.post("/auth/login", checkCache, authController.login);

export default router;
