import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/db.js";
import { upsertTriagedMessage } from "../models/TriageModel.js";

dotenv.config();

const DEMO_USER = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Pedro Ramos",
    email: "pedro@cortex.dev",
    password: "password123"
};

const DEMO_MESSAGES = [
    {
        id: "msg-demo-high-001",
        threadId: "thread-aws-contract-001",
        sender: "diretoria@cortex.dev",
        recipient: "pedro@cortex.dev",
        subject: "URGENTE: Aprovação de Contrato AWS Enterprise",
        snippet: "Pedro, aguardo aprovação da minuta de renovação até o meio-dia de hoje para evitar suspensão.",
        urgency: "HIGH",
        isApprovalPending: true,
        requiresAction: true,
        receivedAt: new Date(Date.now() - 30 * 60 * 1000) // 30 mins ago
    },
    {
        id: "msg-demo-med-002",
        threadId: "thread-q3-metrics-002",
        sender: "analista@cortex.dev",
        recipient: "pedro@cortex.dev",
        subject: "Alinhamento sobre métricas de performance do Q3",
        snippet: "Segue a planilha atualizada com os dados de retenção e churn para sua revisão.",
        urgency: "MEDIUM",
        isApprovalPending: false,
        requiresAction: true,
        receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    },
    {
        id: "msg-demo-low-003",
        threadId: "thread-github-bullmq-003",
        sender: "notifications@github.com",
        recipient: "pedro@cortex.dev",
        subject: "GitHub: New release published for BullMQ v6",
        snippet: "You are receiving this notification because you subscribed to BullMQ repository updates.",
        urgency: "LOW",
        isApprovalPending: false,
        requiresAction: false,
        receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
    }
];

export async function seed() {
    console.log("🌱 Starting Cortex Database Seed...");

    try {
        // 1. Ensure clean state for demo user email if tied to another ID
        await db.query("DELETE FROM users WHERE email = $1 AND id != $2", [
            DEMO_USER.email,
            DEMO_USER.id
        ]);

        // 2. Hash password & Upsert Demo User
        const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
        await db.query(`
            INSERT INTO users (id, name, email, password_hash)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                updated_at = NOW();
        `, [DEMO_USER.id, DEMO_USER.name, DEMO_USER.email, passwordHash]);

        console.log(`✅ Demo User upserted: ${DEMO_USER.name} <${DEMO_USER.email}> (${DEMO_USER.id})`);

        // 3. Upsert Demo Triaged Messages
        for (const msg of DEMO_MESSAGES) {
            await upsertTriagedMessage({
                id: msg.id,
                userId: DEMO_USER.id,
                threadId: msg.threadId,
                sender: msg.sender,
                recipient: msg.recipient,
                subject: msg.subject,
                snippet: msg.snippet,
                urgency: msg.urgency,
                isApprovalPending: msg.isApprovalPending,
                requiresAction: msg.requiresAction,
                receivedAt: msg.receivedAt
            });
            console.log(`✅ Triaged Message seeded: [${msg.urgency}] "${msg.subject}"`);
        }

        // 4. Generate 30-day session JWT
        const jwtSecret = process.env.JWT_SECRET || "cortex_default_jwt_secret_for_dev_test";
        const token = jwt.sign(
            { id: DEMO_USER.id, email: DEMO_USER.email },
            jwtSecret,
            { expiresIn: "30d" }
        );

        // 5. Output Clean Banner
        console.log("\n================================================================================");
        console.log("🚀 CORTEX DATABASE SEEDED SUCCESSFULLY!");
        console.log("================================================================================");
        console.log("👤 Demo User Credentials:");
        console.log(`   - ID:       ${DEMO_USER.id}`);
        console.log(`   - Name:     ${DEMO_USER.name}`);
        console.log(`   - Email:    ${DEMO_USER.email}`);
        console.log(`   - Password: ${DEMO_USER.password}`);
        console.log("\n📬 Seeded Triaged Messages:");
        console.log("   - [HIGH]   URGENTE: Aprovação de Contrato AWS Enterprise (is_approval_pending: true)");
        console.log("   - [MEDIUM] Alinhamento sobre métricas de performance do Q3 (requires_action: true)");
        console.log("   - [LOW]    GitHub: New release published for BullMQ v6");
        console.log("\n🔑 Ready-to-use Bearer Token (Expires in 30 days):");
        console.log(`Bearer ${token}`);
        console.log("\n🧪 Quick Smoke Test Commands (Execute while api server is running):");
        console.log(`   curl -H "Authorization: Bearer ${token}" http://localhost:3000/briefing/today`);
        console.log(`   curl -H "Authorization: Bearer ${token}" "http://localhost:3000/contacts/context?email=analista@cortex.dev"`);
        console.log("================================================================================\n");

        return { user: DEMO_USER, token };
    } catch (error) {
        console.error("❌ Error seeding database:", error);
        throw error;
    } finally {
        await db.pool.end();
    }
}

// Run automatically when called directly
if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
    seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
