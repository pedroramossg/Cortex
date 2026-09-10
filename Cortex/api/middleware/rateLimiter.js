import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisClient from '../config/redis.js';

const createStore = () => {
    if (process.env.NODE_ENV === 'test') {
        return undefined;
    }
    return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    });
};

export const authLimiter = rateLimit({
    store: createStore(),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login requests per `window` (here, per 15 minutes)
    message: { success: false, message: 'Too many authentication attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

export const webhookLimiter = rateLimit({
    store: createStore(),
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Google Pub/Sub limits
    message: { success: false, message: 'Too many webhook requests from this IP, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
