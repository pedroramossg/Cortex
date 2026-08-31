import db from "../db/db.js"
import bcrypt from "bcrypt"

export async function createUser({ name, email, password }) {
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await db.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
        [name, email, hashedPassword]);

    return result.rows[0];

}

export async function findByEmail({ email }) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) return null;

    return result.rows[0];
}