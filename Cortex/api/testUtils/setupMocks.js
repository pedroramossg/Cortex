import { jest } from '@jest/globals';

const defaultUsers = () => ({
    'user-intel-1': {
        id: 'user-intel-1',
        name: 'Pedro Ramos',
        email: 'pedro@cortex.dev',
        google_access_token: 'valid_access_token',
        google_refresh_token: 'valid_refresh_token'
    },
    'user-calendar-1': {
        id: 'user-calendar-1',
        name: 'Tech Lead',
        email: 'techlead@cortex.dev',
        google_access_token: 'valid_access_token',
        google_refresh_token: 'valid_refresh_token'
    },
    'user-calendar-2': {
        id: 'user-calendar-2',
        name: 'No Tokens User',
        email: 'notokens@cortex.dev',
        google_access_token: null,
        google_refresh_token: null
    },
    'user-obsidian-1': {
        id: 'user-obsidian-1',
        name: 'Obsidian User',
        email: 'obsidian@cortex.dev',
        google_access_token: 'valid_access_token',
        google_refresh_token: 'valid_refresh_token'
    },
    'user-google-1': {
        id: 'user-google-1',
        name: 'Google User',
        email: 'user@cortex.dev',
        google_access_token: 'google_access_token_xyz',
        google_refresh_token: 'google_refresh_token_abc'
    },
    '00000000-0000-0000-0000-000000000001': {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Pedro Ramos',
        email: 'pedro@cortex.dev',
        google_access_token: 'valid_access_token',
        google_refresh_token: 'valid_refresh_token'
    }
});

export const testRedisStore = new Map();
export const mockUsers = defaultUsers();

export const resetTestMocks = () => {
    testRedisStore.clear();
    const fresh = defaultUsers();
    Object.keys(mockUsers).forEach(k => delete mockUsers[k]);
    Object.assign(mockUsers, fresh);
};

export const sharedRedisMock = {
    sendCommand: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockImplementation(async (key, ttl, val) => {
        testRedisStore.set(key, val);
        return 'OK';
    }),
    set: jest.fn().mockImplementation(async (key, val) => {
        testRedisStore.set(key, val);
        return 'OK';
    }),
    get: jest.fn().mockImplementation(async (key) => {
        return testRedisStore.get(key) || null;
    }),
    del: jest.fn().mockImplementation(async (keys) => {
        if (Array.isArray(keys)) {
            keys.forEach(k => testRedisStore.delete(k));
            return keys.length;
        }
        return testRedisStore.delete(keys) ? 1 : 0;
    }),
    keys: jest.fn().mockImplementation(async (pattern) => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(testRedisStore.keys()).filter(k => regex.test(k));
    }),
    publish: jest.fn().mockResolvedValue(1)
};

export const sharedAuthMock = {
    createUser: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn().mockImplementation(async (id) => {
        return mockUsers[id] ? { ...mockUsers[id] } : null;
    }),
    upsertGoogleUser: jest.fn().mockImplementation(async ({ name, email, google_access_token, google_refresh_token }) => ({
        id: 'new-user-id',
        name,
        email,
        google_access_token,
        google_refresh_token
    })),
    updateGoogleTokens: jest.fn().mockImplementation(async (id, tokens) => {
        if (mockUsers[id]) Object.assign(mockUsers[id], tokens);
        return mockUsers[id] ? { ...mockUsers[id] } : null;
    }),
    clearGoogleTokens: jest.fn().mockImplementation(async (id) => {
        if (mockUsers[id]) {
            mockUsers[id].google_access_token = null;
            mockUsers[id].google_refresh_token = null;
        }
        return mockUsers[id] ? { ...mockUsers[id] } : null;
    })
};
