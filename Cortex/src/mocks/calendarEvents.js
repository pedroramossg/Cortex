/**
 * Mock data conforming to Google Calendar & Apple EventKit schema.
 * Strictly typed with Zero Trust principles (security.md Check 2 & Check 15).
 * Zero credentials, zero auth tokens, safe for client-side rendering.
 */

export const MOCK_CALENDAR_EVENTS = [
  {
    id: "evt-1",
    title: "Sprint Planning & Architecture Sync",
    description: "Alinhamento das entregas da semana, review do Rust Window Engine e refinamento dos cards de calendário.",
    startTime: "09:00",
    endTime: "09:45",
    duration: "45 min",
    categoryColor: "#10B981", // Verde esmeralda (Reuniões)
    category: "meeting",
    platform: "zoom", // 'zoom' | 'meet' | 'teams'
    meetingLink: "https://zoom.us/j/98765432101",
    organizer: "Pedro Ramos (You)",
    isOrganizer: true,
    attendees: [
      { name: "Pedro Ramos", email: "pedro@cortex.ai", status: "accepted", isYou: true },
      { name: "Tahlia Smith", email: "tahlia@cortex.ai", status: "accepted" },
      { name: "Marcus Aurelius", email: "marcus@cortex.ai", status: "tentative" },
      { name: "Sarah Connor", email: "sarah@cortex.ai", status: "needsAction" }
    ]
  },
  {
    id: "evt-2",
    title: "Deep Work: Cortex Liquid Glass & Rust Engine",
    description: "Bloco de foco ininterrupto para otimização de renderização GPU e IPC listeners.",
    startTime: "10:30",
    endTime: "12:00",
    duration: "1h 30m",
    categoryColor: "#38BDF8", // Azul elétrico (Foco / Deep Work)
    category: "focus",
    platform: null,
    meetingLink: null,
    organizer: "Pedro Ramos (You)",
    isOrganizer: true,
    attendees: [
      { name: "Pedro Ramos", email: "pedro@cortex.ai", status: "accepted", isYou: true }
    ]
  },
  {
    id: "evt-3",
    title: "Client Presentation — Enterprise AI Roadmap",
    description: "Apresentação dos recursos de automação e triagem inteligente para diretoria executiva.",
    startTime: "14:00",
    endTime: "14:30",
    duration: "30 min",
    categoryColor: "#10B981", // Verde esmeralda (Reuniões)
    category: "meeting",
    platform: "meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    organizer: "Satya Nadella",
    isOrganizer: false,
    attendees: [
      { name: "Satya Nadella", email: "satya@microsoft.com", status: "accepted" },
      { name: "Pedro Ramos", email: "pedro@cortex.ai", status: "accepted", isYou: true },
      { name: "Elena Rostova", email: "elena@partner.com", status: "accepted" }
    ]
  },
  {
    id: "evt-4",
    title: "1:1 Sync de Alinhamento Técnico",
    description: "Discussão de carreira, feedback do sprint e próximos passos na stack Tauri v2.",
    startTime: "16:00",
    endTime: "16:30",
    duration: "30 min",
    categoryColor: "#F59E0B", // Âmbar / Dourado (Pessoal / 1:1)
    category: "one_on_one",
    platform: "meet",
    meetingLink: "https://meet.google.com/xyz-uvwx-rst",
    organizer: "Marcus Aurelius",
    isOrganizer: false,
    attendees: [
      { name: "Marcus Aurelius", email: "marcus@cortex.ai", status: "accepted" },
      { name: "Pedro Ramos", email: "pedro@cortex.ai", status: "accepted", isYou: true }
    ]
  }
];
