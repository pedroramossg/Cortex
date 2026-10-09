import React, { useState, useMemo } from "react";
import { 
  FileText, 
  Search, 
  Plus, 
  Tag, 
  Clock, 
  ExternalLink,
  Sparkles
} from "lucide-react";
import { cn } from "cn";

/**
 * Mock data de notas sincronizadas com o Obsidian Vault local
 */
const MOCK_VAULT_NOTES = [
  {
    id: "note-1",
    title: "Briefing Arquitetural: Hit-Testing Passivo macOS",
    date: "Hoje às 10:45",
    tags: ["arquitetura", "rust", "tauri"],
    tagColor: "border-purple-500/30 text-purple-300 bg-purple-500/15",
    preview: "Pipeline de janela transparente com zero resize Cocoa. O monitor vigiar_cursor despacha eventos diretamente ao WebKit sem ghost clicks.",
  },
  {
    id: "note-2",
    title: "Post-Mortem: Incidente de Latência Redis P1",
    date: "Ontem às 18:20",
    tags: ["ops", "incidente", "infra"],
    tagColor: "border-red-500/30 text-red-300 bg-red-500/15",
    preview: "Spike na fila de triagem automática contornado via réplicas automáticas do worker. Adicionada regra de auto-drain no cluster de produção.",
  },
  {
    id: "note-3",
    title: "Alinhamento Estratégico Enterprise Q4",
    date: "Há 2 dias",
    tags: ["roadmap", "negócios"],
    tagColor: "border-blue-500/30 text-blue-300 bg-blue-500/15",
    preview: "Diretrizes para distribuição corporativa do Cortex com modelos locais protegidos e integração bidirecional com Google Workspace e Apple Calendar.",
  },
  {
    id: "note-4",
    title: "Design System: Niko Tokens & Elevação 120Hz",
    date: "Há 4 dias",
    tags: ["design", "ui"],
    tagColor: "border-emerald-500/30 text-emerald-300 bg-emerald-500/15",
    preview: "Especificação de superfícies escuras profundas (#0e0e10, #161618), cantos arredondados de 14px/22px e iluminação interna com gradientes líquidos.",
  },
];

export function ObsidianNotesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState(null);

  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return MOCK_VAULT_NOTES;
    const term = searchTerm.toLowerCase();
    return MOCK_VAULT_NOTES.filter(
      (note) =>
        note.title.toLowerCase().includes(term) ||
        note.preview.toLowerCase().includes(term) ||
        note.tags.some((t) => t.toLowerCase().includes(term))
    );
  }, [searchTerm]);

  return (
    <div className="flex flex-col h-full max-h-[600px] justify-between overflow-hidden select-none">
      {/* Search Input */}
      <div className="pb-2.5 shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] bg-[#161618] border border-white/[0.06] text-xs">
          <Search className="w-3.5 h-3.5 text-[#9a9aa0] shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar notas no vault (ex: 'arquitetura')..."
            className="w-full bg-transparent text-[#f2f2f2] placeholder:text-[#9a9aa0]/60 outline-none text-xs"
          />
        </div>
      </div>

      {/* Header Info */}
      <div className="flex items-center justify-between pb-2 px-1 shrink-0">
        <span className="text-[10.5px] font-medium tracking-[0.08em] text-[#9a9aa0] uppercase">
          {filteredNotes.length} notas sincronizadas
        </span>
        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full">
          ~/Documents/Obsidian/Vault
        </span>
      </div>

      {/* Lista Rolável de Notas com scrollbar invisível */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 scrollbar-none min-h-0">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;
            return (
              <div
                key={note.id}
                onClick={() => setSelectedNoteId(isSelected ? null : note.id)}
                className={cn(
                  "cartao-clicavel rounded-[14px] p-3.5 flex flex-col gap-1.5 relative transition-all cursor-pointer",
                  "bg-[#161618] border border-white/[0.06] hover:border-white/[0.14]",
                  isSelected && "border-[#a78bfa]/50 bg-[#1d1d20] shadow-[0_0_16px_rgba(167,139,250,0.15)] ring-1 ring-[#a78bfa]/40"
                )}
              >
                {/* Título & Data */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-[#a78bfa] shrink-0" />
                    <h3 className="text-xs font-semibold text-[#f2f2f2] tracking-tight leading-snug truncate">
                      {note.title}
                    </h3>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono tabular-nums shrink-0">
                    {note.date}
                  </span>
                </div>

                {/* Preview de 2 linhas em tipografia limpa */}
                <p className="text-[11.5px] text-[#9a9aa0] line-clamp-2 leading-relaxed pl-5">
                  {note.preview}
                </p>

                {/* Tags Coloridas */}
                <div className="flex items-center gap-1.5 pl-5 pt-0.5 flex-wrap">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "text-[9px] font-medium tracking-[0.06em] uppercase px-1.5 py-0.5 rounded border",
                        note.tagColor
                      )}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2 text-white/40 h-full min-h-[160px]">
            <FileText className="w-8 h-8 opacity-40" />
            <p className="text-xs">Nenhuma nota encontrada no filtro.</p>
          </div>
        )}
      </div>

      {/* Botão Inferior de Nova Nota */}
      <div className="pt-2 shrink-0">
        <button
          type="button"
          onClick={() => {}}
          className="w-full py-2.5 px-3 rounded-[14px] bg-[#161618] hover:bg-[#1d1d20] border border-white/[0.08] hover:border-white/[0.16] text-[#f2f2f2] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Nova Nota no Vault</span>
        </button>
      </div>
    </div>
  );
}

export default ObsidianNotesTab;
