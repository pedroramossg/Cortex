import googleAuthService from '../services/GoogleAuthService.js';
import * as User from '../models/Auth.js';
import jwt from 'jsonwebtoken';
import { setCache, purgeUserCache } from '../middleware/cacheMiddleware.js';

const generateToken = (user) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

export const redirectUrl = (req, res, next) => {
    try {
        const url = googleAuthService.getAuthUrl();
        res.redirect(url);
    } catch (error) {
        next(error);
    }
};

export const handleCallback = async (req, res, next) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ message: "Authorization code missing" });
        }

        // Exchange code for tokens and profile
        const { tokens, profile } = await googleAuthService.handleCallback(code);

        // Upsert user into database with Google tokens
        const user = await User.upsertGoogleUser({
            name: profile.name,
            email: profile.email,
            google_access_token: tokens.access_token,
            google_refresh_token: tokens.refresh_token
        });

        // Generate Cortex Session JWT
        const sessionToken = generateToken(user);
        
        // Optimize using cacheMiddleware with a custom key
        const cacheKey = `user_session:${user.id}`;
        await setCache(req, res, user, cacheKey, 3600 * 24 * 30);

        // In a desktop app environment, we typically redirect to a deep link to pass the token back to Tauri
        // Example: res.redirect(`cortex://auth?token=${sessionToken}`);
        // For now, we can redirect to a web success page or just return JSON if it's a web view
        
        // We will return HTML that attempts to deep link or can be intercepted by Tauri
        res.send(`
            <html>
                <body>
                    <p>Authentication successful. You can close this window.</p>
                    <script>
                        window.location.href = 'cortex://auth?token=${sessionToken}';
                    </script>
                </body>
            </html>
        `);

    } catch (error) {
        next(error);
    }
};

export const disconnectGoogle = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // 1. Revoke tokens with Google if present
        if (user.google_access_token) {
            await googleAuthService.revokeToken(user.google_access_token);
        } else if (user.google_refresh_token) {
            await googleAuthService.revokeToken(user.google_refresh_token);
        }

        // 2. Clear Google tokens in PostgreSQL
        await User.clearGoogleTokens(userId);

        // 3. Purge cached Google data from Redis
        await purgeUserCache(userId);

        return res.status(200).json({
            success: true,
            message: "Google account disconnected and cached data cleared successfully"
        });
    } catch (error) {
        next(error);
    }
};
