export type ChangeEntry = { version: string; date: string; title: string; items: string[]; tag?: "feat" | "fix" | "flagship" };

export const CHANGELOGS: ChangeEntry[] = [
  {
    version: "0.16.0",
    date: "2026-10-09",
    title: "App Lock v2 + Version in Settings",
    tag: "feat",
    items: [
      "Lock choice: fingerprint, 4-digit or 6-digit PIN with hashed storage",
      "Re-lock loop eliminated; Android version shown in Settings",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-10-08",
    title: "Request Alerts + Owner Triage",
    tag: "flagship",
    items: [
      "Requesters get notified on approve, reject, reconcile and comments",
      "Owner triage view: thumb-sized approve/reject cards",
      "Serif amounts, health rings, calmer gamification-free mobile",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-10-08",
    title: "App Lock Loop Fix",
    tag: "fix",
    items: [
      "Fingerprint unlock no longer re-locks instantly",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-10-08",
    title: "Native Power Batch",
    tag: "flagship",
    items: [
      "Approve and review straight from the notification",
      "Deep links, home widget, share sheet, biometric lock",
      "Due-date reminders, system theme, themed launcher icon",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-10-08",
    title: "Chart Corrections",
    tag: "fix",
    items: [
      "Value labels on every bar, all axis labels shown, calm donut",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-10-08",
    title: "Pine Chart System",
    tag: "feat",
    items: [
      "Solid pine bars on tonal tracks, serif money tooltips",
      "Donut with centered total and chip legend",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-10-08",
    title: "Native Statement Tables",
    tag: "feat",
    items: [
      "Lists restack as labeled ledger cards on phones, no sideways scroll",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-08",
    title: "Ledger-Pine Rebrand",
    tag: "flagship",
    items: [
      "Pine, bone and amber identity; Fraunces money figures",
      "Zero gradients; inverse-surface heroes and tonal chips",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-10-08",
    title: "M3 Motion Pass",
    items: [
      "Eased drawer, springy FAB, staggered items, live nav pill",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-10-08",
    title: "Material Shell Redesign",
    tag: "flagship",
    items: [
      "M3 navigation bar, top app bar, quick-add FAB, modal drawer",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-08",
    title: "Native Shell Feel",
    tag: "feat",
    items: [
      "Branded icon and splash, themed bars, back navigation, safe-area",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-09-14",
    title: "Flagship Batch — Risk, Pulse, Kanban, Studio, Focus",
    tag: "flagship",
    items: [
      "Approval Risk Card flagship: radial ring + gradient + confetti on approve",
      "Live Pulse Header: burn rate, runway days, sparkline, health dot",
      "Xero Inbox Kanban: Ready vs Review columns with score rings",
      "Receipt Studio 2.0: drag-drop studio + mock OCR auto-fill",
      "Focus Mode: Cmd+J drawer + Command Palette flagship promotion",
      "Ask BudgetApp copilot already flagship — now dockable anywhere",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-14",
    title: "Ask BudgetApp Flagship Copilot",
    tag: "feat",
    items: [
      "14-intent on-device engine with suggestions, history, copy",
      "Flagship panel with gradient hero, threaded bubbles, localStorage",
      "Gemini context now includes ledger + savings goals",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-14",
    title: "Build Split + Supabase Align",
    tag: "fix",
    items: [
      "Vite manualChunks: 1.2MB monolith → 322k main + split",
      "Supabase project_id aligned to frxzokdrpvdqcmbkjwcw",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-13",
    title: "Space + Ledger Flagship",
    items: ["Personal ledger, monthly budgets, note blocks, private notes"],
  },
  {
    version: "0.1.0",
    date: "2026-09-12",
    title: "Initial Scaffold",
    items: ["Budgets, requests, ledger, RLS, realtime, PWA, tour"],
  },
];
