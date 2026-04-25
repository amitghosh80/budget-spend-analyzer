---
name: Monthly Spend Analyzer
overview: React + FastAPI app that ingests PDF statements, identifies income, categorizes expenses, and provides cashflow insights.
todos:
  - id: income
    content: Phase 1 — Income identification flow
    status: done
  - id: expenses-backend
    content: Phase 2 — Expense categorization backend (parser, categorizer, SQLite, API)
    status: pending
  - id: expenses-frontend
    content: Phase 2 — Expense UI (upload, review table, dashboard charts)
    status: pending
  - id: cashflow
    content: Phase 3 — Net cashflow analysis and savings recommendations
    status: pending
isProject: true
---

## Phase 1: Income Identification — COMPLETE

- [x] PDF parsing (pdfplumber, regex, garbled marker recovery)
- [x] Income detection rules (salary, rental, pension, freelance, interest, Zelle/Venmo)
- [x] 3-step wizard UI (Upload → Review → Confirmed)
- [x] Keyword rescan for missed income
- [x] Per-month amount editing
- [x] AES-256-GCM encryption at rest
- [x] 48-hour auto-deletion on startup
- [x] Security banner, 12-file limit, upload logging
- [x] Corrupt PDF detection
- [x] Regression test suite (89 tests)

## Phase 2: Expense Categorization & Visualization — NEXT

See `expenses.md` (PRD) and `technical_design.md` (architecture).

### Backend
- [ ] SQLite setup (`storage/expenses.db`)
- [ ] Expense categorizer service (rules engine, 15+ standard categories)
- [ ] Credit card payment exclusion (detect CC payments in checking, avoid double-count)
- [ ] `POST /expenses/upload` — Upload CC PDFs, merge with bank data, categorize
- [ ] `GET /expenses/transactions` — Paginated, filterable expense list
- [ ] `GET /expenses/summary` — Aggregated totals, category breakdown, monthly trend
- [ ] `POST /expenses/categorize` — Bulk re-categorize transactions
- [ ] `GET/POST /expenses/categories` — Category management
- [ ] `GET /expenses/export` — CSV export
- [ ] Transaction deduplication by fingerprint

### Frontend
- [ ] ExpenseUpload page (reuse upload pattern, CC-specific)
- [ ] ExpenseReview page (sortable table, inline category editing, search/filter)
- [ ] ExpenseDashboard page (pie chart, bar chart, summary metrics)
- [ ] Install Recharts for visualization
- [ ] Navigation between Income and Expense modules
- [ ] Category chip components with color coding

### Testing
- [ ] Expense categorizer unit tests
- [ ] CC payment exclusion tests
- [ ] SQLite storage tests
- [ ] End-to-end expense flow tests

## Phase 3: Net Cashflow & Recommendations — FUTURE

- [ ] Monthly net cashflow (income - expenses)
- [ ] Savings rate calculation
- [ ] Spending anomaly detection
- [ ] Simple recommendation heuristics
- [ ] Dashboard combining income + expenses
- [ ] Cashflow trend line chart
