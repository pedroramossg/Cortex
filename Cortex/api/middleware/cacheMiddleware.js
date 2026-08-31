import redisClient from "../config/redis.js";

export const checkCache = async (req, res, next) => {
    const cacheKey = `cache:${req.originalUrl}`

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
        console.log("Cache error: " + err);
        next();
    }
};


export const setCache = async (req, res, data) => {
    try {
        const cacheKey = `cache:${req.originalUrl}`
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(data))
    } catch (err) {
        console.log("Cache error: " + err)
    }
}
