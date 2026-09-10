class ObsidianFormatterService {
    /**
     * Sanitizes a title into a safe filename (no / \ : * ? " < > | \0 characters)
     * @param {string} title 
     * @returns {string} Safe filename with .md extension
     */
    sanitizeFilename(title) {
        if (!title || typeof title !== 'string' || !title.trim()) {
            return 'Untitled.md';
        }
        // Remove or replace illegal characters on Windows/macOS/Linux
        const safe = title
            .trim()
            .replace(/[/\\:*?"<>|\x00-\x1F]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/-+/g, '-')
            .slice(0, 100);

        return `${safe || 'Untitled'}.md`;
    }

    /**
     * Builds structured YAML frontmatter string
     * @param {Object} metadata 
     * @returns {string}
     */
    buildFrontmatter(metadata = {}) {
        const lines = ['---'];

        if (metadata.title) {
            lines.push(`title: "${metadata.title.replace(/"/g, '\\"')}"`);
        }

        lines.push(`date: "${metadata.date || new Date().toISOString()}"`);
        lines.push('source: "cortex"');

        if (metadata.status) {
            lines.push(`status: "${metadata.status}"`);
        }

        if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
            lines.push('tags:');
            metadata.tags.forEach(tag => {
                const cleanTag = tag.replace(/^#/, '').trim();
                if (cleanTag) lines.push(`  - ${cleanTag}`);
            });
        }

        if (Array.isArray(metadata.aliases) && metadata.aliases.length > 0) {
            lines.push('aliases:');
            metadata.aliases.forEach(alias => {
                const cleanAlias = alias.trim();
                if (cleanAlias) lines.push(`  - "${cleanAlias.replace(/"/g, '\\"')}"`);
            });
        }

        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Formats an Obsidian note with frontmatter, markdown structure, and URI helper.
     * Note: This service runs in AWS EC2 cloud and DOES NOT touch the local disk.
     */
    formatNote({ title, content = '', tags = [], aliases = [], status }) {
        const sanitizedTitle = title.trim();
        const filename = this.sanitizeFilename(sanitizedTitle);
        const frontmatter = this.buildFrontmatter({
            title: sanitizedTitle,
            tags,
            aliases,
            status
        });

        const markdown = `${frontmatter}\n\n${content.trim() ? content.trim() : '# ' + sanitizedTitle}\n`;

        // Generate standard obsidian:// URI protocol for quick opening/creation
        const obsidianUri = `obsidian://new?name=${encodeURIComponent(sanitizedTitle)}&content=${encodeURIComponent(markdown)}`;

        return {
            title: sanitizedTitle,
            filename,
            frontmatter,
            markdown,
            obsidianUri,
            formattingSuggestions: this.getFormattingSuggestions()
        };
    }

    /**
     * Comprehensive Obsidian Markdown formatting guide and syntax hints
     */
    getFormattingSuggestions() {
        return {
            wikilinks: {
                standard: "[[Note Name]]",
                alias: "[[Note Name|Custom Display Text]]",
                section: "[[Note Name#Header Title]]",
                block: "[[Note Name#^block-id]]",
                description: "Creates internal bidirectional links between notes in your vault"
            },
            embeds: {
                note: "![[Note Name]]",
                image: "![[attachment.png]]",
                pdf: "![[document.pdf#page=3]]",
                description: "Embeds another note, image, or document directly into the note"
            },
            callouts: {
                syntax: "> [!NOTE] Optional Title\n> Content inside callout",
                types: ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION", "SUCCESS", "QUESTION", "SUMMARY"],
                description: "Obsidian visual alert blocks with custom icons and coloring"
            },
            tags: {
                simple: "#project",
                nested: "#work/cortex/sprint1",
                description: "Categorize notes. Avoid spaces inside tags"
            },
            tasks: {
                pending: "- [ ] To-do item",
                completed: "- [x] Completed item",
                description: "Interactive task checklists rendered by Obsidian and dataview"
            },
            styling: {
                highlight: "==highlighted text==",
                bold: "**bold text**",
                italic: "*italic text*",
                strikethrough: "~~strikethrough~~",
                footnote: "Here is a footnote[^1]\n[^1]: Reference text"
            }
        };
    }
}

export default new ObsidianFormatterService();
