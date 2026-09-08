import jwt from 'jsonwebtoken';
import redisClient from '../config/redis.js';

export const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];

        // 1. Check if token is in blocklist
        const isBlocked = await redisClient.get(`blocklist:${token}`);
        if (isBlocked) {
            return res.status(401).json({ success: false, message: 'Token has been revoked' });
        }

        // 2. Verify JWT signature and expiration
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attach user info to request
        req.user = decoded;
        req.token = token; // Attach token so logout can blocklist it

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};
