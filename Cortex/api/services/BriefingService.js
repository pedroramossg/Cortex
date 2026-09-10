import calendarService from './CalendarService.js';
import * as TriageModel from '../models/TriageModel.js';
import redisClient from '../config/redis.js';

class BriefingService {
    /**
     * Compute human-readable time until event starts
     */
    formatTimeUntil(startTimeStr) {
        const now = new Date();
        const start = new Date(startTimeStr);
        const diffMs = start.getTime() - now.getTime();

        if (diffMs < 0) return 'já iniciado';
        const diffMins = Math.round(diffMs / (1000 * 60));

        if (diffMins < 60) {
            return `em ${diffMins} min`;
        }
        const diffHours = Math.floor(diffMins / 60);
        const remainingMins = diffMins % 60;
        return remainingMins > 0 ? `em ${diffHours}h ${remainingMins}m` : `em ${diffHours}h`;
    }

    /**
     * Generate or retrieve today's morning briefing
     */
    async getTodayBriefing(user, { forceRefresh = false } = {}) {
        const todayStr = new Date().toISOString().split('T')[0];
        const cacheKey = `briefing:${user.id}:${todayStr}`;

        // 1. Check Redis Cache
        if (!forceRefresh && redisClient && typeof redisClient.get === 'function') {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (err) {
                console.warn('[BriefingService] Redis get cache error:', err.message);
            }
        }

        // 2. Fetch Calendar Events for Today
        let todayEvents = [];
        try {
            if (user.google_access_token || user.google_refresh_token) {
                todayEvents = await calendarService.getTodayEvents(user);
            }
        } catch (calErr) {
            console.warn('[BriefingService] Calendar fetch non-blocking error:', calErr.message);
        }

        // Sort events chronologically to extract the first commitment
        todayEvents.sort((a, b) => {
            const timeA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
            const timeB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
            return timeA - timeB;
        });

        const firstEvent = todayEvents[0] || null;
        const firstCommitment = firstEvent ? {
            id: firstEvent.id,
            title: firstEvent.summary || 'Compromisso sem título',
            start: firstEvent.start?.dateTime || firstEvent.start?.date,
            end: firstEvent.end?.dateTime || firstEvent.end?.date,
            location: firstEvent.location || 'Online',
            timeUntil: this.formatTimeUntil(firstEvent.start?.dateTime || firstEvent.start?.date)
        } : null;

        // Calculate meeting metrics
        let totalMeetingMinutes = 0;
        todayEvents.forEach(evt => {
            if (evt.start?.dateTime && evt.end?.dateTime) {
                const dur = (new Date(evt.end.dateTime) - new Date(evt.start.dateTime)) / (1000 * 60);
                if (dur > 0) totalMeetingMinutes += dur;
            }
        });

        // 3. Fetch Triaged Urgencies and Approvals from DB
        const urgencies = await TriageModel.getRecentUrgencies(user.id, 24);
        const pendingApprovals = await TriageModel.getPendingApprovals(user.id, 48);

        // 4. Determine Dynamic Greeting
        const hour = new Date().getHours();
        let greetingPrefix = 'Bom dia';
        if (hour >= 12 && hour < 18) greetingPrefix = 'Boa tarde';
        else if (hour >= 18 || hour < 5) greetingPrefix = 'Boa noite';

        const firstName = user.name ? user.name.split(' ')[0] : 'Pedro';
        const greeting = `${greetingPrefix}, ${firstName}`;

        const briefing = {
            date: todayStr,
            greeting,
            first_commitment: firstCommitment,
            urgencies,
            pending_approvals: pendingApprovals,
            stats: {
                total_meetings: todayEvents.length,
                total_meeting_minutes: totalMeetingMinutes,
                urgent_count: urgencies.length,
                pending_approvals_count: pendingApprovals.length
            }
        };

        // 5. Cache in Redis (TTL: 15 minutes)
        if (redisClient && typeof redisClient.setEx === 'function') {
            try {
                await redisClient.setEx(cacheKey, 900, JSON.stringify(briefing));
            } catch (err) {
                console.warn('[BriefingService] Redis set cache error:', err.message);
            }
        }

        // 6. Snapshot to DB
        try {
            await TriageModel.saveDailyBriefing({
                userId: user.id,
                briefingDate: todayStr,
                firstCommitment: briefing.first_commitment,
                urgencies: briefing.urgencies,
                pendingApprovals: briefing.pending_approvals,
                stats: briefing.stats
            });
        } catch (dbErr) {
            console.warn('[BriefingService] DB snapshot non-blocking error:', dbErr.message);
        }

        return briefing;
    }
}

export default new BriefingService();
