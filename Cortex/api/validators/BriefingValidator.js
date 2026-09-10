import { z } from 'zod';

export const getBriefingQuerySchema = z.object({
    forceRefresh: z.string().transform(v => v === 'true').optional()
}).strict();
