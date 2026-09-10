import { z } from 'zod';

export const getContactContextQuerySchema = z.object({
    email: z.string().trim().email("Invalid contact email format").max(255, "Email is too long")
}).strict();
