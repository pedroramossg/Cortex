import React, { useState, useEffect } from "react";
import { 
  Palette, 
  Calendar as CalendarIcon, 
  Command, 
  Sparkles, 
  SlidersHorizontal,
  Check,
  Monitor
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import calendarApi from "@/services/calendarApi";
import { cn } from "cn";

export function SettingsTab({ dockPreset = "Right", onPresetChange }) {
  const [activePreset, setActivePreset] = useState(dockPreset);
  const [proMotion120, setProMotion120] = useState(true);
  const [liquidGlass, setLiquidGlass] = useState(true);
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [calendarSettings, setCalendarSettings] = useState(() => calendarApi.getCalendarSettings());

  useEffect(() => {
    calendarApi.getAppleCalendars()
      .then((cals) => {
        if (Array.isArray(cals)) {
          setAvailableCalendars(cals);
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

  return (
    <div className="flex flex-col h-full max-h-[600px] justify-between overflow-hidden select-none">
      {/* Lista Rolável de Seções Modulares com scrollbar invisível */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-none min-h-0">
        {/* Seção 1: Aparência & Ancoragem */}
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

        {/* Seção 2: Calendários Ocultos */}
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

        {/* Seção 3: Atalhos Globais */}
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
