# Cortex: Design System & Frontend Architecture (`design.md`)

Este documento estabelece a especificação visual, os contratos de componentes e a arquitetura de segurança para o cliente desktop do **Cortex** construído com **Tauri**, **React**, **Tailwind CSS** e **Shadcn UI**.

---

## 1. Diretrizes Visuais & Apple HIG (Human Interface Guidelines)

O Cortex deve operar como uma extensão nativa do macOS Sonoma/Sequoia, adotando efeito de translucidez profunda (*Liquid Glass*), tipografia do sistema e contrastes refinados.

### Tokens de Cor e Superfícies (Dark Mode Nativo)

* **Background Base (Canvas da Janela):** `rgba(18, 18, 24, 0.72)` com `backdrop-filter: blur(28px) saturate(190%)`.
* **Superfícies de Cards (Elevated Surface):** `rgba(255, 255, 255, 0.04)` em repouso, elevando para `rgba(255, 255, 255, 0.08)` no hover.
* **Bordas & Separadores (Hairline Borders):** `1px solid rgba(255, 255, 255, 0.08)` com inner highlight sutil: `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.06)`.
* **Dock Lateral (Rail):** `rgba(15, 15, 20, 0.85)` com cantos `rounded-2xl` e borda `border-white/10`.
* **Cores de Acento & Status:**
* *Unread / Badge:* `#3B82F6` (Azul Elétrico Apple) e `#EF4444` (Badge de Notificação Crítica).
* *Calendar Indicators:* Barras de destaque verticais de 3px em `#10B981` (Reunião), `#38BDF8` (Foco), `#F59E0B` (Pessoal).


* **Tipografia:**
* *Interface & Leitura:* `SF Pro Text`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`.
* *Headings & Títulos:* `SF Pro Display`, tracking `-0.02em`.
* *Escala de Texto:* Primário em `#FFFFFF` (100%), secundário em `rgba(255, 255, 255, 0.65)`, metadados/timestamps em `rgba(255, 255, 255, 0.40)`.



---

## 2. Arquitetura de Janelas no Tauri (Dual-Display Mode)

O aplicativo deve suportar alternância dinâmica entre dois modos de exibição configuráveis pelo usuário:

```
                  ┌────────────────────────────────────────┐
                  │          macOS Screen Space            │
                  │                                        │
[Menu Bar Mode]   │  [Tray Icon] ────► [Floating Popover]  │
                  │                                        │
[Dock Hub Mode]   │         [Flyout Panel] ◄─── [Edge Dock]│
                  └────────────────────────────────────────┘

```

### Modo A: Lateral Edge Dock (Padrão)

* **Posicionamento:** Janela flutuante ancorada verticalmente na borda direita da tela (`always_on_top: true`).
* **Flyout Panel:** Ao clicar em um ícone da dock vertical (Inbox, Calendar, Quick Notes), um painel flutuante desliza suavemente (`width: 380px`, `height: 580px`) ancorado imediatamente à esquerda da dock.
* **Vibrancy Nativa:** O Tauri deve instanciar `NSVisualEffectView` no macOS (`window.set_vibrancy`) garantindo desfoque em GPU a 60fps sem sobrecarga de CSS.

### Modo B: Menu Bar Popover (Modo Minimalista)

* **Posicionamento:** Ícone residente na barra de status superior do macOS (`SystemTray`).
* **Comportamento:** Ao clicar no ícone da Menu Bar, a dock lateral se oculta e a janela do Cortex abre como um popover posicionado centralizado imediatamente abaixo do ícone do sistema.
* **Auto-Hide:** A janela monitora eventos de perda de foco (`on_window_event: Focused(false)`) e se oculta automaticamente quando o usuário clica fora.

---

## 3. Mapeamento & Integração Shadcn UI

O Shadcn UI deve ser inicializado com estilo `new-york` e cor base `zinc`. Os componentes primitivos mapeiam diretamente a interface:

| Componente Cortex | Primitivo Shadcn UI | Papel no Layout |
| --- | --- | --- |
| **Janela / Flyout** | `Popover` / `Sheet` | Container flutuante com abertura sem recarregar estado |
| **App Switcher (Topo)** | `ToggleGroup` / `Tabs` | Filtro entre Gmail, WhatsApp, Slack e Instagram |
| **Lista de Itens / Threads** | `ScrollArea` | Rolagem fluida estilo macOS sem scrollbars visíveis de browser |
| **Contatos & Notificações** | `Avatar` + `Badge` | Avatar do remetente com badge de prioridade ou status não-lido |
| **Card de Reunião Expandido** | `Collapsible` / `Accordion` | Expansão de detalhes com botão Zoom e lista de convidados |
| **Atalhos de Teclado** | `Tooltip` | Exibição de dicas de atalhos (`⌘K`, `Esc`) ao passar o mouse |
| **Rascunho & Obsidian Note** | `Textarea` + `Button` | Editor de texto limpo com botões de 1-clique para IA |

### Regras de Customização e Overrides de Estilo (HIG Overrides)

* **Remoção de Fundos Sólidos:** Substituir classes padrão `bg-background` e `bg-popover` por utilitários de vidro: `bg-[#121218]/75 backdrop-blur-xl`.
* **Hairline Borders:** Aplicar `border-white/10` e `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]` em todos os botões e containers.
* **Raio de Borda:** Utilizar `rounded-2xl` para containers principais e dock; `rounded-xl` para cards internos e campos de entrada.
* **Scrollbars:** Proibido uso de overflow nativo do browser; todas as listas roláveis devem usar estritamente o `ScrollArea` do Shadcn.

---

## 4. Decomposição dos Componentes de Interface

### 1. `DockRail.jsx`

* Barra vertical flutuante contendo os ícones principais de navegação (Notificações, Calendário, Notas Rápidas, Configurações).
* Estado ativo representado por um marcador branco sólido à esquerda ou fundo com iluminação sutil.
* Badge vermelho absoluto no ícone de notificações indicando urgências `HIGH`.

### 2. `AppSwitcherPills.jsx`

* Localizado no topo do painel de Inbox.
* Permite filtrar mensagens por serviço através de botões pílula com ícones: Geral, Gmail, Slack, WhatsApp, Instagram.

### 3. `NotificationCard.jsx`

* Card individual da lista de e-mails/notificações.
* Contém: Avatar, Indicador de não lido (dot azul), Nome do Remetente, Assunto/Snippet e Timestamp relativo formatado.
* Badge dinâmico indicando urgência (`HIGH` em vermelho, `Requires Action` em amarelo).

### 4. `CalendarTimeline.jsx` & `MeetingDetailCard.jsx`

* Navegação no topo (`< Today >`).
* Lista de blocos de tempo com linha vertical indicando o status do evento.
* Card expandido exibindo:
* Título, horário e organizador.
* Botão de ação primária: "Join with Google Meet / Zoom" com link limpo.
* Lista de convidados com status de RSVP (Confirmado, Pendente).



### 5. `ObsidianQuickNote.jsx`

* Campo de título com sanitização em tempo real (removendo caracteres inválidos `/ \ : * ? " < > |`).
* Área de texto com realce sintático básico para wikilinks `[[Nota]]`, tags `#tag` e callouts `> [!NOTE]`.
* Barra inferior com sugestões de formatação clicáveis e atalho `⌘+Enter` para salvar no disco local.

### 6. `QuickReplyBox.jsx`

* Fixado na base da visualização de threads de e-mail.
* Exibe 3 pílulas de resposta rápida geradas pela IA (ex: "Confirmar Proposta", "Adiar Alinhamento", "Pedir Detalhes").
* Campo de texto expansível com botões auxiliares para anexo, comandos de IA e disparo.

---

## 5. Micro-Interações & Animações (Framer Motion)

* **Abertura de Flyout:** `scale: 0.98 -> 1.0` e `opacity: 0 -> 1` com transição `duration: 0.18s, ease: [0.16, 1, 0.3, 1]`.
* **Transição de Abas:** Deslocamento sutil no eixo Y de `4px` com `duration: 0.12s, ease: "easeOut"`.
* **Cliques em Botões e Cards:** Animação de compressão suave (`whileTap={{ scale: 0.97 }}`).
* **Indicador Ativo da Dock:** Layout compartilhado via `layoutId="activeDockIndicator"` para transição contínua entre ícones.

---

## 6. Segurança do Frontend (Zero Trust & `security.md`)

* **Isolamento Criptográfico de Tokens:**
* Proibido o armazenamento de JWTs ou dados sensíveis em `localStorage` ou `sessionStorage`.
* Tokens de sessão devem ser persistidos através do cofre seguro do sistema operacional via `tauri-plugin-stronghold` ou `tauri-plugin-store` criptografado.


* **Prevenção de XSS (DOM Sanitization):**
* Todo conteúdo HTML de e-mails e trechos de Markdown deve ser sanitizado obrigatoriamente usando `DOMPurify` com tags restritas antes da renderização.


* **Execução Segura de Links Externos:**
* Nenhum link web (como reuniões do Zoom ou links de e-mail) pode abrir dentro do WebView do app.
* Links devem ser interceptados e despachados via API de shell nativa do Tauri (`shell.open(url)`), garantindo abertura no navegador padrão do macOS.


* **Permissões Estritas de Arquivos (Tauri Scopes):**
* O `tauri.conf.json` deve restringir permissões de leitura/escrita estritamente ao diretório do Obsidian selecionado pelo usuário.
* Tentativas de escrita contendo caminhos relativos de escape (`../`, `/etc/`, `C:\`) devem ser bloqueadas no frontend antes de atingir o Rust.


* **Tratamento de Sessão e Blocklist:**
* O cliente HTTP do frontend deve interceptar respostas `401 Unauthorized`. Caso o backend aponte token revogado (Redis Blocklist), o cliente deve limpar a sessão imediatamente e exibir a tela de conexão.



---

## 7. Configuração de Estilo Global (`globals.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 4%;
    --surface: 240 6% 10%;
    --surface-hover: 240 6% 15%;
    --surface-border: 0 0% 100% / 0.08;
    --primary-accent: 217 91% 60%;
    --text-primary: 0 0% 98%;
    --text-secondary: 240 5% 65%;
    --text-muted: 240 4% 45%;
    --radius-dock: 1.25rem;
    --radius-card: 0.75rem;
  }
}

.mac-vibrancy {
  background: rgba(18, 18, 24, 0.72);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.hairline-border {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Ocultar barras de rolagem nativas preservando a funcionalidade */
::-webkit-scrollbar {
  display: none;
}
* {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

```