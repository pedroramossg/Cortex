import { useState } from "react";
import { DockRail } from "@/components/dock/DockRail";
import { NotificationList } from "@/components/inbox/NotificationList";

function App() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(true);
  const [highUrgencyCount, setHighUrgencyCount] = useState(3);

  return (
    <div className="relative min-h-screen w-full bg-transparent overflow-hidden text-white select-none pointer-events-none">
      {/* Lateral Dock Flutuante Ancorada no Limite Direito */}
      <DockRail
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsFlyoutOpen(true);
        }}
        highUrgencyCount={highUrgencyCount}
        isOpen={isFlyoutOpen}
        onToggleFlyout={() => setIsFlyoutOpen((prev) => !prev)}
      />

      {/* Flyout Panel Flutuante (Liquid Glass) Colado Imediatamente à Esquerda da Dock */}
      {isFlyoutOpen && (
        <aside
          aria-label="Cortex Flyout Panel"
          className="mac-vibrancy fixed right-[58px] top-1/2 -translate-y-1/2 w-[380px] h-[580px] rounded-2xl flex flex-col p-4 shadow-2xl z-40 pointer-events-auto"
        >
          {/* Header do Flyout */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                {activeTab === "inbox" && "Inbox & Prioridades"}
                {activeTab === "calendar" && "Calendário & Reuniões"}
                {activeTab === "obsidian" && "Notas Obsidian"}
                {activeTab === "settings" && "Configurações"}
              </h2>
              <p className="text-[11px] text-white/50">Cortex Intelligent Workspace</p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              macOS HIG
            </span>
          </div>

          {/* Conteúdo Dinâmico por Aba */}
          <div className="flex-1 overflow-hidden pt-2">
            {activeTab === "inbox" && <NotificationList />}

            {activeTab === "calendar" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2 h-full text-white/60">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-amber-400">
                  📅
                </div>
                <h3 className="text-xs font-semibold text-white">Google Calendar Integrado</h3>
                <p className="text-[11px] text-white/50">
                  Sincronização de reuniões, links Meet/Zoom e preparação de briefings ativos.
                </p>
              </div>
            )}

            {activeTab === "obsidian" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2 h-full text-white/60">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-purple-400">
                  📝
                </div>
                <h3 className="text-xs font-semibold text-white">Obsidian Local Vault</h3>
                <p className="text-[11px] text-white/50">
                  Notas rápidas e briefings salvos diretamente no formato Markdown com frontmatter.
                </p>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2 h-full text-white/60">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/70">
                  ⚙️
                </div>
                <h3 className="text-xs font-semibold text-white">Preferências do Sistema</h3>
                <p className="text-[11px] text-white/50">
                  Ajustes de atalhos globais, modelos de IA e chaves locais protegidas.
                </p>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
