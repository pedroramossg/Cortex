import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
    const client = await pool.connect();

    try {
        console.log('Running migrations...');
        const currentDir = path.dirname(new URL(import.meta.url).pathname);
        const schemaPath = path.join(currentDir, 'db', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await client.query(schemaSql)

        console.log('Migrations completed');

    } catch (err) {
        console.log(err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();

