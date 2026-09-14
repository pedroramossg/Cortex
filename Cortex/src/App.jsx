import { useState } from "react";
import { DockRail } from "@/components/dock/DockRail";

function App() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(true);
  const [highUrgencyCount, setHighUrgencyCount] = useState(3);

  return (
    <div className="relative min-h-screen w-full bg-transparent overflow-hidden text-white select-none">
      {/* Lateral Dock Flutuante */}
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

      {/* Flyout Panel Preview (Liquid Glass) */}
      {isFlyoutOpen && (
        <aside
          aria-label="Cortex Flyout Panel"
          className="mac-vibrancy fixed right-20 top-1/2 -translate-y-1/2 w-[380px] h-[580px] rounded-2xl flex flex-col p-5 shadow-2xl z-40"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                {activeTab === "inbox" && "Inbox & Prioridades"}
                {activeTab === "calendar" && "Calendário & Reuniões"}
                {activeTab === "obsidian" && "Notas Obsidian"}
                {activeTab === "settings" && "Configurações"}
              </h2>
              <p className="text-xs text-white/50">Cortex Intelligent Workspace</p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              macOS HIG
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/70">
              ✨
            </div>
            <p className="text-xs text-white/60">
              Fase 2 concluída com sucesso. <br />
              Próximos passos: <strong className="text-white">AppSwitcherPills</strong> &{" "}
              <strong className="text-white">NotificationList</strong>
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
