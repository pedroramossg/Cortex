import { getBriefingQuerySchema } from './BriefingValidator.js';
import { getContactContextQuerySchema } from './ContactValidator.js';
import { createDraftReplySchema } from './DraftReplyValidator.js';

describe('Cortex Intelligence Validators Unit Tests', () => {
    describe('BriefingValidator', () => {
        it('should pass with empty query', () => {
            const parsed = getBriefingQuerySchema.parse({});
            expect(parsed).toEqual({});
        });

        it('should transform forceRefresh string to boolean', () => {
            const parsedTrue = getBriefingQuerySchema.parse({ forceRefresh: 'true' });
            expect(parsedTrue.forceRefresh).toBe(true);

            const parsedFalse = getBriefingQuerySchema.parse({ forceRefresh: 'false' });
            expect(parsedFalse.forceRefresh).toBe(false);
        });

        it('should reject extra unrecognized keys (Parameter Pollution)', () => {
            expect(() => getBriefingQuerySchema.parse({ extraParam: 'hack' }))
                .toThrow(/Unrecognized key/);
        });
    });

    describe('ContactValidator', () => {
        it('should pass with valid email', () => {
            const parsed = getContactContextQuerySchema.parse({ email: 'carlos@empresa.com' });
            expect(parsed.email).toBe('carlos@empresa.com');
        });

        it('should reject invalid email format', () => {
            expect(() => getContactContextQuerySchema.parse({ email: 'not-an-email' }))
                .toThrow(/Invalid contact email format/);
        });

        it('should reject parameter pollution', () => {
            expect(() => getContactContextQuerySchema.parse({ email: 'carlos@empresa.com', admin: 'true' }))
                .toThrow(/Unrecognized key/);
        });
    });

    describe('DraftReplyValidator', () => {
        it('should pass with valid threadId and customInstruction', () => {
            const parsed = createDraftReplySchema.parse({
                threadId: '18f2d5e1',
                customInstruction: 'Seja breve e direto'
            });
            expect(parsed.threadId).toBe('18f2d5e1');
            expect(parsed.createInGmail).toBe(true); // default
        });

        it('should reject missing or empty threadId', () => {
            expect(() => createDraftReplySchema.parse({}))
                .toThrow(/threadId is required|expected string/);
            expect(() => createDraftReplySchema.parse({ threadId: '   ' }))
                .toThrow(/threadId is required/);
        });

        it('should reject customInstruction exceeding 500 characters', () => {
            expect(() => createDraftReplySchema.parse({
                threadId: '18f2d5e1',
                customInstruction: 'a'.repeat(501)
            })).toThrow(/cannot exceed 500 characters/);
        });

        it('should reject parameter pollution', () => {
            expect(() => createDraftReplySchema.parse({
                threadId: '18f2d5e1',
                exploitPayload: 'malicious'
            })).toThrow(/Unrecognized key/);
        });
    });
});
