import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

const isProduction = process.env.NODE_ENV === 'production';
const requiresSSL = process.env.DATABASE_SSL === 'true' || (isProduction && !process.env.DATABASE_URL?.includes('localhost'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: requiresSSL ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    console.log('Connected to database');
});

pool.on('error', (err) => {
    console.error('Error connecting to database', err);
    process.exit(1);
});


export default {
    query: (text, params) => pool.query(text, params),
    pool
}
