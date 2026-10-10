import { jest } from '@jest/globals';
import { 
  resolveNotificationTag as getSingleTag,
  parseStoredCredentials,
  RENEWAL_BUFFER_SECONDS,
  GOOGLE_TOKEN_URL,
  GMAIL_PROFILE_URL,
  gmailApi 
} from '../src/services/gmailApi.js';

describe('Inbox Integration & Tag Priority Tests', () => {
  describe('NotificationCard getSingleTag Priority Logic', () => {
    test('Urgente takes strict priority over Ação and Pendente', () => {
      const tag = getSingleTag('HIGH', true, true);
      expect(tag).not.toBeNull();
      expect(tag.label).toBe('Urgente');
    });

    test('Ação takes priority over Pendente when urgency is not HIGH', () => {
      const tag = getSingleTag('MEDIUM', true, true);
      expect(tag).not.toBeNull();
      expect(tag.label).toBe('Ação');
    });

    test('Pendente is selected when only isApprovalPending is true', () => {
      const tag = getSingleTag('LOW', false, true);
      expect(tag).not.toBeNull();
      expect(tag.label).toBe('Pendente');
    });

    test('Returns null when no condition matches', () => {
      const tag = getSingleTag('LOW', false, false);
      expect(tag).toBeNull();
    });
  });

  describe('OAuth 2.0 Credential Parsing & URL Generation', () => {
    test('parseStoredCredentials parses structured JSON string correctly', () => {
      const jsonStr = JSON.stringify({
        access_token: 'ya29.test',
        refresh_token: '1//refresh.test',
        expires_at: 1728564000,
        client_id: 'client-123.apps.googleusercontent.com',
        client_secret: 'GOCSPX-secret',
        email: 'user@cortex.ai',
      });

      const creds = parseStoredCredentials(jsonStr);
      expect(creds).not.toBeNull();
      expect(creds.access_token).toBe('ya29.test');
      expect(creds.refresh_token).toBe('1//refresh.test');
      expect(creds.expires_at).toBe(1728564000);
      expect(creds.client_id).toBe('client-123.apps.googleusercontent.com');
      expect(creds.client_secret).toBe('GOCSPX-secret');
      expect(creds.email).toBe('user@cortex.ai');
    });

    test('parseStoredCredentials gracefully handles legacy raw token string', () => {
      const raw = 'ya29.legacy_plain_string_token';
      const creds = parseStoredCredentials(raw);
      expect(creds).not.toBeNull();
      expect(creds.access_token).toBe('ya29.legacy_plain_string_token');
      expect(creds.refresh_token).toBeNull();
      expect(creds.expires_at).toBeNull();
    });

    test('parseStoredCredentials returns null for empty or null input', () => {
      expect(parseStoredCredentials(null)).toBeNull();
      expect(parseStoredCredentials('')).toBeNull();
    });

    test('buildAuthUrl generates Google OAuth consent URL with offline access and consent prompt', () => {
      const url = gmailApi.buildAuthUrl({ clientId: 'test-client-id' });
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
      expect(url).toContain('response_type=code');
      expect(url).toContain('gmail.readonly');
    });

    test('buildAuthUrl throws error if clientId is missing', () => {
      expect(() => gmailApi.buildAuthUrl({ clientId: '' })).toThrow();
    });
  });

  describe('OAuth 2.0 Continuous Token Renewal & In-Flight Memoization', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      jest.clearAllMocks();
    });

    test('ensureValidToken returns cached token when expiration is well beyond 5-minute buffer', async () => {
      const futureExpiresAt = Math.floor(Date.now() / 1000) + 1800; // 30 min no futuro
      const stored = {
        access_token: 'active-cached-token',
        refresh_token: 'refresh-token-123',
        expires_at: futureExpiresAt,
        client_id: 'client-id',
        client_secret: 'client-secret',
        email: 'user@cortex.ai',
      };

      jest.spyOn(gmailApi, 'getStoredCredentials').mockResolvedValue(stored);
      global.fetch = jest.fn();

      const token = await gmailApi.ensureValidToken();
      expect(token).toBe('active-cached-token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('ensureValidToken proactively renews token when within 5-minute (300s) buffer', async () => {
      const nearExpiresAt = Math.floor(Date.now() / 1000) + 120; // Apenas 2 minutos restantes (< 300s)
      const stored = {
        access_token: 'old-expiring-token',
        refresh_token: 'refresh-token-123',
        expires_at: nearExpiresAt,
        client_id: 'client-id',
        client_secret: 'client-secret',
        email: 'user@cortex.ai',
      };

      jest.spyOn(gmailApi, 'getStoredCredentials').mockResolvedValue(stored);
      const saveSpy = jest.spyOn(gmailApi, 'saveOAuthCredentials').mockResolvedValue(true);

      global.fetch = jest.fn().mockImplementation((url) => {
        if (url === GOOGLE_TOKEN_URL) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'fresh-new-token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
          });
        }
        return Promise.reject(new Error('Unexpected URL ' + url));
      });

      const token = await gmailApi.ensureValidToken();
      expect(token).toBe('fresh-new-token');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'fresh-new-token',
          refresh_token: 'refresh-token-123',
        })
      );
    });

    test('concurrent renewal calls deduplicate into single in-flight request (memoization)', async () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 10; // Expirado
      const stored = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token-123',
        expires_at: expiredAt,
        client_id: 'client-id',
        client_secret: 'client-secret',
        email: 'user@cortex.ai',
      };

      jest.spyOn(gmailApi, 'getStoredCredentials').mockResolvedValue(stored);
      jest.spyOn(gmailApi, 'saveOAuthCredentials').mockResolvedValue(true);

      let fetchCallCount = 0;
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url === GOOGLE_TOKEN_URL) {
          fetchCallCount++;
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  access_token: 'deduped-token',
                  expires_in: 3600,
                }),
              });
            }, 20);
          });
        }
        return Promise.reject(new Error('Unexpected URL ' + url));
      });

      // Três chamadas simultâneas
      const [res1, res2, res3] = await Promise.all([
        gmailApi.refreshAccessToken(stored),
        gmailApi.refreshAccessToken(stored),
        gmailApi.refreshAccessToken(stored),
      ]);

      expect(fetchCallCount).toBe(1);
      expect(res1.accessToken).toBe('deduped-token');
      expect(res2.accessToken).toBe('deduped-token');
      expect(res3.accessToken).toBe('deduped-token');
    });

    test('connectWithRefreshToken validates credentials and fetches user profile', async () => {
      const saveSpy = jest.spyOn(gmailApi, 'saveOAuthCredentials').mockResolvedValue(true);

      global.fetch = jest.fn().mockImplementation((url) => {
        if (url === GOOGLE_TOKEN_URL) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'new-valid-access-token',
              expires_in: 3600,
            }),
          });
        }
        if (url === GMAIL_PROFILE_URL) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              emailAddress: 'pedro@cortex.ai',
            }),
          });
        }
        return Promise.reject(new Error('Unexpected URL ' + url));
      });

      const res = await gmailApi.connectWithRefreshToken({
        clientId: 'client-123',
        clientSecret: 'secret-456',
        refreshToken: 'refresh-789',
      });

      expect(res.success).toBe(true);
      expect(res.email).toBe('pedro@cortex.ai');
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'new-valid-access-token',
          refresh_token: 'refresh-789',
          email: 'pedro@cortex.ai',
        })
      );
    });
  });

  describe('gmailApi Fetch Unread Messages Logic', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      jest.clearAllMocks();
    });

    test('fetchUnreadMessages returns notConnected if no token is configured', async () => {
      jest.spyOn(gmailApi, 'ensureValidToken').mockResolvedValue(null);
      jest.spyOn(gmailApi, 'getStoredToken').mockResolvedValue(null);

      const result = await gmailApi.fetchUnreadMessages();
      expect(result.notConnected).toBe(true);
      expect(result.messages).toEqual([]);
    });

    test('fetchUnreadMessages handles 401 error gracefully with authError flag when refresh fails', async () => {
      jest.spyOn(gmailApi, 'ensureValidToken').mockResolvedValue('invalid-token');
      jest.spyOn(gmailApi, 'refreshAccessToken').mockResolvedValue({ success: false });

      global.fetch = jest.fn().mockResolvedValue({
        status: 401,
        ok: false,
      });

      const result = await gmailApi.fetchUnreadMessages();
      expect(result.authError).toBe(true);
      expect(result.messages).toEqual([]);
    });

    test('fetchUnreadMessages parses messages in parallel with essential metadata', async () => {
      jest.spyOn(gmailApi, 'ensureValidToken').mockResolvedValue('valid-test-token');

      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/messages?q=is:unread')) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({
              messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
            }),
          });
        }
        if (url.includes('/messages/msg-1')) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({
              id: 'msg-1',
              internalDate: '1700000000000',
              snippet: 'Mensagem urgente sobre a release',
              payload: {
                headers: [
                  { name: 'From', value: 'Lead <lead@cortex.ai>' },
                  { name: 'Subject', value: 'URGENTE: Deploy em produção' },
                ],
              },
            }),
          });
        }
        if (url.includes('/messages/msg-2')) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({
              id: 'msg-2',
              internalDate: '1700000000000',
              snippet: 'Relatório semanal disponível',
              payload: {
                headers: [
                  { name: 'From', value: 'News <news@cortex.ai>' },
                  { name: 'Subject', value: 'Newsletter #42' },
                ],
              },
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });

      const result = await gmailApi.fetchUnreadMessages();
      expect(result.error).toBeNull();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].sender).toBe('Lead <lead@cortex.ai>');
      expect(result.messages[0].subject).toBe('URGENTE: Deploy em produção');
      expect(result.messages[0].urgency).toBe('HIGH');
      expect(result.messages[1].urgency).toBe('MEDIUM');
    });
  });
});

