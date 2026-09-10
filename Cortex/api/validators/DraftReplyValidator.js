import { z } from 'zod';

export const createDraftReplySchema = z.object({
    threadId: z.string().trim().min(1, "threadId is required").max(100, "threadId is too long"),
    customInstruction: z.string().trim().max(500, "customInstruction cannot exceed 500 characters").optional(),
    createInGmail: z.boolean().default(true)
}).strict();
