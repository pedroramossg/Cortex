import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.unstable_mockModule('./models/Auth.js', () => ({
    findById: jest.fn().mockResolvedValue({ id: 'user-obsidian-1', email: 'obsidian@cortex.dev' }),
    updateGoogleTokens: jest.fn()
}));

jest.unstable_mockModule('./config/redis.js', () => ({
    default: {
        sendCommand: jest.fn(),
        setEx: jest.fn(),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn(),
        publish: jest.fn()
    }
}));

const { default: app } = await import('./server.js');

describe('Obsidian Integration Tests', () => {
    let validToken;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_jwt_secret_min_32_characters';
        validToken = jwt.sign({ id: 'user-obsidian-1', email: 'obsidian@cortex.dev' }, process.env.JWT_SECRET);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /obsidian/format', () => {
        it('should return 401 if unauthorized', async () => {
            const res = await request(app)
                .post('/obsidian/format')
                .send({ title: 'My Note' });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Authentication required');
        });

        it('should return 400 if title is missing', async () => {
            const res = await request(app)
                .post('/obsidian/format')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ content: 'Just content without title' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toMatch(/Title is required|expected string/);
        });

        it('should return 400 when unmapped properties are sent (Parameter Pollution Defense)', async () => {
            const res = await request(app)
                .post('/obsidian/format')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    title: 'Valid Note',
                    localDiskPath: '/etc/shadow' // malicious disk write attempt
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
        });

        it('should return 200 with sanitized filename, frontmatter, clean markdown and obsidianUri', async () => {
            const notePayload = {
                title: 'Architecture & Security Sync / Review',
                content: 'Reflections on [[Apple Calendar]] and [[Obsidian]] local-first.\n\n> [!NOTE]\n> Zero Trust architecture.\n\n- [ ] Ship PR',
                tags: ['devsecops', 'cortex/core'],
                aliases: ['Arch-Review'],
                status: 'in-progress'
            };

            const res = await request(app)
                .post('/obsidian/format')
                .set('Authorization', `Bearer ${validToken}`)
                .send(notePayload);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.title).toBe('Architecture & Security Sync / Review');
            // Filename must have illegal chars (/ & :) sanitized
            expect(res.body.data.filename).not.toContain('/');
            expect(res.body.data.filename).not.toContain(':');
            expect(res.body.data.filename).toMatch(/\.md$/);

            // Verify clean YAML frontmatter
            expect(res.body.data.frontmatter).toContain('---');
            expect(res.body.data.frontmatter).toContain('source: "cortex"');
            expect(res.body.data.frontmatter).toContain('status: "in-progress"');
            expect(res.body.data.frontmatter).toContain('  - devsecops');
            expect(res.body.data.frontmatter).toContain('  - cortex/core');

            // Verify markdown contains links and callouts
            expect(res.body.data.markdown).toContain('[[Apple Calendar]]');
            expect(res.body.data.markdown).toContain('> [!NOTE]');
            expect(res.body.data.markdown).toContain('- [ ] Ship PR');

            // Verify obsidian:// URI protocol for local Tauri client
            expect(res.body.data.obsidianUri).toMatch(/^obsidian:\/\/new\?name=/);
            expect(res.body.data.obsidianUri).toContain(encodeURIComponent('Architecture & Security Sync / Review'));

            // Verify formatting suggestions are provided
            expect(res.body.data.formattingSuggestions).toHaveProperty('wikilinks');
            expect(res.body.data.formattingSuggestions.wikilinks.standard).toBe('[[Note Name]]');
            expect(res.body.data.formattingSuggestions).toHaveProperty('callouts');
        });
    });

    describe('GET /obsidian/suggestions', () => {
        it('should return 401 if unauthorized', async () => {
            const res = await request(app).get('/obsidian/suggestions');
            expect(res.status).toBe(401);
        });

        it('should return 200 with Obsidian formatting suggestions dictionary', async () => {
            const res = await request(app)
                .get('/obsidian/suggestions')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.wikilinks).toBeDefined();
            expect(res.body.data.embeds).toBeDefined();
            expect(res.body.data.callouts).toBeDefined();
            expect(res.body.data.tasks).toBeDefined();
            expect(res.body.data.styling).toBeDefined();
        });
    });
});
