import { google } from 'googleapis';
import * as User from '../models/Auth.js';
import redisClient from '../config/redis.js';

class GmailService {
    /**
     * Set up the OAuth2 client for a given user
     */
    getOAuth2Client(user) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: user.google_access_token,
            refresh_token: user.google_refresh_token
        });

        // Automatically update tokens in DB if they are refreshed
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token || tokens.access_token) {
                await User.updateGoogleTokens(user.id, {
                    google_access_token: tokens.access_token || user.google_access_token,
                    google_refresh_token: tokens.refresh_token || user.google_refresh_token
                });
            }
        });

        return oauth2Client;
    }

    /**
     * Processes a push notification from Google Pub/Sub
     * @param {Object} payload The parsed job data from BullMQ
     */
    async processWebhookPayload(payload) {
        // The Pub/Sub payload structure
        // payload.message.data is a base64 encoded string containing emailAddress and historyId
        const dataStr = Buffer.from(payload.message.data, 'base64').toString('utf8');
        const data = JSON.parse(dataStr);
        
        const { emailAddress, historyId } = data;

        if (!emailAddress) {
            throw new Error("No emailAddress in Pub/Sub data");
        }

        // 1. Fetch user by email to get their google_access_token
        const user = await User.findByEmail({ email: emailAddress });
        if (!user || !user.google_access_token) {
            throw new Error(`User ${emailAddress} not found or has no Google tokens`);
        }

        const auth = this.getOAuth2Client(user);
        const gmail = google.gmail({ version: 'v1', auth });

        // 2. We use historyId to get the exact changes (new messages)
        // For simplicity in this step, let's fetch the history
        // since the last historyId we processed (if we stored it).
        // If not, we just fetch the history from the one Google sent.
        
        // Let's get the history of messages added
        const response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: historyId,
            historyTypes: ['messageAdded']
        });

        const histories = response.data.history;
        if (!histories) {
            console.log(`No new messages found for ${emailAddress} since historyId ${historyId}`);
            return;
        }

        // Process each newly added message
        for (const history of histories) {
            if (history.messagesAdded) {
                for (const msg of history.messagesAdded) {
                    const messageId = msg.message.id;
                    await this.fetchAndProcessEmail(gmail, messageId, user.id);
                }
            }
        }
    }

    async fetchAndProcessEmail(gmailClient, messageId, userId) {
        // Fetch full email
        const msgRes = await gmailClient.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        const messageData = msgRes.data;
        const headers = messageData.payload.headers;

        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const snippet = messageData.snippet;

        // In a real scenario we parse the MIME body, but for now we extract snippet and headers
        const parsedEmail = {
            id: messageId,
            subject,
            from,
            snippet,
            timestamp: new Date().toISOString()
        };

        console.log(`[GmailService] Parsed email for User ${userId}: ${subject}`);

        // TODO: Enqueue or dispatch via WebSocket to Tauri
        // Example: Push to a Redis stream or Pub/Sub channel that a WebSocket server is listening to
        const channel = `ws:user:${userId}`;
        await redisClient.publish(channel, JSON.stringify({
            type: 'NEW_EMAIL',
            data: parsedEmail
        }));
    }
}

export default new GmailService();
