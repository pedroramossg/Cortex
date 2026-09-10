import { google } from 'googleapis';
import calendarService from './CalendarService.js';
import llmService from './LLMService.js';
import * as TriageModel from '../models/TriageModel.js';
import redisClient from '../config/redis.js';

class ContactDossierService {
    /**
     * Build Pre-Meeting Intelligence Dossier for a contact
     */
    async getContactDossier(user, contactEmail) {
        const cleanEmail = contactEmail.trim().toLowerCase();
        const cacheKey = `contact_dossier:${user.id}:${cleanEmail}`;

        // 1. Check Redis Cache
        if (redisClient && typeof redisClient.get === 'function') {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (err) {
                console.warn('[ContactDossierService] Redis get error:', err.message);
            }
        }

        const auth = calendarService.getOAuth2Client(user);

        // 2. Query Calendar for upcoming meetings with this contact
        let upcomingMeetings = [];
        try {
            const calendar = google.calendar({ version: 'v3', auth });
            const nowIso = new Date().toISOString();
            const calRes = await calendar.events.list({
                calendarId: 'primary',
                timeMin: nowIso,
                q: cleanEmail,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 5
            });

            if (calRes.data?.items) {
                upcomingMeetings = calRes.data.items.map(evt => ({
                    id: evt.id,
                    title: evt.summary || 'Reunião',
                    start: evt.start?.dateTime || evt.start?.date,
                    end: evt.end?.dateTime || evt.end?.date,
                    location: evt.location || 'Online'
                }));
            }
        } catch (calErr) {
            console.warn('[ContactDossierService] Calendar fetch error:', calErr.message);
        }

        // 3. Query Gmail for recent interactions
        let recentThreads = [];
        try {
            const gmail = google.gmail({ version: 'v1', auth });
            const threadRes = await gmail.users.threads.list({
                userId: 'me',
                q: `from:${cleanEmail} OR to:${cleanEmail}`,
                maxResults: 5
            });

            if (threadRes.data?.threads) {
                for (const t of threadRes.data.threads) {
                    const threadDetail = await gmail.users.threads.get({
                        userId: 'me',
                        id: t.id,
                        format: 'metadata',
                        metadataHeaders: ['Subject', 'From', 'Date']
                    });

                    const firstMsg = threadDetail.data?.messages?.[0];
                    const lastMsg = threadDetail.data?.messages?.slice(-1)[0];
                    const headers = firstMsg?.payload?.headers || [];
                    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'Sem Assunto';
                    const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

                    recentThreads.push({
                        threadId: t.id,
                        subject,
                        date,
                        snippet: lastMsg?.snippet || ''
                    });
                }
            }
        } catch (gmailErr) {
            console.warn('[ContactDossierService] Gmail fetch error, falling back to local DB:', gmailErr.message);
            // Fallback to local triaged_messages in DB
            const dbMsgs = await TriageModel.getMessagesByContact(user.id, cleanEmail, 5);
            recentThreads = dbMsgs.map(m => ({
                threadId: m.threadId,
                subject: m.subject,
                date: m.received_at,
                snippet: m.snippet
            }));
        }

        // 4. Generate AI Executive Dossier Synthesis
        const aiSynthesis = await llmService.generateContactDossier({
            contactEmail: cleanEmail,
            upcomingMeetings,
            recentThreads
        });

        const dossier = {
            contact: {
                email: cleanEmail
            },
            upcoming_meetings: upcomingMeetings,
            recent_threads: recentThreads,
            relationship_summary: aiSynthesis.relationship_summary,
            last_interaction_summary: aiSynthesis.last_interaction_summary,
            open_action_items: aiSynthesis.open_action_items,
            talking_points: aiSynthesis.talking_points
        };

        // 5. Cache in Redis (TTL: 10 minutes)
        if (redisClient && typeof redisClient.setEx === 'function') {
            try {
                await redisClient.setEx(cacheKey, 600, JSON.stringify(dossier));
            } catch (err) {
                console.warn('[ContactDossierService] Redis set error:', err.message);
            }
        }

        return dossier;
    }
}

export default new ContactDossierService();
