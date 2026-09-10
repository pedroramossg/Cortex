import * as TriageModel from '../models/TriageModel.js';
import redisClient from '../config/redis.js';

class TriageService {
    /**
     * Heuristic urgency scorer and classification
     */
    classifyEmail({ subject = '', snippet = '', from = '' }) {
        const text = `${subject} ${snippet}`.toLowerCase();

        // 1. High Urgency Patterns
        const urgentKeywords = [
            'urgente', 'urgent', 'asap', 'imediato', 'crítico', 'critical',
            'bloqueador', 'blocker', 'prazo hoje', 'deadline', 'escalation',
            'produção', 'prod down', 'incidente', 'security alert', 'emergência'
        ];
        const isUrgent = urgentKeywords.some(keyword => text.includes(keyword));

        // 2. Pending Approval Patterns
        const approvalKeywords = [
            'aguardo aprovação', 'por favor aprove', 'solicito aprovação',
            'aprovar', 'approve', 'sign-off', 'aguardo assinatura',
            'validação necessária', 'requer aprovação'
        ];
        const isApprovalPending = approvalKeywords.some(keyword => text.includes(keyword));

        // 3. Low Urgency Patterns (Newsletters, automated, notifications)
        const lowKeywords = [
            'newsletter', 'unsubscribe', 'no-reply', 'noreply',
            'recibo', 'receipt', 'fatura disponível', 'atualização dos termos',
            'digest', 'notificação automática'
        ];
        const isLow = !isUrgent && !isApprovalPending && lowKeywords.some(keyword => text.includes(keyword));

        // Assign Urgency
        let urgency = 'MEDIUM';
        if (isUrgent || isApprovalPending) {
            urgency = 'HIGH';
        } else if (isLow) {
            urgency = 'LOW';
        }

        // Action required detection
        const requiresAction = isApprovalPending || isUrgent || text.includes('?') || text.includes('favor verificar') || text.includes('preciso que');

        return {
            urgency,
            isApprovalPending,
            requiresAction
        };
    }

    /**
     * Process, persist, and dispatch triaged email message
     */
    async processAndTriage({ messageId, threadId, from, recipient, subject, snippet, userId, receivedAt }) {
        const classification = this.classifyEmail({ subject, snippet, from });

        // Upsert into PostgreSQL
        const triagedMessage = await TriageModel.upsertTriagedMessage({
            id: messageId,
            userId,
            threadId: threadId || messageId,
            sender: from,
            recipient,
            subject,
            snippet,
            urgency: classification.urgency,
            isApprovalPending: classification.isApprovalPending,
            requiresAction: classification.requiresAction,
            receivedAt: receivedAt || new Date()
        });

        // Smart Debounced Cache Invalidation: prevent Cache Thrashing during email bursts
        if (classification.urgency === 'HIGH') {
            await this.invalidateBriefingCacheWithDebounce(userId);
        }

        // Publish to user's real-time WebSocket channel
        const channel = `ws:user:${userId}`;
        if (redisClient && typeof redisClient.publish === 'function') {
            await redisClient.publish(channel, JSON.stringify({
                type: 'TRIAGED_EMAIL',
                data: triagedMessage
            }));
        }

        return triagedMessage;
    }

    /**
     * Debounced cache invalidation: sets a 5-second lock in Redis using NX
     * so that if 10 high-urgency emails arrive in 1 second, Redis cache is invalidated only once.
     */
    async invalidateBriefingCacheWithDebounce(userId) {
        if (!redisClient || typeof redisClient.sendCommand !== 'function') return;

        try {
            const lockKey = `lock:briefing_invalidation:${userId}`;
            // Set lock with 5 seconds expiration only if it does not exist (NX)
            const acquired = await redisClient.sendCommand(['SET', lockKey, '1', 'EX', '5', 'NX']);

            if (acquired) {
                const today = new Date().toISOString().split('T')[0];
                const cacheKey = `briefing:${userId}:${today}`;
                if (typeof redisClient.del === 'function') {
                    await redisClient.del(cacheKey);
                }
            }
        } catch (error) {
            console.warn('[TriageService] Cache invalidation warning:', error.message);
        }
    }
}

export default new TriageService();
