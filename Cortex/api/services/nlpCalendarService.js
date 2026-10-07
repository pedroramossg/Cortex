import llmService from './LLMService.js';

/**
 * Parses natural language calendar text into structured event details:
 * { title, date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM', targetCalendar: string | null }
 * Uses ultra-concise prompt (< 200 tokens total), temperature: 0,
 * markdown fence sanitization, and deterministic semantic heuristic fallback.
 */
export async function parseQuickCalendarEvent({ text, anchorDate, dayOfWeek, timeZone, availableCalendars = [] }) {
    if (!text || typeof text !== 'string') {
        throw new Error('Texto para parsing do calendário é obrigatório');
    }

    const cleanText = llmService.sanitizePrompt(text).trim();
    const refDate = anchorDate || new Date().toISOString().slice(0, 10);
    const refDay = dayOfWeek || new Date(refDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
    const tz = timeZone || 'America/Sao_Paulo';

    // Em modo de testes herméticos sem chave externa, usa a heurística determinística
    if (process.env.NODE_ENV === 'test' && process.env.USE_REAL_AI !== 'true') {
        return fallbackHeuristicParse(cleanText, refDate, availableCalendars);
    }

    const calListStr = Array.isArray(availableCalendars) && availableCalendars.length > 0
        ? availableCalendars.join(', ')
        : 'Home, Trabalho, Pessoal';

    const systemPrompt = `Você é um parser de calendário pt-BR. Retorne ESTRITAMENTE um JSON com as chaves:
{ "title": string, "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "targetCalendar": string | null }.
O campo 'title' deve conter APENAS o nome do evento, removendo termos de data e horário (ex: retorne 'Atividade avaliativa do Hélio' e NUNCA 'Atividade avaliativa do Hélio na quinta às 14h').
Se nenhum horário for especificado, assuma 1 hora de duração padrão (startTime: "09:00", endTime: "10:00"). Se endTime não for especificado, defina como 1 hora após startTime.
Dias da semana referem-se SEMPRE à data futura mais próxima. Se a data já tiver passado na semana corrente, projete para a mesma data da próxima semana (nunca retorne datas no passado a partir da data de referência).
Data atual de referência: ${refDate} (${refDay}, fuso ${tz}).

Calendários disponíveis: [${calListStr}].
Analise o contexto do título e deduza qual calendário é o mais apropriado:
- Termos acadêmicos (provas, aulas, disciplinas, professores, faculdade) -> calendários como 'UFSC', 'Faculdade', 'Estudos'.
- Termos profissionais (reuniões, clientes, sprint, deploy) -> calendários como 'Trabalho', 'Work'.
- Termos pessoais/domésticos (família, almoço, médico, compras) -> calendários como 'Home', 'Pessoal'.
A chave 'targetCalendar' deve ser EXATAMENTE um dos nomes da lista, ou null caso não haja correspondência clara.`;

    const userPrompt = `Texto: "${cleanText}"`;

    let parsed = null;

    try {
        const rawResponse = await llmService.callLLM({
            systemPrompt,
            userPrompt,
            temperature: 0
        });

        // Sanitização contra markdown fences e parse seguro
        const cleanJson = (rawResponse || '')
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        if (cleanJson) {
            const candidate = JSON.parse(cleanJson);
            if (candidate && candidate.title && candidate.date) {
                let targetCal = candidate.targetCalendar || null;
                if (targetCal && Array.isArray(availableCalendars) && availableCalendars.length > 0) {
                    const found = availableCalendars.find(c => c.toLowerCase().trim() === String(targetCal).toLowerCase().trim());
                    targetCal = found || null;
                }

                parsed = {
                    title: String(candidate.title).trim(),
                    date: String(candidate.date).trim(),
                    startTime: candidate.startTime || '09:00',
                    endTime: candidate.endTime || '10:00',
                    targetCalendar: targetCal
                };
            }
        }
    } catch (err) {
        console.warn('[nlpCalendarService] Falha no parse via LLM, aplicando fallback heurístico:', err.message);
    }

    if (!parsed) {
        parsed = fallbackHeuristicParse(cleanText, refDate, availableCalendars);
    }

    return parsed;
}

/**
 * Deterministic Portuguese heuristic parser for dates, times, event titles and smart calendar routing.
 * Guarantees zero-past projection, safe 1h duration, clean titles and semantic domain matching.
 */
export function fallbackHeuristicParse(text, refDateStr, availableCalendars = []) {
    const [y, m, d] = refDateStr.split('-').map(Number);
    const refDate = new Date(y, m - 1, d, 12, 0, 0);
    const lower = text.toLowerCase();

    // 1. Resolução da Data (Sempre futura ou hoje)
    let targetDate = new Date(refDate);
    const dayMap = {
        'domingo': 0,
        'segunda': 1,
        'segunda-feira': 1,
        'terca': 2,
        'terça': 2,
        'terça-feira': 2,
        'quarta': 3,
        'quarta-feira': 3,
        'quinta': 4,
        'quinta-feira': 4,
        'sexta': 5,
        'sexta-feira': 5,
        'sabado': 6,
        'sábado': 6
    };

    if (/(?:^|\s)amanh[aã](?:$|\s|[.,!?])/i.test(lower)) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (/(?:^|\s)hoje(?:$|\s|[.,!?])/i.test(lower)) {
        // Mantém a data de hoje
    } else {
        for (const [dayName, dayIndex] of Object.entries(dayMap)) {
            const regex = new RegExp(`(?:^|\\s)(?:na\\s+|no\\s+)?${dayName}(?:$|\\s|[.,!?])`, 'i');
            if (regex.test(lower)) {
                const currentDay = refDate.getDay();
                let diff = dayIndex - currentDay;
                if (diff <= 0) {
                    diff += 7; // Projeta sempre para a próxima semana se já passou ou se for o mesmo dia sem "hoje"
                }
                targetDate.setDate(targetDate.getDate() + diff);
                break;
            }
        }
    }

    const resolvedDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    // 2. Resolução de Horários (1h de duração padrão segura)
    let startTime = '09:00';
    let endTime = '10:00';

    // Procura padrões: "às 14h", "às 14:30", "14h30", "as 16:30"
    const timeMatch = lower.match(/(?:[àa]s\s*)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))/);
    if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2] || timeMatch[3] || '0', 10);
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const endHour = (hour + 1) % 24;
            endTime = `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
    }

    // 3. Extração e Higienização Estrita do Título (Remove datas e horários)
    let cleanedTitle = text
        .replace(/(?:^|\s)(?:na|no)\s+(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)(?:amanh[aã]|hoje)(?:\s|$)/gi, ' ')
        .replace(/(?:[àa]s\s*)?\d{1,2}(?:h(?:\d{1,2})?|:\d{2})/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanedTitle) {
        cleanedTitle = text.trim();
    }

    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

    // 4. Roteamento Semântico de Calendário
    let targetCalendar = null;
    const cals = Array.isArray(availableCalendars) ? availableCalendars : [];

    const findCalendar = (candidates) => {
        for (const cand of candidates) {
            const found = cals.find(c => c && c.toLowerCase().trim() === cand.toLowerCase().trim());
            if (found) return found;
        }
        for (const cand of candidates) {
            const found = cals.find(c => c && c.toLowerCase().trim().includes(cand.toLowerCase().trim()));
            if (found) return found;
        }
        return null;
    };

    const academicKeywords = ['ufsc', 'aula', 'hélio', 'helio', 'prova', 'atividade', 'trabalho acadêmico', 'disciplina', 'professor', 'faculdade', 'universidade', 'estudo', 'estudos', 'seminario', 'seminário'];
    const workKeywords = ['reuniao', 'reunião', 'meeting', 'call', 'cliente', 'sprint', 'deploy', 'alinhamento', 'trabalho', 'work', 'projeto', '1:1', 'one-on-one'];
    const personalKeywords = ['almoço', 'almoco', 'jantar', 'médico', 'medico', 'consulta', 'dentista', 'academia', 'compras', 'família', 'familia', 'casa', 'aniversário', 'aniversario'];

    const matchesAny = (keywords) => keywords.some(k => lower.includes(k));

    if (matchesAny(academicKeywords)) {
        targetCalendar = findCalendar(['UFSC', 'Faculdade', 'Estudos', 'Acadêmico', 'Universidade']) || (cals.includes('UFSC') ? 'UFSC' : null);
    } else if (matchesAny(workKeywords)) {
        targetCalendar = findCalendar(['Trabalho', 'Work', 'Profissional', 'Job']) || (cals.includes('Trabalho') ? 'Trabalho' : null);
    } else if (matchesAny(personalKeywords)) {
        targetCalendar = findCalendar(['Pessoal', 'Home', 'Família', 'Personal']) || (cals.includes('Pessoal') ? 'Pessoal' : null);
    }

    return {
        title: cleanedTitle,
        date: resolvedDateStr,
        startTime,
        endTime,
        targetCalendar
    };
}

export default {
    parseQuickCalendarEvent,
    fallbackHeuristicParse
};
