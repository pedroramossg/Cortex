CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS "users" CASCADE;

CREATE TABLE "users"(
    "id" uuid DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password_hash" VARCHAR(255),
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW(),
    "updated_at" TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "triaged_messages"(
    "id" VARCHAR(255) PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "thread_id" VARCHAR(255) NOT NULL,
    "sender" VARCHAR(255) NOT NULL,
    "recipient" VARCHAR(255),
    "subject" VARCHAR(500) NOT NULL,
    "snippet" TEXT,
    "urgency" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK ("urgency" IN ('HIGH', 'MEDIUM', 'LOW')),
    "is_approval_pending" BOOLEAN NOT NULL DEFAULT FALSE,
    "requires_action" BOOLEAN NOT NULL DEFAULT FALSE,
    "received_at" TIMESTAMP DEFAULT NOW(),
    "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_triaged_user_received" ON "triaged_messages" ("user_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_triaged_user_urgency" ON "triaged_messages" ("user_id", "urgency");
CREATE INDEX IF NOT EXISTS "idx_triaged_user_sender" ON "triaged_messages" ("user_id", "sender");

CREATE TABLE IF NOT EXISTS "daily_briefings"(
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "briefing_date" DATE NOT NULL,
    "first_commitment" JSONB,
    "urgencies" JSONB,
    "pending_approvals" JSONB,
    "stats" JSONB,
    "created_at" TIMESTAMP DEFAULT NOW(),
    UNIQUE ("user_id", "briefing_date")
);