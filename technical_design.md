## Technical Design Document: Monthly Spend Analyzer

### Goals
- Ingest PDF bank/credit card statements (incremental uploads and full monthly statements).
- Normalize transactions, categorize spend, and track monthly trends.
- Highlight big fixed income/costs at top of the dashboard.
- Provide recommendations and historical insights.
- Support optional markdown rules/context to refine categorization.
- Offer a one-time setup flow for backfilling historical months.

### Non-Goals (MVP)
- Real-time bank syncing (Plaid/Finicity)
- Advanced ML categorization (rules-first, ML later)
- Complex multi-user permissions

## Architecture Overview

### Frontend
- React (TypeScript) single-page app
- Pages:
  - Setup (one-time historical import + insights)
  - Upload (monthly incremental uploads)
  - Dashboard (fixed items, trends, categories, recommendations)
- Components:
  - FixedItemsSummary (top highlights)
  - MonthlyTrendChart
  - CategoryBreakdown
  - RecommendationsPanel
- API Client:
  - Axios or Fetch wrapper with typed responses

### Backend
- FastAPI app
- Modules:
  - routes/ for upload, transactions, insights
  - services/ for parsing, categorization, recommendations
  - models/ for pydantic schemas
  - storage/ for SQLite persistence
- Storage:
  - SQLite for MVP
  - Planned upgrade path to Postgres

## Data Model

### Transaction
- id
- date
- amount
- description
- merchant
- account_id
- category_id
- type (income/expense)
- fingerprint (dedupe hash)
- source_import_id

### Category
- id
- name
- type (fixed / variable / income)
- rules (keywords, regex, MCCs)

### MonthlySnapshot
- month
- total_income
- total_spend
- category_totals
- fixed_items
- recommendations

### ImportAudit
- id
- file_name
- upload_time
- issuer
- parsed_count
- new_count
- duplicate_count

## Core Workflows

### 1. Incremental PDF Upload
1. User uploads PDF.
2. Backend parses PDF -> raw transactions.
3. Normalize each transaction and compute fingerprint.
4. Deduplicate (skip or update existing).
5. Store in DB and record ImportAudit.
6. Update monthly snapshot.

### 2. Full Monthly Statement Upload
- Same pipeline, but marks snapshot as authoritative.
- Overrides aggregated incremental snapshot if provided.

### 3. One-Time Setup Flow
1. User uploads prior monthly statements.
2. Backend builds historical snapshots.
3. Insights generated:
   - recurring patterns
   - baseline fixed income/costs
   - category trends
4. Recommendations produced once.

## PDF Parsing Strategy
- Pluggable adapters per issuer (regex + template)
- Normalize into common transaction format
- Unmatched lines logged for review
- Future: allow manual correction tool

## Categorization Strategy
- Rules-first pipeline:
  - Merchant keyword rules
  - Category overrides from .md files
- Optional ML hook for later iteration

## Markdown Context/Rules
- docs/statements/ -> statement-level rules
- docs/entries/ -> entry-level overrides
- Used to refine categorization, highlight fixed items, or add notes.

## Fixed Items Summary
- Identified by:
  - Category type = fixed
  - Threshold rules (amount > X)
  - .md overrides
- Displayed at top of dashboard:
  - Fixed income
  - Fixed costs

## Recommendations Engine
- Simple heuristics:
  - Overspend in category vs trend
  - High burn rate mid-month
  - Rising recurring costs
- Future: ML-based suggestions

## API Endpoints

- POST /uploads
  - body: statement PDF
  - response: import audit + new transactions count

- GET /transactions
  - filters: month, category, type

- GET /insights/:month
  - monthly snapshot, fixed items, recommendations

- POST /setup
  - upload multiple historical statements
  - response: baseline insights

## Security & Privacy
- Local-first storage (SQLite)
- Option to encrypt statement files at rest
- Future: user auth and accounts

## Future Enhancements
- CSV ingestion
- Bank integrations (Plaid)
- ML classification model
- Budgeting + forecasting tools
