import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import request from 'supertest';
import { sharedAuthMock, sharedRedisMock, resetTestMocks } from './testUtils/setupMocks.js';

// Setup ESM module mocks for Database & Redis
jest.unstable_mockModule('./models/Auth.js', () => sharedAuthMock);
jest.unstable_mockModule('./config/redis.js', () => ({
    default: sharedRedisMock
}));

const mockInsert = jest.fn();
const mockList = jest.fn();
const mockDelete = jest.fn();

jest.unstable_mockModule('googleapis', () => ({
    google: {
        auth: {
            OAuth2: jest.fn().mockImplementation(() => ({
                setCredentials: jest.fn(),
                on: jest.fn()
            }))
        },
        calendar: jest.fn().mockReturnValue({
            events: {
                insert: mockInsert,
                list: mockList,
                delete: mockDelete
            }
        })
    }
}));

const { default: app } = await import('./server.js');
const { parseQuickCalendarEvent, fallbackHeuristicParse } = await import('./services/nlpCalendarService.js');
const { parseQuickEvent, parseQuickEventHeuristic, createAppleCalendarEvent, getCachedDayEvents, clearCalendarCache } = await import('../src/services/calendarApi.js');

describe('Quick Add em Linguagem Natural Suite (NLP, Heurística & API)', () => {
    beforeAll(() => {
        process.env.JWT_SECRET = 'test_jwt_secret_min_32_characters';
    });

    afterEach(() => {
        resetTestMocks();
        clearCalendarCache();
        jest.clearAllMocks();
    });

    describe('1. Micro-Parser Heurístico & Resolução de Datas Futuras', () => {
        const anchorTuesday = '2026-10-06'; // Terça-feira

        it('deve resolver "atividade avaliativa do hélio na quinta" para a quinta-feira da mesma semana', () => {
            const res = fallbackHeuristicParse('atividade avaliativa do hélio na quinta', anchorTuesday);
            expect(res.date).toBe('2026-10-08'); // Quinta-feira
            expect(res.title).toContain('Atividade avaliativa do hélio');
            expect(res.startTime).toBe('09:00');
            expect(res.endTime).toBe('10:00'); // Duração padrão segura de 1h
        });

        it('deve resolver horários explícitos com 1h de duração: "dentista amanhã às 16:30"', () => {
            const res = fallbackHeuristicParse('dentista amanhã às 16:30', anchorTuesday);
            expect(res.date).toBe('2026-10-07'); // Quarta-feira (amanhã)
            expect(res.title).toContain('Dentista');
            expect(res.startTime).toBe('16:30');
            expect(res.endTime).toBe('17:30');
        });

        it('deve projetar para a próxima semana se o dia mencionado já tiver passado na semana corrente', () => {
            const anchorThursday = '2026-10-08'; // Quinta-feira
            // "reunião na terça" a partir de uma quinta-feira deve projetar para a próxima terça (13/10) e nunca para o passado
            const res = fallbackHeuristicParse('reunião na terça', anchorThursday);
            expect(res.date).toBe('2026-10-13');
            expect(res.title).toContain('Reunião');
        });

        it('deve resolver "hoje" mantendo a data âncora', () => {
            const res = fallbackHeuristicParse('alinhamento com tech lead hoje às 14h', anchorTuesday);
            expect(res.date).toBe('2026-10-06');
            expect(res.startTime).toBe('14:00');
            expect(res.endTime).toBe('15:00');
        });
    });

    describe('2. Endpoint HTTP POST /calendar/parse-quick', () => {
        it('deve retornar 200 com evento estruturado ao receber texto válido', async () => {
            const res = await request(app)
                .post('/calendar/parse-quick')
                .send({
                    text: 'reunião com cliente na quinta às 15h',
                    anchorDate: '2026-10-06',
                    dayOfWeek: 'terça-feira',
                    timeZone: 'America/Sao_Paulo'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
            expect(res.body.data.date).toBe('2026-10-08');
            expect(res.body.data.startTime).toBe('15:00');
            expect(res.body.data.endTime).toBe('16:00');
        });

        it('deve retornar 400 se o campo text for omitido ou vazio', async () => {
            const res = await request(app)
                .post('/calendar/parse-quick')
                .send({
                    text: '   '
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('3. Integração Frontend (calendarApi.js)', () => {
        it('parseQuickEventHeuristic deve gerar a mesma estrutura de evento localmente', () => {
            const result = parseQuickEventHeuristic('sprint planning amanhã às 10h', '2026-10-06');
            expect(result.date).toBe('2026-10-07');
            expect(result.startTime).toBe('10:00');
            expect(result.endTime).toBe('11:00');
            expect(result.title).toContain('Sprint planning');
        });

        it('createAppleCalendarEvent deve aplicar 1h de duração padrão e rotear para calendário seguro', async () => {
            const createdId = await createAppleCalendarEvent({
                title: 'Quick Event Test',
                date: '2026-10-08',
                startTime: '14:00',
                endTime: '15:00'
            });

            expect(createdId).toBeDefined();
            const cached = getCachedDayEvents('2026-10-08');
            expect(Array.isArray(cached)).toBe(true);
            expect(cached.length).toBe(1);
            expect(cached[0].title).toBe('Quick Event Test');
            expect(cached[0].duration).toBe('1h');
            expect(cached[0].calendarName).toBeDefined();
        });
    });
});
