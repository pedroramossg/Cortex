import { addGmailWebhookJob } from '../jobs/queue.js';

export const handleGmailPush = async (req, res, next) => {
    try {
        const { message, subscription } = req.body;
        
        // Basic validation for Google Pub/Sub payload
        if (!message || !message.data) {
            return res.status(400).send('Invalid Pub/Sub message format');
        }

        // Add the message to the BullMQ queue
        // We do this quickly to acknowledge the push notification to Google
        // to prevent them from retrying excessively and to offload parsing.
        await addGmailWebhookJob(req.body);

        // Acknowledge receipt to Google Pub/Sub
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error queuing Gmail webhook:', error);
        // Do not return 500 blindly, or Google will retry with backoff.
        // But if redis is down, we might want them to retry.
        next(error);
    }
};
