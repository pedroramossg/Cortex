import React, { useState, useRef, useImperativeHandle } from "react";
import { Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import calendarApi from "@/services/calendarApi";
import { cn } from "cn";

/**
 * QuickEventInput: Campo de inserção rápida em linguagem natural no estilo macOS Liquid Glass.
 * Interpreta texto em pt-BR (data, horário e título) e grava diretamente no Apple Calendar.
 */
export const QuickEventInput = React.forwardRef(function QuickEventInput(
  {
    placeholder = "Adicionar rápido (ex: 'reunião com hélio quinta às 15h')...",
    autoFocus = false,
    className,
    onEventCreated,
  },
  ref
) {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdCal, setCreatedCal] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const internalInputRef = useRef(null);

  useImperativeHandle(ref, () => internalInputRef.current);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Obter metadados de âncora temporal local
      const now = new Date();
      const anchorDate = calendarApi.getLocalDateKey(now);
      const dayOfWeek = now.toLocaleDateString("pt-BR", { weekday: "long" });
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

      // 2. Coletar calendários graváveis conhecidos para inferência semântica
      const cals = await calendarApi.getAppleCalendars().catch(() => []);
      const writableCals = cals.filter((c) => c.isWritable);
      const availableCalendars = writableCals.map((c) => c.title || c.id);

      // 3. Parser de Linguagem Natural com Roteamento Semântico
      const parsed = await calendarApi.parseQuickEvent(trimmed, {
        anchorDate,
        dayOfWeek,
        timeZone,
        availableCalendars,
      });

      // 4. Mapeamento do Calendário Alvo com Preservação de Cor
      let targetCalObj = null;
      if (parsed.targetCalendar) {
        targetCalObj = cals.find(
          (c) => (c.title || c.id || "").toLowerCase() === parsed.targetCalendar.toLowerCase()
        );
      }
      if (!targetCalObj) {
        const savedPref =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("cortex_default_calendar")
            : null;
        if (savedPref) {
          targetCalObj = cals.find(
            (c) => (c.title || c.id || "").toLowerCase() === savedPref.toLowerCase()
          );
        }
        if (!targetCalObj) {
          targetCalObj = writableCals[0] || { title: "Pessoal", colorHex: "#38BDF8" };
        }
      }

      const targetCal = targetCalObj?.title || targetCalObj?.id || "Pessoal";
      const targetColor = targetCalObj?.colorHex || "#38BDF8";

      // 5. Criação no Apple Calendar via Rust IPC + Mutação Otimista no Cache
      const createdId = await calendarApi.createAppleCalendarEvent({
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        calendarName: targetCal,
        categoryColor: targetColor,
      });

      // 6. Feedback visual de sucesso com pílula da agenda
      setCreatedCal({ name: targetCal, color: targetColor });
      setText("");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setCreatedCal(null);
      }, 2000);

      onEventCreated?.({
        id: createdId,
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        calendarName: targetCal,
        categoryColor: targetColor,
      });
    } catch (err) {
      console.error("[QuickEventInput] Falha ao criar evento:", err);
      setErrorMsg(err.message || "Falha ao criar");
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn("relative w-full group", className)}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          "relative flex items-center w-full rounded-xl transition-all duration-200",
          "bg-white/[0.05] hover:bg-white/[0.08] focus-within:bg-white/[0.09]",
          "border border-white/10 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30",
          "shadow-inner backdrop-blur-md px-2.5 py-1.5",
          isSuccess && "border-emerald-500/40 bg-emerald-500/10",
          errorMsg && "border-red-500/40 bg-red-500/10"
        )}
      >
        {/* Ícone Indicador à Esquerda */}
        <div className="shrink-0 flex items-center justify-center mr-2">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : isSuccess ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-75 duration-200" />
          ) : errorMsg ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-blue-400/70 group-hover:text-blue-400 transition-colors" />
          )}
        </div>

        {/* Campo de Texto ou Pílula de Sucesso */}
        {isSuccess && createdCal ? (
          <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-300 font-medium select-none animate-in fade-in zoom-in-95 duration-200">
            <span>Criado em</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[11px] font-medium text-white shadow-sm">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(255,255,255,0.4)]"
                style={{ backgroundColor: createdCal.color }}
              />
              <span className="truncate max-w-[130px]">{createdCal.name}</span>
            </span>
          </div>
        ) : (
          <input
            ref={internalInputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            disabled={isLoading}
            placeholder={errorMsg ? errorMsg : placeholder}
            className={cn(
              "flex-1 bg-transparent border-0 outline-none p-0 text-xs text-white",
              "placeholder:text-white/40 placeholder:text-[11.5px] disabled:opacity-60",
              errorMsg && "placeholder:text-red-300"
            )}
          />
        )}

        {/* Botão Glow "Create" com Brilho Azul-Gelo (Fiel à Imagem 3) */}
        <div className="shrink-0 flex items-center gap-1 ml-1.5">
          {text.trim().length > 0 && !isLoading ? (
            <GlowButton type="submit" size="sm" title="Criar evento (Enter)">
              <span>Create</span>
              <span className="text-[11px] font-mono opacity-80 font-bold ml-0.5">↵</span>
            </GlowButton>
          ) : (
            !isLoading && !isSuccess && (
              <kbd className="hidden sm:inline-block text-[9.5px] font-mono text-white/30 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                ↵
              </kbd>
            )
          )}
        </div>
      </form>
    </div>
  );
});

export default QuickEventInput;
