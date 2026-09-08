import { Queue } from 'bullmq';

// We reuse the existing Redis configuration connection URL
// Notice: bullmq requires ioredis instead of standard redis package for better cluster support,
// but it can connect to the same REDIS_URL.
const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

export const gmailWebhookQueue = new Queue('gmail-webhooks', { connection });

export const addGmailWebhookJob = async (payload) => {
    // Add job with a unique job ID to prevent duplicates if Pub/Sub retries
    return await gmailWebhookQueue.add('process-webhook', payload, {
        jobId: payload.message.messageId, // Google Pub/Sub messageId is unique
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000
        }
    });
};
