import React, { useState, useEffect } from "react";
import { 
  Palette, 
  Calendar as CalendarIcon, 
  Command, 
  Check, 
  Link2, 
  Mail, 
  Hash, 
  Webhook, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  RefreshCw,
  ExternalLink,
  Trash2,
  Key,
  ShieldCheck
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import calendarApi from "@/services/calendarApi";
import gmailApi from "@/services/gmailApi";
import { cn } from "cn";

/**
 * Safely opens URL in external system browser
 */
async function openExternalUrl(url) {
  try {
    if (typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__)) {
      const { open } = await import("@tauri-apps/plugin-opener");
      await open(url);
      return;
    }
  } catch (err) {
    console.warn("plugin-opener failed, falling back to window.open:", err);
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
}

export function SettingsTab({ dockPreset = "Right", onPresetChange }) {
  const [activePreset, setActivePreset] = useState(dockPreset);
  const [proMotion120, setProMotion120] = useState(true);
  const [liquidGlass, setLiquidGlass] = useState(true);
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [calendarSettings, setCalendarSettings] = useState(() => calendarApi.getCalendarSettings());

  // Estado de Conexões e Chaves OAuth do Gmail
  const [gmailMode, setGmailMode] = useState("optionA"); // "optionA" (Consent) | "optionB" (Direct Refresh Token)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [isEditingGmail, setIsEditingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState({
    tested: false,
    valid: false,
    hasRefreshToken: false,
    email: "",
    error: "",
  });
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [isTestingGmail, setIsTestingGmail] = useState(false);
  const [isDisconnectingGmail, setIsDisconnectingGmail] = useState(false);

  // Outras conexões (Slack, Webhook)
  const [slackToken, setSlackToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [slackStatus, setSlackStatus] = useState({ connected: false });
  const [webhookStatus, setWebhookStatus] = useState({ connected: false });
  const [isSavingSlack, setIsSavingSlack] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState({});

  useEffect(() => {
    calendarApi.getAppleCalendars()
      .then((cals) => {
        if (Array.isArray(cals)) {
          setAvailableCalendars(cals);
        }
      })
      .catch(() => {});

    // Carrega credenciais salvas do cofre local
    gmailApi.getStoredCredentials()
      .then((creds) => {
        if (creds && (creds.access_token || creds.refresh_token)) {
          setClientId(creds.client_id || "");
          setClientSecret(creds.client_secret || "");
          setRefreshToken(creds.refresh_token || "");

          gmailApi.testConnection().then((res) => {
            if (res.success) {
              setGmailStatus({
                tested: true,
                valid: true,
                hasRefreshToken: Boolean(creds.refresh_token),
                email: res.email || creds.email || "",
                error: "",
              });
            } else {
              setGmailStatus({
                tested: true,
                valid: false,
                hasRefreshToken: Boolean(creds.refresh_token),
                email: creds.email || "",
                error: res.error || "Token inválido ou expirado",
              });
            }
          });
        }
      })
      .catch((err) => {
        console.warn("[SettingsTab] Falha ao carregar credenciais do Gmail:", err);
      });

    invoke("obter_credencial", { servico: "slack" })
      .then((token) => {
        if (token) {
          setSlackToken(token);
          setSlackStatus({ connected: true });
        }
      })
      .catch(() => {});

    invoke("obter_credencial", { servico: "webhook" })
      .then((url) => {
        if (url) {
          setWebhookUrl(url);
          setWebhookStatus({ connected: true });
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectPreset = async (preset) => {
    setActivePreset(preset);
    onPresetChange?.(preset);
    try {
      await invoke("set_dock_preset", { preset });
    } catch (err) {
      console.warn("Falha ao salvar preset:", err);
    }
  };

  const handleToggleCalendar = (calIdentifier) => {
    const currentHidden = calendarSettings.hiddenCalendars || [];
    const exists = currentHidden.some(
      (h) => h.toLowerCase() === calIdentifier.toLowerCase()
    );

    const updatedHidden = exists
      ? currentHidden.filter((h) => h.toLowerCase() !== calIdentifier.toLowerCase())
      : [...currentHidden, calIdentifier];

    const updatedSettings = {
      ...calendarSettings,
      hiddenCalendars: updatedHidden,
    };

    setCalendarSettings(updatedSettings);
    calendarApi.saveCalendarSettings(updatedSettings);
  };

  // Opção A: Abrir consentimento no navegador padrão
  const handleOpenGoogleConsent = async () => {
    if (!clientId.trim()) {
      alert("Por favor, preencha o Client ID antes de abrir a página de autorização do Google.");
      return;
    }
    try {
      const url = gmailApi.buildAuthUrl({ clientId: clientId.trim() });
      await openExternalUrl(url);
    } catch (err) {
      alert("Erro ao gerar URL de autorização: " + (err.message || String(err)));
    }
  };

  // Opção A: Conectar via código de autorização
  const handleConnectWithCode = async () => {
    if (!authCode.trim()) {
      alert("Cole o código de autorização gerado pelo Google para prosseguir.");
      return;
    }
    if (!clientId.trim() || !clientSecret.trim()) {
      alert("Client ID e Client Secret são obrigatórios.");
      return;
    }

    setIsConnectingGmail(true);
    setGmailStatus((prev) => ({ ...prev, error: "" }));

    try {
      const res = await gmailApi.exchangeAuthCode({
        code: authCode.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });

      if (res.success) {
        setGmailStatus({
          tested: true,
          valid: true,
          hasRefreshToken: true,
          email: res.email || "",
          error: "",
        });
        setAuthCode("");
        setIsEditingGmail(false);
        setSavedFeedback((prev) => ({ ...prev, gmail: true }));
        setTimeout(() => setSavedFeedback((prev) => ({ ...prev, gmail: false })), 2500);
      } else {
        setGmailStatus((prev) => ({
          ...prev,
          tested: true,
          valid: false,
          error: res.error || "Falha ao validar código de autorização",
        }));
      }
    } catch (err) {
      setGmailStatus((prev) => ({ ...prev, tested: true, valid: false, error: String(err) }));
    } finally {
      setIsConnectingGmail(false);
    }
  };

  // Opção B: Conectar diretamente com Refresh Token
  const handleConnectWithRefreshToken = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) {
      alert("Preencha Client ID, Client Secret e Refresh Token.");
      return;
    }

    setIsConnectingGmail(true);
    setGmailStatus((prev) => ({ ...prev, error: "" }));

    try {
      const res = await gmailApi.connectWithRefreshToken({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
      });

      if (res.success) {
        setGmailStatus({
          tested: true,
          valid: true,
          hasRefreshToken: true,
          email: res.email || "",
          error: "",
        });
        setIsEditingGmail(false);
        setSavedFeedback((prev) => ({ ...prev, gmail: true }));
        setTimeout(() => setSavedFeedback((prev) => ({ ...prev, gmail: false })), 2500);
      } else {
        setGmailStatus((prev) => ({
          ...prev,
          tested: true,
          valid: false,
          error: res.error || "Falha ao validar Refresh Token",
        }));
      }
    } catch (err) {
      setGmailStatus((prev) => ({ ...prev, tested: true, valid: false, error: String(err) }));
    } finally {
      setIsConnectingGmail(false);
    }
  };

  // Testar conexão
  const handleTestGmail = async () => {
    setIsTestingGmail(true);
    try {
      const res = await gmailApi.testConnection();
      if (res.success) {
        setGmailStatus((prev) => ({
          ...prev,
          tested: true,
          valid: true,
          email: res.email || prev.email,
          error: "",
        }));
        setSavedFeedback((prev) => ({ ...prev, gmailTest: true }));
        setTimeout(() => setSavedFeedback((prev) => ({ ...prev, gmailTest: false })), 2000);
      } else {
        setGmailStatus((prev) => ({
          ...prev,
          tested: true,
          valid: false,
          error: res.error || "Falha no teste de conexão",
        }));
      }
    } finally {
      setIsTestingGmail(false);
    }
  };

  // Desconectar Gmail
  const handleDisconnectGmail = async () => {
    if (!window.confirm("Deseja realmente desconectar o Gmail e remover as credenciais locais?")) {
      return;
    }
    setIsDisconnectingGmail(true);
    try {
      await gmailApi.disconnectGmail();
      setGmailStatus({
        tested: false,
        valid: false,
        hasRefreshToken: false,
        email: "",
        error: "",
      });
      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      setAuthCode("");
      setIsEditingGmail(false);
    } catch (err) {
      console.error("[SettingsTab] Falha ao desconectar Gmail:", err);
    } finally {
      setIsDisconnectingGmail(false);
    }
  };

  // Salvar token do Slack
  const handleSaveSlack = async () => {
    setIsSavingSlack(true);
    try {
      await invoke("salvar_credencial", { servico: "slack", token: slackToken });
      setSlackStatus({ connected: Boolean(slackToken.trim()) });
      setSavedFeedback((prev) => ({ ...prev, slack: true }));
      setTimeout(() => setSavedFeedback((prev) => ({ ...prev, slack: false })), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingSlack(false);
    }
  };

  // Salvar webhook
  const handleSaveWebhook = async () => {
    setIsSavingWebhook(true);
    try {
      await invoke("salvar_credencial", { servico: "webhook", token: webhookUrl });
      setWebhookStatus({ connected: Boolean(webhookUrl.trim()) });
      setSavedFeedback((prev) => ({ ...prev, webhook: true }));
      setTimeout(() => setSavedFeedback((prev) => ({ ...prev, webhook: false })), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const activeConnectionsCount = (gmailStatus.valid ? 1 : 0) + (slackStatus.connected ? 1 : 0) + (webhookStatus.connected ? 1 : 0);

  return (
    <div className="flex flex-col h-full max-h-[600px] justify-between overflow-hidden select-none">
      {/* Lista Rolável de Seções Modulares com scrollbar invisível */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-none min-h-0">
        
        {/* Seção 1: Conexões e Contas (Gmail, Slack, Webhooks) */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-[14px] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#a78bfa]" />
              <h3 className="text-[10.5px] font-medium tracking-[0.08em] text-[#9a9aa0] uppercase">
                Conexões & Contas
              </h3>
            </div>
            <span className="text-[9.5px] font-mono text-white/40">
              {activeConnectionsCount}/3 ativas
            </span>
          </div>

          <div className="flex flex-col gap-2.5 pt-0.5">
            {/* Card Gmail OAuth 2.0 */}
            <div className="bg-black/20 p-2.5 rounded-[10px] border border-white/[0.04] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-red-400" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-[#f2f2f2]">Google Gmail</span>
                    <span className="text-[9.5px] text-white/40">OAuth 2.0 Contínuo</span>
                  </div>
                </div>

                {/* Status Pill */}
                {gmailStatus.valid ? (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {gmailStatus.hasRefreshToken ? "Conectado • Renovação Ativa" : "Conectado (Manual)"}
                  </span>
                ) : gmailStatus.tested ? (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title={gmailStatus.error}>
                    <AlertCircle className="w-2.5 h-2.5" />
                    Desconectado / Expirado
                  </span>
                ) : (
                  <span className="text-[9.5px] text-white/30">Não configurado</span>
                )}
              </div>

              {/* Mensagem de Erro se houver */}
              {gmailStatus.error && !gmailStatus.valid && (
                <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-[8px] p-2 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                  <span>{gmailStatus.error}</span>
                </div>
              )}

              {/* Estado: Conectado e não editando */}
              {gmailStatus.valid && !isEditingGmail ? (
                <div className="flex flex-col gap-2 pt-0.5">
                  <div className="flex items-center justify-between bg-white/[0.02] p-2 rounded-[8px] border border-white/[0.04]">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[11px] text-white/90 font-medium truncate">
                        {gmailStatus.email || "Conta Conectada"}
                      </span>
                      <span className="text-[9.5px] text-white/40 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                        {gmailStatus.hasRefreshToken ? "Auto-renovação ativa com margem de 5m" : "Token bearer ativo"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTestGmail}
                        disabled={isTestingGmail}
                        className="px-2 py-1 rounded-[6px] bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-[10.5px] font-medium cursor-pointer transition-colors border border-white/10 flex items-center gap-1"
                        title="Verificar token contra perfil do Google"
                      >
                        {isTestingGmail ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : savedFeedback.gmailTest ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <RefreshCw className="w-2.5 h-2.5" />
                        )}
                        Testar
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsEditingGmail(true)}
                        className="px-2 py-1 rounded-[6px] bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-[10.5px] font-medium cursor-pointer transition-colors border border-white/10"
                      >
                        Alterar
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnectGmail}
                        disabled={isDisconnectingGmail}
                        className="px-2 py-1 rounded-[6px] bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10.5px] font-medium cursor-pointer transition-colors border border-red-500/20 flex items-center gap-1"
                        title="Desconectar e remover credenciais"
                      >
                        {isDisconnectingGmail ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-2.5 h-2.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Estado: Não conectado ou Editando Conexão */
                <div className="flex flex-col gap-2 pt-0.5">
                  {/* Segmented Control: Opção A vs Opção B */}
                  <div className="grid grid-cols-2 gap-1 bg-black/30 p-0.5 rounded-[8px] border border-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => setGmailMode("optionA")}
                      className={cn(
                        "py-1 px-1.5 rounded-[6px] text-[10.5px] font-medium transition-all cursor-pointer text-center truncate",
                        gmailMode === "optionA"
                          ? "bg-[#1d1d22] text-[#a78bfa] font-semibold border border-[#a78bfa]/30 shadow-xs"
                          : "text-white/40 hover:text-white/70"
                      )}
                    >
                      Opção A: Google OAuth
                    </button>
                    <button
                      type="button"
                      onClick={() => setGmailMode("optionB")}
                      className={cn(
                        "py-1 px-1.5 rounded-[6px] text-[10.5px] font-medium transition-all cursor-pointer text-center truncate",
                        gmailMode === "optionB"
                          ? "bg-[#1d1d22] text-[#a78bfa] font-semibold border border-[#a78bfa]/30 shadow-xs"
                          : "text-white/40 hover:text-white/70"
                      )}
                    >
                      Opção B: Refresh Token
                    </button>
                  </div>

                  {/* Campos de Client ID e Client Secret (Comuns) */}
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Google Client ID (ex: 123...apps.googleusercontent.com)"
                      className="w-full bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                    />
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Google Client Secret (GOCSPX-...)"
                      className="w-full bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                    />
                  </div>

                  {gmailMode === "optionA" ? (
                    /* Opção A: Fluxo de Consentimento Google */
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenGoogleConsent}
                          className="flex-1 px-2.5 py-1 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white text-[11px] font-medium cursor-pointer transition-colors border border-white/10 flex items-center justify-center gap-1.5"
                        >
                          <ExternalLink className="w-3 h-3 text-[#a78bfa]" />
                          1. Abrir Autorização Google
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="password"
                          value={authCode}
                          onChange={(e) => setAuthCode(e.target.value)}
                          placeholder="2. Cole o código de autorização (4/0A...)"
                          className="flex-1 bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleConnectWithCode}
                          disabled={isConnectingGmail || !authCode.trim()}
                          className="px-3 py-1 rounded-[8px] bg-[#a78bfa]/20 hover:bg-[#a78bfa]/30 text-[#a78bfa] border border-[#a78bfa]/30 text-[11px] font-medium cursor-pointer transition-colors shrink-0 flex items-center gap-1 disabled:opacity-40"
                        >
                          {isConnectingGmail ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : savedFeedback.gmail ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            "Conectar"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Opção B: Refresh Token Direto */
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="password"
                        value={refreshToken}
                        onChange={(e) => setRefreshToken(e.target.value)}
                        placeholder="Refresh Token Permanente (1//04...)"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleConnectWithRefreshToken}
                        disabled={isConnectingGmail || !refreshToken.trim()}
                        className="w-full py-1.5 rounded-[8px] bg-[#a78bfa]/20 hover:bg-[#a78bfa]/30 text-[#a78bfa] border border-[#a78bfa]/30 text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        {isConnectingGmail ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : savedFeedback.gmail ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          "Conectar & Validar Chaves"
                        )}
                      </button>
                    </div>
                  )}

                  {isEditingGmail && (
                    <button
                      type="button"
                      onClick={() => setIsEditingGmail(false)}
                      className="text-[10px] text-white/40 hover:text-white/70 self-center underline cursor-pointer mt-0.5"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Card Slack */}
            <div className="bg-black/20 p-2.5 rounded-[10px] border border-white/[0.04] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-[#f2f2f2]">Slack Workspace</span>
                </div>
                {slackStatus.connected ? (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Ativo
                  </span>
                ) : (
                  <span className="text-[9.5px] text-white/30">Não configurado</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={slackToken}
                  onChange={(e) => setSlackToken(e.target.value)}
                  placeholder="User Token (xoxp-...)"
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveSlack}
                  disabled={isSavingSlack}
                  className="px-2.5 py-1 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.14] text-white/80 text-[11px] font-medium cursor-pointer transition-colors shrink-0 flex items-center gap-1 border border-white/10"
                >
                  {isSavingSlack ? <Loader2 className="w-3 h-3 animate-spin" /> : savedFeedback.slack ? <Check className="w-3 h-3" /> : "Salvar"}
                </button>
              </div>
            </div>

            {/* Card Webhook / Custom */}
            <div className="bg-black/20 p-2.5 rounded-[10px] border border-white/[0.04] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Webhook className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs font-medium text-[#f2f2f2]">Webhook Custom (n8n / WhatsApp)</span>
                </div>
                {webhookStatus.connected ? (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Ativo
                  </span>
                ) : (
                  <span className="text-[9.5px] text-white/30">Não configurado</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://n8n.seu-dominio.com/webhook/..."
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-[8px] px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#a78bfa]/50 font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveWebhook}
                  disabled={isSavingWebhook}
                  className="px-2.5 py-1 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.14] text-white/80 text-[11px] font-medium cursor-pointer transition-colors shrink-0 flex items-center gap-1 border border-white/10"
                >
                  {isSavingWebhook ? <Loader2 className="w-3 h-3 animate-spin" /> : savedFeedback.webhook ? <Check className="w-3 h-3" /> : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Seção 2: Aparência & Ancoragem */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-[14px] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.06]">
            <Palette className="w-3.5 h-3.5 text-[#a78bfa]" />
            <h3 className="text-[10.5px] font-medium tracking-[0.08em] text-[#9a9aa0] uppercase">
              Aparência & Ancoragem
            </h3>
          </div>

          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-xs font-medium text-[#f2f2f2]">Posição da Dock</span>
            <div className="grid grid-cols-3 gap-1.5 bg-black/20 p-1 rounded-[10px] border border-white/[0.04]">
              {["Right", "Left", "TopCenter"].map((p) => {
                const label = p === "Right" ? "Direita" : p === "Left" ? "Esquerda" : "Topo";
                const isSelected = activePreset === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={cn(
                      "py-1.5 px-2 rounded-[8px] text-[11px] font-medium transition-all cursor-pointer outline-none",
                      isSelected
                        ? "bg-[#1d1d22] text-[#f2f2f2] border border-[#a78bfa]/40 shadow-[0_0_12px_rgba(167,139,250,0.15)] font-semibold"
                        : "text-[#9a9aa0] hover:text-[#f2f2f2] hover:bg-white/[0.04]"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Switch ProMotion 120Hz */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <div className="flex flex-col">
              <span className="font-medium text-[#f2f2f2]">Taxa ProMotion 120Hz</span>
              <span className="text-[10px] text-[#9a9aa0]">Molas táteis de alta fluidez</span>
            </div>
            <button
              type="button"
              onClick={() => setProMotion120(!proMotion120)}
              className={cn(
                "w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer outline-none",
                proMotion120 ? "bg-[#a78bfa]" : "bg-white/15"
              )}
            >
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform",
                  proMotion120 ? "translate-x-3.5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Switch Liquid Glass */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <div className="flex flex-col">
              <span className="font-medium text-[#f2f2f2]">Vidro Líquido Vibrancy</span>
              <span className="text-[10px] text-[#9a9aa0]">Blur nativo macOS com reflexo de borda</span>
            </div>
            <button
              type="button"
              onClick={() => setLiquidGlass(!liquidGlass)}
              className={cn(
                "w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer outline-none",
                liquidGlass ? "bg-[#a78bfa]" : "bg-white/15"
              )}
            >
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform",
                  liquidGlass ? "translate-x-3.5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Seção 3: Calendários Ocultos */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-[14px] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-[#a78bfa]" />
              <h3 className="text-[10.5px] font-medium tracking-[0.08em] text-[#9a9aa0] uppercase">
                Calendários no Feed
              </h3>
            </div>
            <span className="text-[9.5px] font-mono text-white/40">
              {availableCalendars.length - (calendarSettings.hiddenCalendars?.length || 0)}/{availableCalendars.length} visíveis
            </span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
            {availableCalendars.length > 0 ? (
              availableCalendars.map((cal) => {
                const isHidden = (calendarSettings.hiddenCalendars || []).some(
                  (h) => h.toLowerCase() === (cal.title || cal.id).toLowerCase()
                );
                const isVisible = !isHidden;

                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => handleToggleCalendar(cal.title || cal.id)}
                    className="flex items-center justify-between p-1.5 px-2 rounded-[10px] bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors cursor-pointer text-left w-full"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(255,255,255,0.2)]"
                        style={{ backgroundColor: cal.colorHex || "#a78bfa" }}
                      />
                      <span className="text-xs font-medium text-[#f2f2f2] truncate">
                        {cal.title}
                      </span>
                    </div>

                    <div
                      className={cn(
                        "w-4 h-4 rounded-md flex items-center justify-center transition-colors shrink-0",
                        isVisible
                          ? "bg-[#a78bfa] text-[#0e0e10] shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                          : "bg-white/10 border border-white/20"
                      )}
                    >
                      {isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <span className="text-[11px] text-[#9a9aa0] p-1">
                Sincronizando com o Apple Calendar do sistema...
              </span>
            )}
          </div>
        </div>

        {/* Seção 4: Atalhos Globais */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-[14px] p-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.06]">
            <Command className="w-3.5 h-3.5 text-[#a78bfa]" />
            <h3 className="text-[10.5px] font-medium tracking-[0.08em] text-[#9a9aa0] uppercase">
              Atalhos de Teclado
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
            {[
              { key: "⌘1", desc: "Inbox & Prioridades" },
              { key: "⌘2", desc: "Calendário" },
              { key: "⌘3", desc: "Notas Vault" },
              { key: "⌘,", desc: "Configurações" },
              { key: "Esc", desc: "Fechar Flyout" },
              { key: "Hover", desc: "Ativação Borda" },
            ].map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between p-1.5 px-2 rounded-[8px] bg-white/[0.02] border border-white/[0.04]"
              >
                <span className="text-[11px] text-[#9a9aa0] truncate">{shortcut.desc}</span>
                <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[9.5px] text-[#f2f2f2] border border-white/15">
                  {shortcut.key}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsTab;
