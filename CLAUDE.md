# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Project Direction — Read First

This codebase is being migrated from a **localStorage demo** to a **multi-tenant SaaS** backed by Supabase (PostgreSQL + Auth + RLS), deployed on Vercel. The full charter with binding rules lives in **`docs/000-charter.md`** — read it before any change. Key rules:

- Work in small, verifiable phases; present a plan before editing; never mix phases in one change.
- Preserve the current UI; no redesigns without explicit request.
- Every business table gets `organization_id` + Row Level Security; authorization is checked server-side and DB-side, never frontend-only.
- No `service_role` key in the browser; no secrets in `NEXT_PUBLIC_*`; no financial data in `localStorage` (the current localStorage store is legacy, being replaced).
- Money: consistent documented representation (no unsafe floats). Balances derive from movements — never stored as an independent source of truth. Related operations (payment + document + movement) run in one DB transaction. Confirmed movements are never silently deleted; changes generate `audit_logs` entries.
- Run build/lint/tests after each phase; a phase isn't done with a failing build.
- Initial scope order: auth → organizations → members/roles → company/profile → financial accounts → contacts → data-access layer → RLS → audit logs. Gamification, AI, WhatsApp, billing, bank integration are out of scope for now.
- Document important decisions in `docs/`; small descriptive commits.

## Development Commands

- **`npm run dev`** — Start the Next.js dev server at http://localhost:3000
- **`npm run build`** — Build for production
- **`npm start`** — Run production build
- **`npm test`** — No test suite currently in place; use manual testing in the browser

Demo data is stored in browser localStorage (`zeromaka_v3` key), not persisted to any backend.

## High-Level Architecture

**ZeroMaka** is a financial management ERP for Angolan businesses. It's a Next.js client-side app (no backend) with all data stored in localStorage, seeded with demo content on first load.

### Key Domains

**Finances** (`/lib/data.ts` types: Account, Transaction, Invoice)
- **Accounts**: Bank accounts, mobile wallets (M-Pesa, Unitel Money, etc.), cash. Each has `initialBalance` and `currentBalance` (mutated by transactions).
- **Transactions**: Income, expense, transfers, and capital movements (partner contributions/withdrawals). Marked `isSale` to auto-calculate tax. Tax is *included* in the amount, not added (calculated via `taxIncluded()` utility).
- **Invoices**: Receivables (customer sales) and payables (supplier purchases). Tracked separately from transactions; when marked paid, they generate a transaction and update the account balance.

**Tax** (Angolan-specific in `/lib/data.ts`)
- Three regimes (controlled by `Company.regime`):
  - Geral: 14% IVA
  - Simplificado: 7% IVA
  - Isencao: 1% Imposto de Selo (stamp tax)
- Tax is *calculated inside the sale amount*, not as a margin. `taxIncluded()` extracts the tax portion from a pre-tax-inclusive sale price.
- Only applied to **sales** (transactions where `isSale: true`), not other income.

**Operations** (`Contact`, `Requisition`, partner capital)
- **Contacts**: Clients, suppliers, partners. Linked by ID to transactions/invoices.
- **Requisitions**: Approval workflow for fund requests (expense creation). Statuses: pending → approved/rejected.
- **Partner Capital**: Tracked via `capital_in` / `capital_out` transactions. Shown separately in balance sheet as liability (not profit/loss).

**Gamification** (`Badge`, `UserProfile`)
- XP awarded for actions (adding accounts, transactions, invoices). Levels and badges track engagement.
- Stored in `profile` context state.

### State Management

**Single source of truth**: React Context (`lib/store.tsx`)
- All mutations go through `useStore()` methods (e.g., `addTransaction()`, `markPaid()`).
- Each mutation auto-calculates derived state (tax, balance updates, due dates).
- Synced to localStorage after every change; hydrated on mount.

**Route structure**:
- `/login` — Demo auth (any email).
- `/(app)/*` — Protected routes (sidebar + mobile nav). Auto-redirects to login if `!authed`.
- Sidebar shows nav links; mobile bottom bar shows 5 key routes.

### Data Model Notes

- **ID generation**: Prefixed by type (`a` for accounts, `t` for transactions, `i` for invoices, `r` for requisitions, `lk` for transfer links). Followed by `Date.now()` for uniqueness.
- **Transfers**: Linked pair of `transfer_out` + `transfer_in` transactions sharing a `linkId` (deleted together).
- **Dates**: ISO string format (`YYYY-MM-DD`). Utilities: `daysUntil()`, `fmtDate()`, `fmtKz()` for formatting.
- **Categories & Subcategories**: Transaction categories are context-aware (income vs. expense). Invoices have their own category set (sales vs. purchases). Requisitions use expense categories.

### Layout & Styling

- **Typography**: Archivo Black (display) + Inter (body) from Google Fonts.
- **Colors**: Dark theme (ink-950/ink-900 background, ink-300/ink-400 text, maka-400 accent). Utility colors for account types (bank=maka, mobile=emerald, cash=yellow).
- **CSS**: Tailwind + PostCSS autoprefixer. No CSS-in-JS.
- **Components**: Minimal component tree. Most pages are single-file pages with local useState for UI-only state (modals, filters). No reusable component library.

## Common Workflows

**Adding a feature (e.g., a new transaction type)**:
1. Add type to `/lib/data.ts` (enum, interface, constants).
2. Update `Store` interface in `/lib/store.tsx` if mutations are needed.
3. Implement mutation logic (balance updates, validation, error handling).
4. Create or update a page component to expose the UI.
5. Hook the page into `/(app)/` routing.

**Debugging state**:
- Inspect `localStorage` in DevTools for the `zeromaka_v3` key.
- Use React DevTools Context inspector to observe store mutations in real-time.

**Modifying tax logic**:
- Change `REGIMES` constant in `data.ts` for rates.
- `taxIncluded()` extracts tax from a sale amount; adjust if the calculation model changes.

## Future Backend Integration

The store is designed for a drop-in backend swap:
- Replace Context mutation calls with API POST/PUT/DELETE calls in `lib/store.tsx`.
- Keep the same interface; pages don't need changes.
- Consider adding loading/error states to each mutation.

README mentions Supabase as a candidate for the free-tier backend.
