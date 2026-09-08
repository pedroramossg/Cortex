import { Worker } from 'bullmq';
import gmailService from '../services/GmailService.js';

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

export const startGmailWorker = () => {
    const worker = new Worker('gmail-webhooks', async (job) => {
        try {
            console.log(`[Worker] Processing Gmail Webhook Job ${job.id}`);
            const payload = job.data;
            
            // Gmail webhooks usually send a historyId and emailAddress.
            // We use these to fetch the actual email content.
            // 1. Fetch user by email address to get their google_access_token
            // 2. Call Gmail API using the token to get the email content
            // 3. Parse the MIME format
            // 4. Dispatch WebSocket event to Tauri

            await gmailService.processWebhookPayload(payload);
            
            console.log(`[Worker] Job ${job.id} completed`);
        } catch (error) {
            console.error(`[Worker] Job ${job.id} failed:`, error.message);
            throw error; // BullMQ will retry based on queue settings
        }
    }, { connection });

    worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed with error ${err.message}`);
    });

    console.log('[Worker] Gmail Webhook Worker started');
    return worker;
};
