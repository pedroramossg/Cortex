import { z } from 'zod';

export const formatNoteSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(255, "Title must not exceed 255 characters"),
    content: z.string().max(100000, "Content must not exceed 100000 characters").default(""),
    tags: z.array(
        z.string()
            .trim()
            .regex(/^[a-zA-Z0-9_\-\/]+$/, "Tags must contain only alphanumeric characters, underscores, hyphens, or slashes (no spaces)")
            .max(50, "Tag must not exceed 50 characters")
    ).max(50, "Max 50 tags allowed").optional(),
    aliases: z.array(
        z.string().trim().min(1).max(100, "Alias must not exceed 100 characters")
    ).max(50, "Max 50 aliases allowed").optional(),
    status: z.string().trim().max(50).optional()
}).strict();
