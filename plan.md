---
name: Monthly Spend Analyzer
overview: Plan a React + FastAPI app that ingests PDF statements, categorizes transactions, shows monthly trends, and provides recommendations.
todos:
  - id: models
    content: Define Transaction/Category/Insight schemas
    status: pending
  - id: api
    content: Create FastAPI endpoints for upload+insights
    status: pending
  - id: parser
    content: Implement PDF parsing adapters
    status: pending
  - id: income
    content: Implement income identification from docs/rules/income.md
    status: pending
  - id: income-review-ui
    content: Build income review/confirmation UX and persist confirmed records
    status: pending
  - id: categorize
    content: Add rules-based categorization + recs
    status: pending
  - id: ui
    content: Build React upload + dashboard UI
    status: pending
  - id: integrate
    content: Wire frontend to backend APIs
    status: pending
isProject: false
---

## Approach

- Build a web app with a React (TypeScript) frontend and a FastAPI backend, with a shared data model for transactions, categories, and monthly insights.
- Start with PDF ingestion only; use a pluggable parsing pipeline so CSV can be added later without rework.
- Identify income transactions (salary, rental, pension, freelance, etc.) using keyword matching, recurring pattern detection, and exclusion filters defined in `docs/rules/income.md`.
- Present identified income to the user in a review/confirmation flow before persisting. The user can confirm, reclassify, or dismiss each detected income source. Confirmed income records are saved to the backend as the authoritative source of truth for downstream categorization and insights.
- Implement a rules-first categorizer (merchant keywords, MCCs if present) with optional ML hooks later.
- Produce monthly trend metrics (budget vs actual, category deltas, burn rate) and derive simple recommendation heuristics.
- Treat each PDF upload as an incremental import with transaction deduplication and audit logs.
- Support optional markdown-based context/rules to enrich statements or specific entries.
- Add historical monthly trackers built either from aggregated incremental uploads or direct full monthly statement uploads.
- Highlight big fixed income and fixed costs (salary, mortgage, rent, utilities, insurance) at the top of the dashboard.
- Provide a one-time setup flow to ingest prior months and generate baseline insights and recommendations.

## Proposed structure

- Backend: `backend/` FastAPI app
  - `backend/app/main.py` for API setup
  - `backend/app/routes/` for upload, transactions, insights
  - `backend/app/services/` for parsing, categorization, recommendations
  - `backend/app/models/` for pydantic schemas
  - `backend/app/storage/` for file/transaction persistence (start with SQLite)
- `backend/app/storage/imports` for upload audit records and dedupe fingerprints
- `backend/app/storage/monthly` for historical monthly statement snapshots
- Frontend: `frontend/` React app
  - `frontend/src/pages/` for dashboard and upload
  - `frontend/src/components/` for charts and tables
  - `frontend/src/api/` for API client
- `frontend/src/components/FixedItemsSummary` for top-level fixed income/costs
- `frontend/src/pages/Setup` for one-time historical import and insights
- `frontend/src/pages/IncomeReview` (or step within Setup) for reviewing and confirming detected income sources
- Shared docs: `docs/plan.md` (or `plan.md` at repo root, per your request)
- Categorization rules: `docs/rules/` for markdown-based identification rules (e.g., `income.md`)
- Context/rules docs: `docs/statements/` for statement-level `.md` notes and rules
- Entry hints: `docs/entries/` for per-transaction `.md` context and overrides

## Key data flow

1. User completes one-time setup to upload prior months (optional).
2. User uploads PDF statements in the UI (multiple times per month), and optionally a full monthly statement.
2. Backend parses PDFs into normalized transactions.
3. Backend dedupes by fingerprint and stores upload audit details.
4. Backend builds or updates monthly snapshots from aggregated uploads or direct statement upload.
5. Income identifier classifies credits as salary, rental, or other income using rules from `docs/rules/income.md`, filtering out transfers, refunds, and rewards.
6. Frontend presents detected income sources to the user for review — each item shows the matched rule, amount, frequency, and confidence level. User can confirm, reclassify, or dismiss each entry.
7. Backend persists user-confirmed income records as the authoritative classification. Future imports auto-match against confirmed sources without re-prompting.
8. Categorizer maps remaining transactions to spend categories, applying optional `.md` context/rules.
9. Backend computes monthly trend metrics, fixed income/costs summary, and recommendations.
10. Frontend visualizes fixed items at top, then spend by category and month-to-date trend.
11. Setup flow shows historical insights and baseline recommendations.

## Assumptions

- PDF parsing quality varies by issuer; we will start with a best-effort parser and log unmatched lines for manual review.
- SQLite is sufficient for MVP; can swap to Postgres later.
- Markdown rules are optional; if present they should override or enrich categorization logic.
- Historical monthly snapshots can be derived from uploads or replaced by full statement imports if available.
- Fixed items are identified by category and/or user-provided `.md` rules; thresholds define "big" items.
- One-time setup can backfill historical snapshots and recurring patterns.

## Todos

- Define data models for Transaction, Category, and MonthlyInsight
- Set up FastAPI endpoints for upload, list transactions, and insights
- Implement PDF parsing pipeline with issuer-specific adapters
- Implement income identification service using keyword matching, recurring pattern detection, and exclusion filters from `docs/rules/income.md`
- Build income review UX: present detected income sources with matched rule, amount, frequency, and confidence; allow user to confirm, reclassify, or dismiss
- Add backend endpoints and storage to persist user-confirmed income records; auto-match confirmed sources on future imports
- Build categorization rules and recommendation heuristics
- Add fixed income/costs summary in insights
- Create React UI for upload, trends, and recommendations
- Build one-time setup flow for historical import
- Wire API client and end-to-end flow
