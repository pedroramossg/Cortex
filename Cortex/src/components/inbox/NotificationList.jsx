import React, { useState, useEffect, useMemo } from "react";
import { AppSwitcherPills } from "@/components/inbox/AppSwitcherPills";
import { NotificationCard } from "@/components/inbox/NotificationCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, Mail, AlertCircle, Loader2 } from "lucide-react";
import gmailApi from "@/services/gmailApi";

/**
 * NotificationList: Container principal da Inbox
 * Carrega mensagens reais do Gmail via REST API ou exibe Empty State elegante quando não conectado.
 * Zero dados mockados estáticos no fluxo principal.
 */
export function NotificationList({
  messages: initialMessages,
  onSelectMessage,
  onNavigateSettings,
}) {
  const [selectedApp, setSelectedApp] = useState("all");
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(!initialMessages);
  const [notConnected, setNotConnected] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Carrega e-mails reais do Gmail se nenhuma prop de mensagens for passada (produção)
  useEffect(() => {
    if (initialMessages !== undefined) {
      setLiveMessages(initialMessages);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    gmailApi.fetchUnreadMessages()
      .then((res) => {
        if (!isMounted) return;
        if (res.notConnected) {
          setNotConnected(true);
          setLiveMessages([]);
        } else if (res.authError) {
          setAuthError(res.error || "Token do Gmail expirado (401)");
          setLiveMessages([]);
        } else {
          setLiveMessages(res.messages || []);
          if (res.messages && res.messages.length > 0) {
            setSelectedMessageId(res.messages[0].id);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("[NotificationList] Erro ao carregar mensagens:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialMessages]);

  const activeMessages = initialMessages !== undefined ? initialMessages : liveMessages;

  // Calcula mensagens urgentes por serviço
  const counts = useMemo(() => {
    const map = { all: 0, gmail: 0, slack: 0, whatsapp: 0, instagram: 0 };
    activeMessages.forEach((msg) => {
      if (msg.urgency === "HIGH") {
        map.all += 1;
        if (map[msg.service] !== undefined) {
          map[msg.service] += 1;
        }
      }
    });
    return map;
  }, [activeMessages]);

  // Filtra mensagens pelo serviço ativo
  const filteredMessages = useMemo(() => {
    if (selectedApp === "all") return activeMessages;
    return activeMessages.filter((msg) => msg.service === selectedApp);
  }, [activeMessages, selectedApp]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Filter Bar: AppSwitcherPills */}
      <div className="pb-2 border-b border-white/10">
        <AppSwitcherPills
          selectedApp={selectedApp}
          onSelectApp={setSelectedApp}
          counts={counts}
        />
        <div className="flex items-center justify-between mt-2 px-1 text-[11px] font-medium tracking-[0.08em] text-[var(--texto-2)] uppercase">
          <span>{filteredMessages.length} {filteredMessages.length === 1 ? "mensagem" : "mensagens"}</span>
          {counts.all > 0 && (
            <span className="text-red-400 font-semibold lowercase">
              {counts.all} requerem atenção
            </span>
          )}
        </div>
      </div>

      {/* Lista Rolável com ScrollArea */}
      <ScrollArea className="flex-1 -mx-1 px-1 mt-1.5">
        <div className="flex flex-col gap-1.5 py-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-10 text-center text-white/40 gap-2.5 my-auto">
              <Loader2 className="w-5 h-5 animate-spin text-[#a78bfa]" />
              <p className="text-xs">Sincronizando com a API do Gmail...</p>
            </div>
          ) : authError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-red-300 gap-2.5 my-auto">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <p className="text-xs font-medium">{authError}</p>
              {onNavigateSettings && (
                <button
                  type="button"
                  onClick={onNavigateSettings}
                  className="mt-1 px-3 py-1 rounded-[8px] bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 text-[11px] font-medium cursor-pointer transition-colors"
                >
                  Reconectar Gmail nas Configurações
                </button>
              )}
            </div>
          ) : notConnected && activeMessages.length === 0 ? (
            /* Empty State elegante convidando a conectar o Gmail */
            <div className="flex flex-col items-center justify-center p-8 text-center text-white/50 gap-3 my-auto">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#a78bfa]">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-1 max-w-[260px]">
                <p className="text-xs font-semibold text-white/90">Nenhuma conta conectada</p>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Conecte seu Gmail nas Configurações para triar e-mails em tempo real.
                </p>
              </div>
              {onNavigateSettings && (
                <button
                  type="button"
                  onClick={onNavigateSettings}
                  className="mt-1 px-3 py-1.5 rounded-[8px] bg-[#a78bfa]/20 hover:bg-[#a78bfa]/30 text-[#a78bfa] border border-[#a78bfa]/30 text-xs font-medium cursor-pointer transition-colors"
                >
                  Ir para Configurações
                </button>
              )}
            </div>
          ) : filteredMessages.length > 0 ? (
            filteredMessages.map((message) => (
              <NotificationCard
                key={message.id}
                message={message}
                isSelected={selectedMessageId === message.id}
                onClick={() => {
                  setSelectedMessageId(message.id);
                  onSelectMessage?.(message);
                }}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-white/40 gap-2 my-auto">
              <Inbox className="w-7 h-7 opacity-35" />
              <p className="text-xs">Nenhuma mensagem não lida encontrada.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default NotificationList;
