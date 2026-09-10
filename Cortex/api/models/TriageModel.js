import db from "../db/db.js";

/**
 * Upsert a triaged email message into PostgreSQL
 */
export async function upsertTriagedMessage({
    id,
    userId,
    threadId,
    sender,
    recipient,
    subject,
    snippet,
    urgency = 'MEDIUM',
    isApprovalPending = false,
    requiresAction = false,
    receivedAt = new Date()
}) {
    const result = await db.query(`
        INSERT INTO "triaged_messages" (
            id, user_id, thread_id, sender, recipient, subject, snippet, 
            urgency, is_approval_pending, requires_action, received_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
            urgency = EXCLUDED.urgency,
            is_approval_pending = EXCLUDED.is_approval_pending,
            requires_action = EXCLUDED.requires_action,
            snippet = EXCLUDED.snippet
        RETURNING *;
    `, [id, userId, threadId, sender, recipient, subject, snippet, urgency, isApprovalPending, requiresAction, receivedAt]);

    return result.rows[0];
}

/**
 * Fetch high-urgency messages from the past N hours
 */
export async function getRecentUrgencies(userId, hours = 24) {
    const result = await db.query(`
        SELECT id, thread_id AS "threadId", sender AS "from", recipient, subject, snippet, 
               urgency, is_approval_pending, requires_action, received_at
        FROM "triaged_messages"
        WHERE user_id = $1 
          AND urgency = 'HIGH'
          AND received_at >= NOW() - ($2 || ' hours')::INTERVAL
        ORDER BY received_at DESC
        LIMIT 20;
    `, [userId, hours]);

    return result.rows;
}

/**
 * Fetch pending approvals from the past N hours
 */
export async function getPendingApprovals(userId, hours = 48) {
    const result = await db.query(`
        SELECT id, thread_id AS "threadId", sender AS "from", recipient, subject, snippet, 
               urgency, is_approval_pending, requires_action, received_at
        FROM "triaged_messages"
        WHERE user_id = $1 
          AND is_approval_pending = TRUE
          AND received_at >= NOW() - ($2 || ' hours')::INTERVAL
        ORDER BY received_at DESC
        LIMIT 20;
    `, [userId, hours]);

    return result.rows;
}

/**
 * Fetch interaction messages with a specific contact email
 */
export async function getMessagesByContact(userId, contactEmail, limit = 10) {
    const result = await db.query(`
        SELECT id, thread_id AS "threadId", sender AS "from", recipient, subject, snippet, 
               urgency, is_approval_pending, requires_action, received_at
        FROM "triaged_messages"
        WHERE user_id = $1 
          AND (sender ILIKE '%' || $2 || '%' OR recipient ILIKE '%' || $2 || '%')
        ORDER BY received_at DESC
        LIMIT $3;
    `, [userId, contactEmail, limit]);

    return result.rows;
}

/**
 * Persist or update a daily morning briefing snapshot
 */
export async function saveDailyBriefing({
    userId,
    briefingDate,
    firstCommitment,
    urgencies,
    pendingApprovals,
    stats
}) {
    const result = await db.query(`
        INSERT INTO "daily_briefings" (
            user_id, briefing_date, first_commitment, urgencies, pending_approvals, stats, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, briefing_date) DO UPDATE SET
            first_commitment = EXCLUDED.first_commitment,
            urgencies = EXCLUDED.urgencies,
            pending_approvals = EXCLUDED.pending_approvals,
            stats = EXCLUDED.stats
        RETURNING *;
    `, [userId, briefingDate, JSON.stringify(firstCommitment), JSON.stringify(urgencies), JSON.stringify(pendingApprovals), JSON.stringify(stats)]);

    return result.rows[0];
}

/**
 * Get stored daily briefing for a user and date
 */
export async function getDailyBriefing(userId, briefingDate) {
    const result = await db.query(`
        SELECT id, user_id, briefing_date, first_commitment, urgencies, pending_approvals, stats, created_at
        FROM "daily_briefings"
        WHERE user_id = $1 AND briefing_date = $2;
    `, [userId, briefingDate]);

    return result.rows[0] || null;
}
