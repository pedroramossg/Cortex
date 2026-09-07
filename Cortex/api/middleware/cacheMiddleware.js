import redisClient from "../config/redis.js";

export const checkCache = async (req, res, next) => {
    // Prevent caching for non-GET requests (like POST login/register)
    if (req.method !== 'GET') {
        return next();
    }

    const cacheKey = `cache:${req.originalUrl}`;

    try {
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            return res.status(200).json({
                success: true,
                data: JSON.parse(cachedData)
            });
        }
        next();

    } catch (err) {
        console.error("Cache error: " + err);
        next();
    }
};

export const setCache = async (req, res, data, customKey = null, ttl = 3600) => {
    try {
        const cacheKey = customKey ? customKey : `cache:${req.originalUrl}`;
        await redisClient.setEx(cacheKey, ttl, JSON.stringify(data));
    } catch (err) {
        console.error("Cache error: " + err);
    }
};

export const removeCache = async (req, res, customKey = null) => {
    try {
        const cacheKey = customKey ? customKey : `cache:${req.originalUrl}`;
        await redisClient.del(cacheKey);
    } catch (err) {
        console.error("Cache error: " + err);
    }
};
