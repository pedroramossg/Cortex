import dotenv from 'dotenv';
dotenv.config();

class LLMService {
    constructor() {
        this.provider = process.env.AI_PROVIDER || 'gemini';
        this.model = process.env.AI_MODEL || (this.provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
    }

    /**
     * Sanitize prompt content by redacting tokens, keys, and credentials
     */
    sanitizePrompt(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]')
            .replace(/(eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)/g, '[JWT_REDACTED]')
            .replace(/(password|secret|api_key|token)\s*[:=]\s*["']?[^"'\s]+["']?/gi, '$1: [REDACTED]');
    }

    /**
     * Generate 3 contextual reply options for an email thread
     */
    async generateDraftReplies({ threadContext, customInstruction, userName = 'Pedro' }) {
        const sanitizedContext = this.sanitizePrompt(threadContext);
        const userPrompt = `
Context of the email thread:
${sanitizedContext}

${customInstruction ? `User specific guidance: "${customInstruction}"` : ''}

Generate 3 distinct, assertive email reply options in Portuguese (as the user "${userName}"):
1. Intent "confirm": Confirmation, agreement, acceptance, or scheduling confirmation.
2. Intent "reschedule": Polite decline, postponement, or alternate time proposal.
3. Intent "clarify": Constructive request for more details, clarification, or attachments.

Return ONLY a valid JSON object matching this structure:
{
  "options": [
    {
      "intent": "confirm",
      "label": "Short button label (e.g. Confirmar Reunião)",
      "subject": "Email Subject",
      "body": "Complete email body text formatted nicely"
    },
    {
      "intent": "reschedule",
      "label": "Short button label (e.g. Propor Novo Horário)",
      "subject": "Email Subject",
      "body": "Complete email body text formatted nicely"
    },
    {
      "intent": "clarify",
      "label": "Short button label (e.g. Solicitar Detalhes)",
      "subject": "Email Subject",
      "body": "Complete email body text formatted nicely"
    }
  ]
}
`;

        const responseText = await this.callLLM({
            systemPrompt: "You are Cortex, an executive AI assistant specialized in fast, high-impact business communication.",
            userPrompt
        });

        try {
            // Clean markdown blocks if returned
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed.options) && parsed.options.length >= 3) {
                return parsed;
            }
        } catch (e) {
            console.warn('[LLMService] JSON parsing failed, using heuristic fallback:', e.message);
        }

        // Fallback default reply options
        return {
            options: [
                {
                    intent: 'confirm',
                    label: 'Confirmar e Avançar',
                    subject: 'Re: Alinhamento',
                    body: `Olá,\n\nDe acordo com os pontos apresentados. Vamos avançar conforme combinado!\n\nAbraços,\n${userName}`
                },
                {
                    intent: 'reschedule',
                    label: 'Reagendar Horário',
                    subject: 'Re: Alinhamento',
                    body: `Olá,\n\nObrigado pelo contato. Minha agenda está comprometida neste momento. Poderíamos verificar uma nova data na próxima semana?\n\nAbraços,\n${userName}`
                },
                {
                    intent: 'clarify',
                    label: 'Pedir Mais Detalhes',
                    subject: 'Re: Alinhamento',
                    body: `Olá,\n\nPoderia por favor compartilhar mais detalhes e o material de apoio antes de alinharmos os próximos passos?\n\nObrigado,\n${userName}`
                }
            ]
        };
    }

    /**
     * Synthesize Pre-Meeting Contact Dossier
     */
    async generateContactDossier({ contactEmail, upcomingMeetings = [], recentThreads = [] }) {
        const sanitizedEmail = this.sanitizePrompt(contactEmail);
        const contextStr = this.sanitizePrompt(JSON.stringify({
            contact: sanitizedEmail,
            upcomingMeetings,
            recentThreads
        }));

        const userPrompt = `
Analyze the past interactions and upcoming schedule with contact "${sanitizedEmail}":
${contextStr}

Generate a concise executive dossier in Portuguese with:
- relationship_summary: 1-2 sentences summarizing who this person is and the working dynamic.
- last_interaction_summary: Summary of the last topic discussed and date.
- open_action_items: Array of 1-3 pending deliverables, approvals, or unanswered questions.
- talking_points: Array of 2-3 strategic topics to discuss in the upcoming meeting.

Return ONLY a valid JSON object matching this schema:
{
  "relationship_summary": "string",
  "last_interaction_summary": "string",
  "open_action_items": ["string"],
  "talking_points": ["string"]
}
`;

        const responseText = await this.callLLM({
            systemPrompt: "You are Cortex, an executive intelligence assistant preparing a CEO/leader for an upcoming meeting.",
            userPrompt
        });

        try {
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            console.warn('[LLMService] Dossier parsing fallback:', e.message);
            return {
                relationship_summary: `Contato frequente identificado através de interações no Gmail e Calendar (${sanitizedEmail}).`,
                last_interaction_summary: recentThreads.length > 0 ? recentThreads[0].subject : 'Sem interações recentes registradas.',
                open_action_items: ['Alinhar pendências e próximos passos durante a conversa.'],
                talking_points: ['Status das entregas em andamento', 'Alinhamento de prioridades da semana']
            };
        }
    }

    /**
     * Core execution driver supporting Gemini (default) and OpenAI
     */
    async callLLM({ systemPrompt, userPrompt }) {
        if (process.env.NODE_ENV === 'test' && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
            // Return mock JSON in test environment if no real keys
            return JSON.stringify({
                options: [
                    { intent: 'confirm', label: 'Confirmar', subject: 'Re: Test', body: 'Confirmado!' },
                    { intent: 'reschedule', label: 'Reagendar', subject: 'Re: Test', body: 'Reagendar para próxima semana.' },
                    { intent: 'clarify', label: 'Pedir Detalhes', subject: 'Re: Test', body: 'Mais informações, por favor.' }
                ],
                relationship_summary: 'Parceiro chave de desenvolvimento e tecnologia.',
                last_interaction_summary: 'Discussão sobre arquitetura do backend.',
                open_action_items: ['Aprovação de PR'],
                talking_points: ['Prazos do sprint']
            });
        }

        if (this.provider === 'gemini' && process.env.GEMINI_API_KEY) {
            return await this.callGemini({ systemPrompt, userPrompt });
        } else if (process.env.OPENAI_API_KEY) {
            return await this.callOpenAI({ systemPrompt, userPrompt });
        }

        // Return deterministic mock if no external key is configured in dev
        return JSON.stringify({
            options: [
                { intent: 'confirm', label: 'Confirmar', subject: 'Re: Alinhamento', body: 'Perfeito, vamos em frente!' },
                { intent: 'reschedule', label: 'Reagendar', subject: 'Re: Alinhamento', body: 'Podemos verificar para amanhã?' },
                { intent: 'clarify', label: 'Mais Detalhes', subject: 'Re: Alinhamento', body: 'Poderia me enviar os detalhes?' }
            ],
            relationship_summary: `Interlocutor relevante da organização (${userPrompt.slice(0, 30)}...).`,
            last_interaction_summary: 'Troca recente de mensagens operacionais.',
            open_action_items: ['Concluir revisão pendente'],
            talking_points: ['Prioridades estratégicas']
        });
    }

    async callGemini({ systemPrompt, userPrompt }) {
        const apiKey = process.env.GEMINI_API_KEY;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

        const payload = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    parts: [{ text: userPrompt }]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.2
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API error (${response.status}): ${errBody}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    async callOpenAI({ systemPrompt, userPrompt }) {
        const apiKey = process.env.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        const payload = {
            model: this.model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '{}';
    }
}

export default new LLMService();
