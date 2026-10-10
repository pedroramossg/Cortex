/**
 * gmailApi.js
 * Cortex Direct REST Integration for Google Gmail API
 * Continuous OAuth 2.0 Token Renewal Engine (Access + Refresh Token)
 * Complies with strict security.md, zero-waterfall Promise.all parallel fetching,
 * and 5-minute preventive auto-renewal window with in-flight memoization.
 */

export const RENEWAL_BUFFER_SECONDS = 300; // 5 minutos de margem preventiva
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
export const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export const DEFAULT_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

// In-flight promise memoization para evitar chamadas simultâneas de refresh
let refreshPromise = null;

/**
 * Checks if running inside Tauri
 */
function isTauriEnvironment() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

/**
 * Safely calls Tauri IPC command
 */
async function invokeTauri(command, args = {}) {
  if (isTauriEnvironment()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(command, args);
  }
  return null;
}

/**
 * Extracts header value from Gmail message payload headers
 */
function getHeaderValue(headers = [], name = "") {
  const target = name.toLowerCase();
  const found = headers.find((h) => h.name && h.name.toLowerCase() === target);
  return found ? found.value : "";
}

/**
 * Determines urgency heuristic from subject and snippet
 */
function computeUrgency(subject = "", snippet = "") {
  const content = `${subject} ${snippet}`.toLowerCase();
  const highKeywords = ["urgente", "urgent", "asap", "importante", "crítico", "critical", "prazo", "deadline", "ação requerida", "imediato"];
  if (highKeywords.some((kw) => content.includes(kw))) {
    return "HIGH";
  }
  return "MEDIUM";
}

/**
 * Parses raw credentials from string or JSON object
 */
export function parseStoredCredentials(raw) {
  if (!raw) return null;
  if (typeof raw === "object") {
    return {
      access_token: raw.access_token || null,
      refresh_token: raw.refresh_token || null,
      expires_at: raw.expires_at ? Number(raw.expires_at) : null,
      client_id: raw.client_id || null,
      client_secret: raw.client_secret || null,
      email: raw.email || null,
    };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          access_token: parsed.access_token || null,
          refresh_token: parsed.refresh_token || null,
          expires_at: parsed.expires_at ? Number(parsed.expires_at) : null,
          client_id: parsed.client_id || null,
          client_secret: parsed.client_secret || null,
          email: parsed.email || null,
        };
      } catch {
        // Fallback para string pura
      }
    }
    // Token legado sem objeto estruturado
    return {
      access_token: trimmed,
      refresh_token: null,
      expires_at: null,
      client_id: null,
      client_secret: null,
      email: null,
    };
  }
  return null;
}

export const gmailApi = {
  /**
   * Retrieves structured Gmail credentials from Rust vault
   */
  async getStoredCredentials() {
    try {
      const raw = await invokeTauri("obter_credencial", { servico: "gmail" });
      return parseStoredCredentials(raw);
    } catch (err) {
      console.warn("[gmailApi] Falha ao obter credenciais:", err);
      return null;
    }
  },

  /**
   * Retrieves active Gmail access token
   */
  async getStoredToken() {
    try {
      const creds = await this.getStoredCredentials();
      return creds ? creds.access_token : null;
    } catch (err) {
      console.warn("[gmailApi] Falha ao obter token:", err);
      return null;
    }
  },

  /**
   * Saves structured OAuth credentials into Rust vault
   */
  async saveOAuthCredentials(creds) {
    try {
      const payload = {
        access_token: creds.access_token || "",
        refresh_token: creds.refresh_token || "",
        expires_at: creds.expires_at || null,
        client_id: creds.client_id || "",
        client_secret: creds.client_secret || "",
        email: creds.email || "",
      };
      await invokeTauri("salvar_credencial", {
        servico: "gmail",
        token: JSON.stringify(payload),
      });
      return true;
    } catch (err) {
      console.error("[gmailApi] Falha ao salvar credenciais OAuth:", err);
      throw err;
    }
  },

  /**
   * Saves raw token (backward compatibility)
   */
  async saveToken(token) {
    try {
      if (typeof token === "string" && token.trim().startsWith("{")) {
        const parsed = JSON.parse(token);
        return await this.saveOAuthCredentials(parsed);
      }
      await invokeTauri("salvar_credencial", { servico: "gmail", token: token || "" });
      return true;
    } catch (err) {
      console.error("[gmailApi] Falha ao salvar credencial:", err);
      throw err;
    }
  },

  /**
   * Removes Gmail credentials from vault
   */
  async disconnectGmail() {
    try {
      await invokeTauri("remover_credencial", { servico: "gmail" });
      refreshPromise = null;
      return true;
    } catch (err) {
      console.error("[gmailApi] Falha ao desconectar Gmail:", err);
      throw err;
    }
  },

  /**
   * Generates Google OAuth 2.0 Authorization URL for Opção A
   */
  buildAuthUrl({ clientId, redirectUri = "http://127.0.0.1" }) {
    if (!clientId || !clientId.trim()) {
      throw new Error("Client ID é obrigatório para gerar URL de autorização");
    }
    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
      response_type: "code",
      scope: DEFAULT_SCOPES,
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /**
   * Exchanges Authorization Code for Access & Refresh Tokens (Opção A)
   */
  async exchangeAuthCode({ code, clientId, clientSecret, redirectUri = "http://127.0.0.1" }) {
    if (!code || !code.trim()) {
      return { success: false, error: "Código de autorização é obrigatório" };
    }
    if (!clientId || !clientId.trim() || !clientSecret || !clientSecret.trim()) {
      return { success: false, error: "Client ID e Client Secret são obrigatórios" };
    }

    try {
      const bodyParams = new URLSearchParams({
        code: code.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri.trim(),
        grant_type: "authorization_code",
      });

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error_description || errJson.error || `HTTP ${response.status}`;
        return { success: false, status: response.status, error: `Falha ao trocar código por token: ${errMsg}` };
      }

      const data = await response.json();
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresIn = data.expires_in || 3600;

      // Obter email do usuário via perfil
      let userEmail = "";
      try {
        const profRes = await fetch(GMAIL_PROFILE_URL, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (profRes.ok) {
          const profData = await profRes.json();
          userEmail = profData.emailAddress || "";
        }
      } catch (err) {
        console.warn("[gmailApi] Falha ao obter email do perfil:", err);
      }

      const creds = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_at: nowSec + expiresIn,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        email: userEmail,
      };

      await this.saveOAuthCredentials(creds);
      return { success: true, credentials: creds, email: userEmail };
    } catch (err) {
      return { success: false, error: err.message || "Erro de rede ao trocar código" };
    }
  },

  /**
   * Validates and saves credentials via direct Refresh Token (Opção B)
   */
  async connectWithRefreshToken({ clientId, clientSecret, refreshToken }) {
    if (!clientId || !clientId.trim() || !clientSecret || !clientSecret.trim() || !refreshToken || !refreshToken.trim()) {
      return { success: false, error: "Client ID, Client Secret e Refresh Token são obrigatórios" };
    }

    try {
      const bodyParams = new URLSearchParams({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        refresh_token: refreshToken.trim(),
        grant_type: "refresh_token",
      });

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error_description || errJson.error || `HTTP ${response.status}`;
        return { success: false, status: response.status, error: `Falha ao validar Refresh Token: ${errMsg}` };
      }

      const data = await response.json();
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresIn = data.expires_in || 3600;

      let userEmail = "";
      try {
        const profRes = await fetch(GMAIL_PROFILE_URL, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (profRes.ok) {
          const profData = await profRes.json();
          userEmail = profData.emailAddress || "";
        }
      } catch (err) {
        console.warn("[gmailApi] Falha ao obter email do perfil:", err);
      }

      const creds = {
        access_token: data.access_token,
        refresh_token: refreshToken.trim(),
        expires_at: nowSec + expiresIn,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        email: userEmail,
      };

      await this.saveOAuthCredentials(creds);
      return { success: true, credentials: creds, email: userEmail };
    } catch (err) {
      return { success: false, error: err.message || "Erro de rede ao validar Refresh Token" };
    }
  },

  /**
   * Refreshes access token using refresh token with in-flight deduplication
   */
  async refreshAccessToken(creds = null) {
    if (!creds) {
      creds = await this.getStoredCredentials();
    }
    if (!creds || !creds.refresh_token || !creds.client_id || !creds.client_secret) {
      return {
        success: false,
        error: "Credenciais insuficientes para renovação (requer refresh_token, client_id e client_secret)",
      };
    }

    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const bodyParams = new URLSearchParams({
          client_id: creds.client_id.trim(),
          client_secret: creds.client_secret.trim(),
          refresh_token: creds.refresh_token.trim(),
          grant_type: "refresh_token",
        });

        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: bodyParams.toString(),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson.error_description || errJson.error || `HTTP ${response.status}`;
          return {
            success: false,
            status: response.status,
            error: `Falha ao renovar token OAuth: ${errMsg}`,
          };
        }

        const data = await response.json();
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresIn = data.expires_in || 3600;

        const updatedCreds = {
          ...creds,
          access_token: data.access_token,
          expires_at: nowSec + expiresIn,
        };

        if (data.refresh_token) {
          updatedCreds.refresh_token = data.refresh_token;
        }

        await this.saveOAuthCredentials(updatedCreds);
        return {
          success: true,
          accessToken: data.access_token,
          credentials: updatedCreds,
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || "Erro de conexão ao renovar token",
        };
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  /**
   * Guarantees a fresh valid access token.
   * Proactively triggers renewal if within RENEWAL_BUFFER_SECONDS (5 minutes) of expiration.
   */
  async ensureValidToken() {
    const creds = await this.getStoredCredentials();
    if (!creds || !creds.access_token) {
      return null;
    }

    if (creds.refresh_token && creds.client_id && creds.client_secret) {
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpiringSoon = !creds.expires_at || (nowSec >= (creds.expires_at - RENEWAL_BUFFER_SECONDS));

      if (isExpiringSoon) {
        const refreshResult = await this.refreshAccessToken(creds);
        if (refreshResult && refreshResult.success) {
          return refreshResult.accessToken;
        }
        // Fallback seguro se o token ainda não expirou estritamente
        if (creds.expires_at && nowSec < creds.expires_at) {
          console.warn("[gmailApi] Renovação preventiva falhou, usando token atual:", refreshResult?.error);
          return creds.access_token;
        }
        console.warn("[gmailApi] Falha na renovação do token:", refreshResult?.error);
        return null;
      }
    }

    return creds.access_token;
  },

  /**
   * Tests token validity against Gmail Profile endpoint
   */
  async testConnection(token) {
    let activeToken = token;
    if (!activeToken) {
      activeToken = await this.ensureValidToken();
    }
    if (!activeToken || !activeToken.trim()) {
      return { success: false, error: "Nenhum token fornecido ou configurado" };
    }
    try {
      const response = await fetch(GMAIL_PROFILE_URL, {
        headers: {
          Authorization: `Bearer ${activeToken.trim()}`,
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        return { success: false, status: 401, error: "Token inválido ou expirado (401)" };
      }
      if (!response.ok) {
        return { success: false, status: response.status, error: `Falha na verificação HTTP (${response.status})` };
      }

      const data = await response.json();
      return { success: true, email: data.emailAddress };
    } catch (err) {
      return { success: false, error: err.message || "Erro de rede ao conectar com Google" };
    }
  },

  /**
   * Fetches the 10 most recent unread messages with parallelized metadata fetching (zero waterfall).
   * Automatically refreshes token if within 5-minute renewal window.
   */
  async fetchUnreadMessages() {
    let token = await this.ensureValidToken();
    if (!token) {
      token = await this.getStoredToken();
    }

    if (!token || !token.trim()) {
      return {
        messages: [],
        notConnected: true,
        error: null,
      };
    }

    try {
      // 1. Fetch unread message IDs (max 10)
      const listUrl = `${GMAIL_MESSAGES_URL}?q=is:unread&maxResults=10`;
      let listResponse = await fetch(listUrl, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/json",
        },
      });

      // Tenta uma renovação forçada caso tenhamos refresh_token e retorne 401
      if (listResponse.status === 401) {
        const refreshRes = await this.refreshAccessToken();
        if (refreshRes && refreshRes.success) {
          token = refreshRes.accessToken;
          listResponse = await fetch(listUrl, {
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              Accept: "application/json",
            },
          });
        }
      }

      if (listResponse.status === 401) {
        return {
          messages: [],
          authError: true,
          error: "Token do Gmail expirado ou não autorizado (401)",
        };
      }

      if (!listResponse.ok) {
        return {
          messages: [],
          error: `Erro na API do Gmail (${listResponse.status})`,
        };
      }

      const listData = await listResponse.json();
      const rawMessages = listData.messages || [];

      if (rawMessages.length === 0) {
        return {
          messages: [],
          error: null,
          notConnected: false,
        };
      }

      // 2. Zero-waterfall: Fetch message details in parallel with minimal metadata payload (< 300ms)
      const detailPromises = rawMessages.map(async (item) => {
        const detailUrl = `${GMAIL_MESSAGES_URL}/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
        const res = await fetch(detailUrl, {
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) return null;
        const msgJson = await res.json();

        const headers = msgJson.payload?.headers || [];
        const sender = getHeaderValue(headers, "From") || "Remetente Desconhecido";
        const subject = getHeaderValue(headers, "Subject") || "(Sem assunto)";
        const dateHeader = getHeaderValue(headers, "Date");
        const internalDate = msgJson.internalDate ? parseInt(msgJson.internalDate, 10) : Date.now();
        const receivedAt = dateHeader ? new Date(dateHeader) : new Date(internalDate);
        const snippet = msgJson.snippet || "";
        const urgency = computeUrgency(subject, snippet);

        return {
          id: msgJson.id,
          sender,
          subject,
          snippet,
          urgency,
          requires_action: urgency === "HIGH",
          is_approval_pending: false,
          received_at: receivedAt,
          service: "gmail",
        };
      });

      const results = await Promise.all(detailPromises);
      const validMessages = results.filter(Boolean);

      return {
        messages: validMessages,
        error: null,
        notConnected: false,
      };
    } catch (err) {
      console.error("[gmailApi] Erro ao buscar e-mails:", err);
      return {
        messages: [],
        error: err.message || "Erro de conexão com o Gmail",
      };
    }
  },
};

/**
 * Resolves at most ONE single tag with strict precedence:
 * 1. Urgente (urgency === "HIGH")
 * 2. Ação (requires_action)
 * 3. Pendente (is_approval_pending)
 */
export function resolveNotificationTag(urgency, requiresAction, isApprovalPending) {
  if (urgency === "HIGH") {
    return {
      label: "Urgente",
      type: "urgent",
      className: "border-red-500/30 text-red-300 bg-red-500/15 font-semibold",
    };
  }
  if (requiresAction) {
    return {
      label: "Ação",
      type: "action",
      className: "border-amber-500/30 text-amber-300 bg-amber-500/15 font-medium",
    };
  }
  if (isApprovalPending) {
    return {
      label: "Pendente",
      type: "pending",
      className: "border-blue-500/30 text-blue-300 bg-blue-500/15 font-medium",
    };
  }
  return null;
}

export { computeUrgency };
export default gmailApi;
