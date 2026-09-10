import { google } from 'googleapis';
import calendarService from './CalendarService.js';
import llmService from './LLMService.js';

class DraftReplyService {
    /**
     * Helper to encode RFC 2822 email to base64url
     */
    encodeEmail({ to, from, subject, inReplyTo, references, body, threadId }) {
        const lines = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
            references ? `References: ${references}` : '',
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            '',
            body
        ].filter(Boolean);

        const emailText = lines.join('\r\n');
        return Buffer.from(emailText)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Generate 3 contextual draft reply options and optionally save default in Gmail Drafts
     */
    async generateDraftReplies(user, { threadId, customInstruction, createInGmail = true }) {
        if (!user.google_access_token && !user.google_refresh_token) {
            const error = new Error("Google account not connected. Please authenticate with Google first.");
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        const auth = calendarService.getOAuth2Client(user);
        const gmail = google.gmail({ version: 'v1', auth });

        // 1. Fetch thread details from Gmail
        const threadRes = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'full'
        });

        const messages = threadRes.data.messages || [];
        if (messages.length === 0) {
            const error = new Error("Thread not found or contains no messages.");
            error.statusCode = 404;
            error.isOperational = true;
            throw error;
        }

        // Extract metadata from the first & last message
        const firstMsg = messages[0];
        const lastMsg = messages[messages.length - 1];
        const headers = lastMsg.payload?.headers || firstMsg.payload?.headers || [];

        const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'Sem Assunto';
        const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
        const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id')?.value || '';

        // Determine recipient (the sender of the last incoming message)
        const recipient = fromHeader;
        const replySubject = subjectHeader.toLowerCase().startsWith('re:') ? subjectHeader : `Re: ${subjectHeader}`;

        // Build thread history context
        const threadContextLines = messages.map(m => {
            const mHeaders = m.payload?.headers || [];
            const sender = mHeaders.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
            return `From: ${sender}\nSnippet: ${m.snippet}\n`;
        });
        const threadContext = `Subject: ${subjectHeader}\nRecipient: ${recipient}\n\n${threadContextLines.join('\n---\n')}`;

        // 2. Call LLM to generate 3 reply options
        const aiDrafts = await llmService.generateDraftReplies({
            threadContext,
            customInstruction,
            userName: user.name || 'Pedro'
        });

        let createdDraftId = null;

        // 3. Native Gmail Draft Injection (if createInGmail is true)
        if (createInGmail && aiDrafts.options && aiDrafts.options.length > 0) {
            try {
                const primaryOption = aiDrafts.options[0];
                const rawBase64 = this.encodeEmail({
                    to: recipient,
                    from: user.email,
                    subject: replySubject,
                    inReplyTo: messageIdHeader,
                    references: messageIdHeader,
                    body: primaryOption.body,
                    threadId
                });

                const draftRes = await gmail.users.drafts.create({
                    userId: 'me',
                    requestBody: {
                        message: {
                            threadId,
                            raw: rawBase64
                        }
                    }
                });

                createdDraftId = draftRes.data.id;
            } catch (draftErr) {
                console.warn('[DraftReplyService] Native Gmail draft creation non-blocking error:', draftErr.message);
            }
        }

        return {
            threadId,
            subject: replySubject,
            recipient,
            createdDraftId,
            options: aiDrafts.options
        };
    }
}

export default new DraftReplyService();
