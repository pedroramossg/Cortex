import obsidianFormatterService from '../services/ObsidianFormatterService.js';

/**
 * Format note endpoint:
 * Sanitizes input, builds YAML frontmatter, generates clean Obsidian markdown,
 * and produces the obsidian:// URI. 
 * NOTE: The backend NEVER writes files to disk, upholding Local-First sovereignty 
 * for the Tauri client.
 */
export const formatNote = async (req, res, next) => {
    try {
        const formatted = obsidianFormatterService.formatNote(req.body);

        return res.status(200).json({
            success: true,
            message: 'Note formatted successfully',
            data: formatted
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Returns Obsidian formatting suggestions and syntax guide
 */
export const getSuggestions = async (req, res, next) => {
    try {
        const suggestions = obsidianFormatterService.getFormattingSuggestions();

        return res.status(200).json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        next(error);
    }
};
