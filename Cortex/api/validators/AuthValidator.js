import { z } from 'zod';

export const registerSchema = z.object({
    name: z.string().min(1, "Name is required").max(255, "Name is too long"),
    email: z.string().email("Invalid email format").max(255, "Email is too long"),
    password: z.string().min(6, "Password must be at least 6 characters").max(255, "Password is too long")
}).strict(); // strict() ensures that any unmapped property sent by an attacker returns a 400 Bad Request

export const loginSchema = z.object({
    email: z.string().email("Invalid email format").max(255, "Email is too long"),
    password: z.string().min(1, "Password is required").max(255, "Password is too long")
}).strict();
