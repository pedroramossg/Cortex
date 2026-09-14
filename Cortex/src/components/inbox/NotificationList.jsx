import React, { useState, useMemo } from "react";
import { AppSwitcherPills } from "@/components/inbox/AppSwitcherPills";
import { NotificationCard } from "@/components/inbox/NotificationCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, Sparkles, Filter } from "lucide-react";

/**
 * Mock data conforming strictly to PostgreSQL triaged_messages table
 * Fields: id, sender, subject, snippet, urgency, is_approval_pending, requires_action, received_at, service
 */
const MOCK_TRIAGED_MESSAGES = [
  {
    id: "uuid-msg-1",
    sender: "Satya Nadella <satya@microsoft.com>",
    subject: "Parceria Estratégica & Licença Enterprise",
    snippet: "Pedro, precisamos definir os termos da licença enterprise do Cortex até o final desta semana. Aguardo sua confirmação sobre a agenda de quinta.",
    urgency: "HIGH",
    is_approval_pending: true,
    requires_action: true,
    received_at: new Date(Date.now() - 1000 * 60 * 12),
    service: "gmail",
  },
  {
    id: "uuid-msg-2",
    sender: "Tech Lead Team #core-eng",
    subject: "Incidente P1: Latência na fila de triagem",
    snippet: "Identificamos spike no processamento de embeddings às 14:15. Worker já escalou réplicas automáticas, favor validar integridade do Redis.",
    urgency: "HIGH",
    is_approval_pending: false,
    requires_action: true,
    received_at: new Date(Date.now() - 1000 * 60 * 35),
    service: "slack",
  },
  {
    id: "uuid-msg-3",
    sender: "Drª Helena Rocha (Diretoria)",
    subject: "Aprovação do Relatório Mensal de Operações",
    snippet: "Pedro, o documento de fechamento mensal está pronto para assinatura digital. Precisamos do envio hoje antes das 18h.",
    urgency: "HIGH",
    is_approval_pending: true,
    requires_action: false,
    received_at: new Date(Date.now() - 1000 * 60 * 55),
    service: "whatsapp",
  },
  {
    id: "uuid-msg-4",
    sender: "Equipe Cortex Design (@cortex.ai)",
    subject: "Mockup Liquid Glass aprovado pela comunidade",
    snippet: "Tivemos mais de 450 interações no último post com o teaser da Dock lateral nativa no macOS. Feedback consolidado no canal de design.",
    urgency: "MEDIUM",
    is_approval_pending: false,
    requires_action: false,
    received_at: new Date(Date.now() - 1000 * 60 * 180),
    service: "instagram",
  },
  {
    id: "uuid-msg-5",
    sender: "GitHub Notifications <notifications@github.com>",
    subject: "[PR #42] Feat: Native System Tray & Retina Window Anchoring",
    snippet: "All CI/CD checks have passed. 14 test suites and 83 security checks verified. Ready to review and merge into main.",
    urgency: "LOW",
    is_approval_pending: true,
    requires_action: false,
    received_at: new Date(Date.now() - 1000 * 60 * 320),
    service: "gmail",
  },
];

/**
 * NotificationList: Container principal da Inbox com AppSwitcherPills e ScrollArea
 * Zero dangerouslySetInnerHTML conforme security.md Check 15.
 */
export function NotificationList({
  messages = MOCK_TRIAGED_MESSAGES,
  onSelectMessage,
}) {
  const [selectedApp, setSelectedApp] = useState("all");
  const [selectedMessageId, setSelectedMessageId] = useState("uuid-msg-1");

  // Calcula mensagens urgentes por serviço
  const counts = useMemo(() => {
    const map = { all: 0, gmail: 0, slack: 0, whatsapp: 0, instagram: 0 };
    messages.forEach((msg) => {
      if (msg.urgency === "HIGH") {
        map.all += 1;
        if (map[msg.service] !== undefined) {
          map[msg.service] += 1;
        }
      }
    });
    return map;
  }, [messages]);

  // Filtra mensagens pelo serviço ativo
  const filteredMessages = useMemo(() => {
    if (selectedApp === "all") return messages;
    return messages.filter((msg) => msg.service === selectedApp);
  }, [messages, selectedApp]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Filter Bar: AppSwitcherPills */}
      <div className="pb-3 border-b border-white/10">
        <AppSwitcherPills
          selectedApp={selectedApp}
          onSelectApp={setSelectedApp}
          counts={counts}
        />
        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-white/50">
          <span>{filteredMessages.length} mensagens triadas</span>
          {counts.all > 0 && (
            <span className="text-red-400 font-medium">
              {counts.all} itens requerem atenção imediata
            </span>
          )}
        </div>
      </div>

      {/* Lista Rolável com ScrollArea */}
      <ScrollArea className="flex-1 -mx-2 px-2 mt-2">
        <div className="flex flex-col gap-2 py-1">
          {filteredMessages.length > 0 ? (
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
            <div className="flex flex-col items-center justify-center p-8 text-center text-white/40 gap-2">
              <Inbox className="w-8 h-8 opacity-40" />
              <p className="text-xs">Nenhuma notificação encontrada para este filtro.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default NotificationList;
