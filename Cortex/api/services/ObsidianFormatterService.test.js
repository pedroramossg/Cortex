import obsidianFormatterService from './ObsidianFormatterService.js';

describe('ObsidianFormatterService Unit Tests', () => {
    describe('sanitizeFilename', () => {
        it('should replace illegal characters with dashes and append .md', () => {
            const rawTitle = 'Meeting: 2026/09/08 *Important*? <Draft> | "Notes"';
            const filename = obsidianFormatterService.sanitizeFilename(rawTitle);

            expect(filename).not.toMatch(/[/\\:*?"<>|]/);
            expect(filename).toBe('Meeting- 2026-09-08 -Important- -Draft- - -Notes-.md');
        });

        it('should handle empty or whitespace title gracefully', () => {
            expect(obsidianFormatterService.sanitizeFilename('')).toBe('Untitled.md');
            expect(obsidianFormatterService.sanitizeFilename('   ')).toBe('Untitled.md');
        });
    });

    describe('buildFrontmatter', () => {
        it('should generate valid YAML frontmatter with metadata', () => {
            const frontmatter = obsidianFormatterService.buildFrontmatter({
                title: 'Sprint 42 Retrospective',
                date: '2026-09-08T20:00:00.000Z',
                status: 'done',
                tags: ['#sprint', 'retro', 'cortex/core'],
                aliases: ['Retro 42', 'Sprint Review']
            });

            expect(frontmatter).toContain('---');
            expect(frontmatter).toContain('title: "Sprint 42 Retrospective"');
            expect(frontmatter).toContain('source: "cortex"');
            expect(frontmatter).toContain('status: "done"');
            expect(frontmatter).toContain('  - sprint');
            expect(frontmatter).toContain('  - retro');
            expect(frontmatter).toContain('  - cortex/core');
            expect(frontmatter).toContain('  - "Retro 42"');
        });
    });

    describe('formatNote', () => {
        it('should return complete structured JSON with clean markdown and obsidianUri', () => {
            const noteData = {
                title: 'Deep Work Session',
                content: 'Reflections on [[Calendar]] integration.\n> [!TIP]\n> Keep modules decoupled.',
                tags: ['productivity', 'deep-work'],
                aliases: ['DW-1'],
                status: 'complete'
            };

            const result = obsidianFormatterService.formatNote(noteData);

            expect(result.title).toBe('Deep Work Session');
            expect(result.filename).toBe('Deep Work Session.md');
            expect(result.markdown).toContain('---');
            expect(result.markdown).toContain('title: "Deep Work Session"');
            expect(result.markdown).toContain('Reflections on [[Calendar]] integration.');
            expect(result.obsidianUri).toContain('obsidian://new?name=Deep%20Work%20Session');
            expect(result.formattingSuggestions).toHaveProperty('wikilinks');
            expect(result.formattingSuggestions.wikilinks.standard).toBe('[[Note Name]]');
            expect(result.formattingSuggestions).toHaveProperty('callouts');
        });

        it('should create a default header if content is empty', () => {
            const result = obsidianFormatterService.formatNote({ title: 'Quick Note' });
            expect(result.markdown).toContain('# Quick Note');
        });
    });

    describe('getFormattingSuggestions', () => {
        it('should provide comprehensive suggestions for wikilinks, callouts, and tasks', () => {
            const suggestions = obsidianFormatterService.getFormattingSuggestions();

            expect(suggestions.wikilinks.alias).toBe('[[Note Name|Custom Display Text]]');
            expect(suggestions.callouts.types).toContain('NOTE');
            expect(suggestions.callouts.types).toContain('TIP');
            expect(suggestions.tasks.pending).toBe('- [ ] To-do item');
        });
    });
});
