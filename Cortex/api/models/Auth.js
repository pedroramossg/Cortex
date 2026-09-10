import db from "../db/db.js"
import bcrypt from "bcrypt"

export async function createUser({ name, email, password, google_access_token, google_refresh_token }) {
    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 12);
    }

    const result = await db.query(
        "INSERT INTO users (name, email, password_hash, google_access_token, google_refresh_token) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, created_at",
        [name, email, hashedPassword, google_access_token, google_refresh_token]
    );

    return result.rows[0];
}

export async function findByEmail({ email }) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

export async function upsertGoogleUser({ name, email, google_access_token, google_refresh_token }) {
    // If the user already exists, update their tokens. Otherwise, create a new user.
    const result = await db.query(`
        INSERT INTO users (name, email, google_access_token, google_refresh_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) 
        DO UPDATE SET 
            google_access_token = EXCLUDED.google_access_token,
            google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token),
            updated_at = NOW()
        RETURNING id, name, email, created_at;
    `, [name, email, google_access_token, google_refresh_token]);

    return result.rows[0];
}

export async function updateGoogleTokens(userId, { google_access_token, google_refresh_token }) {
    const result = await db.query(`
        UPDATE users 
        SET google_access_token = $1, 
            google_refresh_token = COALESCE($2, google_refresh_token),
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, name, email;
    `, [google_access_token, google_refresh_token, userId]);

    return result.rows[0];
}

export async function findById(id) {
    const result = await db.query(
        "SELECT id, name, email, google_access_token, google_refresh_token, created_at, updated_at FROM users WHERE id = $1",
        [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

export async function clearGoogleTokens(userId) {
    const result = await db.query(`
        UPDATE users 
        SET google_access_token = NULL, 
            google_refresh_token = NULL, 
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, email;
    `, [userId]);

    return result.rows[0];
}