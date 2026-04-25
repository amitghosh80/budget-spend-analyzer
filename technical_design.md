# Technical Design: Monthly Spend Analyzer

## Project Phases

| Phase | Module | Status | PRD |
|-------|--------|--------|-----|
| 1 | Income Identification | **Complete** | `income.md` |
| 2 | Expense Categorization & Visualization | **Planned** | `expenses.md` |
| 3 | Net Cashflow Analysis & Savings Recommendations | Future | TBD |

---

## Phase 1: Income Identification (Complete)

### What's Built
- PDF upload with encryption (AES-256-GCM) and 48-hour auto-deletion
- Transaction extraction from checking/savings PDFs (pdfplumber, regex)
- Rules-based income detection: salary, rental, pension, freelance, interest, payments
- 3-step wizard UI: Upload → Review/Confirm → Summary
- Keyword rescan for missed income
- Per-month amount editing with overrides
- Confirmed income persisted to JSON

### Architecture
```
backend/app/
  main.py                     — FastAPI app, CORS, lifespan (48h purge)
  models.py                   — Pydantic schemas (all phases)
  routes/income.py            — Upload, detect, rescan, confirm endpoints
  services/pdf_parser.py      — PDF text extraction → RawTransaction
  services/income_identifier.py — Rules engine for income classification
  services/encryption.py      — AES-256-GCM encrypt/decrypt
  storage/uploads/            — Encrypted PDFs (temp)
  storage/confirmed_income.json — Persisted income records
  storage/upload_log.json     — Audit trail

frontend/src/
  App.tsx                     — Root, manages wizard step state
  pages/UploadStatements.tsx  — Step 1: file upload + validation
  pages/IncomeReview.tsx      — Step 2: review, edit, confirm/dismiss
  pages/IncomeConfirmed.tsx   — Step 3: summary + monthly breakdown
  api/incomeApi.ts            — TypeScript types + fetch wrappers

tests/
  conftest.py                 — Shared fixtures, 12 unique test PDFs
  test_pdf_parser.py          — 23 tests: transaction counts, garbled recovery, BytesIO
  test_income_detection.py    — 51 tests: rules, end-to-end, keyword search, monthly
  test_encryption.py          — 9 tests: roundtrip, tamper, key management
  test_auto_deletion.py       — 6 tests: purge old/keep recent/logging
```

### API Endpoints (Phase 1)
- `POST /income/upload` — Upload PDFs, parse, detect income
- `GET /income/detected` — Cached detected income
- `POST /income/rescan` — Keyword search on cached transactions
- `POST /income/confirm` — Persist user confirmations
- `GET /income/confirmed` — Read confirmed income

---

## Phase 2: Expense Categorization & Visualization (Design)

### Overview

Phase 2 takes ALL transactions (from Phase 1's checking/savings uploads plus new credit card uploads), excludes confirmed income and CC payments, categorizes the remaining expenses, and presents them in an interactive dashboard with charts.

### Key Design Decisions

**Storage: SQLite**
Phase 1 used JSON files for simplicity. Phase 2 involves thousands of transactions with filtering, grouping, and search — JSON won't scale. We'll introduce SQLite (`storage/expenses.db`) for the expense module. Income data stays in JSON (it's small and already works).

**Categorization: Rules-first, same pattern as income**
Keyword-matching rules for standard categories, with a fallback "Uncategorized" bucket. Same architecture as `income_identifier.py` but for expenses. No ML in MVP.

**Credit card parsing: Extend existing parser**
The current `pdf_parser.py` extracts `date + description + amount` from any PDF. Credit card statements follow a similar format. We'll extend it to also detect *debit* transactions (purchases) and add an `account_source` field to `RawTransaction`.

**Transaction deduplication**
Fingerprint each transaction by `date + description + amount` hash. Skip duplicates when the same statement is re-uploaded.

### Data Model Additions

```python
# New models in backend/app/models.py

class ExpenseTransaction(BaseModel):
    id: str                     # UUID
    date: str                   # YYYY-MM-DD (normalized)
    amount: float               # Always positive
    description: str            # Original transaction text
    merchant: str               # Cleaned merchant name
    category: str               # Assigned category slug
    category_source: str        # "auto" | "user"
    account_source: str         # "checking" | "savings" | "credit_card"
    account_label: str          # e.g. "Chase Checking", "Amex Gold"
    is_excluded: bool           # True for CC payments, transfers
    exclusion_reason: str | None # "cc_payment" | "transfer" | None
    fingerprint: str            # Dedup hash

class ExpenseCategory(BaseModel):
    slug: str                   # e.g. "food_dining", "mortgage"
    name: str                   # "Food & Dining"
    type: str                   # "fixed" | "variable"
    is_custom: bool             # User-created?
    keywords: list[str]         # Matching keywords

class ExpenseSummary(BaseModel):
    total_expenses: float
    avg_monthly: float
    category_totals: list[CategoryTotal]
    monthly_totals: list[MonthlyExpenseTotal]
    excluded_count: int         # CC payments excluded

class CategoryTotal(BaseModel):
    category: str
    name: str
    total: float
    percentage: float
    transaction_count: int

class MonthlyExpenseTotal(BaseModel):
    month: str                  # "Jan 2025"
    total: float
    category_breakdown: dict[str, float]

class ExpenseUploadResponse(BaseModel):
    total_files: int
    stored_files: int
    file_results: list[FileResult]
    transaction_count: int
    new_transactions: int
    duplicate_count: int
    categorized_count: int
    excluded_count: int         # CC payments auto-excluded

class CategoryUpdate(BaseModel):
    transaction_ids: list[str]
    new_category: str

class CategoryDefinition(BaseModel):
    slug: str
    name: str
    keywords: list[str]
```

### Standard Expense Categories

```python
EXPENSE_CATEGORIES = {
    "mortgage":       {"name": "Mortgage / Rent",      "type": "fixed",    "keywords": ["MORTGAGE", "HOME LOAN", "QUICKEN LOANS", ...]},
    "utilities":      {"name": "Utilities",            "type": "fixed",    "keywords": ["ELECTRIC", "GAS BILL", "WATER", "SEWER", "PSE&G", ...]},
    "insurance":      {"name": "Insurance",            "type": "fixed",    "keywords": ["INSURANCE", "GEICO", "STATE FARM", "ALLSTATE", ...]},
    "food_dining":    {"name": "Food & Dining",        "type": "variable", "keywords": ["RESTAURANT", "DOORDASH", "UBER EATS", "GRUBHUB", "MCDONALD", ...]},
    "groceries":      {"name": "Groceries",            "type": "variable", "keywords": ["GROCERY", "SAFEWAY", "KROGER", "COSTCO", "TRADER JOE", "WHOLE FOODS", ...]},
    "transportation": {"name": "Transportation",       "type": "variable", "keywords": ["GAS STATION", "CHEVRON", "SHELL", "UBER", "LYFT", "PARKING", ...]},
    "healthcare":     {"name": "Healthcare",           "type": "variable", "keywords": ["PHARMACY", "CVS", "WALGREEN", "DOCTOR", "HOSPITAL", "DENTAL", ...]},
    "entertainment":  {"name": "Entertainment",        "type": "variable", "keywords": ["NETFLIX", "SPOTIFY", "HULU", "DISNEY", "CINEMA", "THEATER", ...]},
    "shopping":       {"name": "Shopping",             "type": "variable", "keywords": ["AMAZON", "TARGET", "WALMART", "BEST BUY", "APPLE.COM", ...]},
    "subscriptions":  {"name": "Subscriptions",        "type": "fixed",    "keywords": ["SUBSCRIPTION", "ANNUAL FEE", "MEMBERSHIP", ...]},
    "travel":         {"name": "Travel",               "type": "variable", "keywords": ["AIRLINE", "HOTEL", "AIRBNB", "BOOKING.COM", "EXPEDIA", ...]},
    "education":      {"name": "Education",            "type": "variable", "keywords": ["TUITION", "UNIVERSITY", "SCHOOL", "UDEMY", "COURSERA", ...]},
    "personal_care":  {"name": "Personal Care",        "type": "variable", "keywords": ["SALON", "BARBER", "SPA", "GYM", "FITNESS", ...]},
    "pets":           {"name": "Pets",                 "type": "variable", "keywords": ["PET", "VET", "PETCO", "PETSMART", ...]},
    "home":           {"name": "Home & Garden",        "type": "variable", "keywords": ["HOME DEPOT", "LOWES", "IKEA", "FURNITURE", ...]},
    "uncategorized":  {"name": "Uncategorized",        "type": "variable", "keywords": []},
}
```

### Credit Card Payment Exclusion

```python
CC_PAYMENT_KEYWORDS = [
    "PAYMENT TO AMERICAN EXPRESS", "PAYMENT TO AMEX",
    "CHASE CREDIT CARD PAYMENT", "PAYMENT TO CHASE CARD",
    "CAPITAL ONE PAYMENT", "PAYMENT TO CAPITAL ONE",
    "DISCOVER PAYMENT", "PAYMENT TO DISCOVER",
    "CREDIT CARD PAYMENT", "CARD PAYMENT",
    "PAYMENT THANK YOU",
]
```

Logic: When processing checking/savings transactions for expenses, any transaction matching CC payment keywords is flagged as `is_excluded=True, exclusion_reason="cc_payment"`. These are hidden from the expense table but viewable via a toggle.

### Backend New Files

```
backend/app/
  routes/expenses.py            — Expense module endpoints
  services/expense_categorizer.py — Rules engine for expense classification
  services/cc_payment_detector.py — Credit card payment exclusion logic
  storage/expenses.db           — SQLite database

docs/rules/expenses.md          — Category rules reference
```

### API Endpoints (Phase 2)

```
POST /expenses/upload           — Upload credit card PDFs
  - Parses CC statements
  - Pulls in cached checking/savings transactions from Phase 1
  - Categorizes all non-income, non-excluded transactions
  - Returns ExpenseUploadResponse

GET /expenses/transactions      — List categorized expenses
  - Query params: month, category, account, search, include_excluded
  - Paginated response

GET /expenses/summary           — Aggregated expense summary
  - Query params: start_month, end_month
  - Returns ExpenseSummary (totals, category breakdown, monthly trend)

POST /expenses/categorize       — Bulk re-categorize transactions
  - Body: CategoryUpdate (list of IDs + new category)
  - Returns updated transactions

GET /expenses/categories        — List all categories (standard + custom)
POST /expenses/categories       — Create/update custom category

GET /expenses/export            — Export as CSV
  - Query params: month, category
```

### SQLite Schema

```sql
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,              -- YYYY-MM-DD
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    merchant TEXT,
    category TEXT DEFAULT 'uncategorized',
    category_source TEXT DEFAULT 'auto',  -- 'auto' or 'user'
    account_source TEXT NOT NULL,    -- 'checking', 'savings', 'credit_card'
    account_label TEXT,
    is_income INTEGER DEFAULT 0,
    is_excluded INTEGER DEFAULT 0,
    exclusion_reason TEXT,
    fingerprint TEXT UNIQUE,
    source_file TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'variable',   -- 'fixed' or 'variable'
    is_custom INTEGER DEFAULT 0,
    keywords TEXT,                  -- JSON array of keywords
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_fingerprint ON transactions(fingerprint);
CREATE INDEX idx_transactions_month ON transactions(substr(date, 1, 7));
```

### Frontend New Files

```
frontend/src/
  pages/ExpenseUpload.tsx        — CC statement upload (reuses UploadStatements pattern)
  pages/ExpenseReview.tsx        — Categorized expense table with inline editing
  pages/ExpenseDashboard.tsx     — Charts + summary metrics
  components/PieChart.tsx        — Category breakdown chart
  components/BarChart.tsx        — Monthly spending chart
  components/ExpenseTable.tsx    — Sortable/filterable expense table
  components/CategoryChip.tsx    — Color-coded category pill
  api/expenseApi.ts              — TypeScript types + fetch wrappers
```

**Charting library:** Recharts (lightweight, React-native, good TypeScript support).

### Frontend Flow

The app will expand from a 3-step income wizard to a multi-module layout:

```
App.tsx
  ├── Income Flow (existing 3-step wizard)
  │     ├── UploadStatements
  │     ├── IncomeReview
  │     └── IncomeConfirmed
  │
  └── Expense Flow (new, accessible after income confirmed)
        ├── ExpenseUpload      — Upload CC PDFs, merge with bank data
        ├── ExpenseReview      — Table: browse, search, re-categorize
        └── ExpenseDashboard   — Pie chart, bar chart, summary stats
```

Navigation: After income confirmation, a "Continue to Expenses" button leads to the expense flow. A simple tab/nav bar allows switching between Income and Expense modules.

### Integration with Phase 1

1. **Transaction reuse:** When expense upload runs, the backend pulls ALL previously parsed checking/savings transactions (from `_transactions_cache` or re-parses from encrypted storage). Transactions already classified as income (matching confirmed income IDs) are flagged `is_income=True` and excluded from expense totals.

2. **CC payment exclusion:** Checking transactions matching CC payment keywords are flagged `is_excluded=True` so they don't inflate expense totals.

3. **Unified timeline:** Both income and expenses share the same date range from uploaded statements, enabling Phase 3's net cashflow analysis.

### Processing Pipeline

```
1. User uploads CC PDFs
2. Parse CC transactions → RawTransaction[]
3. Load checking/savings transactions from cache or re-parse
4. Deduplicate by fingerprint
5. Mark income transactions (cross-ref with confirmed_income.json)
6. Mark CC payment transactions (keyword matching on checking txns)
7. Categorize remaining transactions (rules engine)
8. Store all in SQLite
9. Return summary to frontend
```

---

## Phase 3: Net Cashflow & Recommendations (Future)

### Concept
Combine Phase 1 (income) and Phase 2 (expenses) to produce:
- Monthly net cashflow (income - expenses)
- Cashflow trend over time
- Fixed vs. variable expense ratio
- Savings rate calculation
- Spending anomaly detection
- Simple recommendations ("You spent 30% more on dining this month")

### Data Sources
- `confirmed_income.json` — Monthly income totals by source
- `expenses.db` — Monthly expense totals by category
- Computed: net = income - expenses per month

### Likely Endpoints
```
GET /cashflow/summary           — Net cashflow, savings rate, trends
GET /cashflow/recommendations   — AI-generated savings tips
```

### Frontend
- Dashboard page combining income + expense summaries
- Net cashflow line chart
- Savings rate gauge
- Recommendations panel

---

## Security & Privacy (All Phases)

- **Encryption at rest:** AES-256-GCM for all uploaded PDFs (`services/encryption.py`)
- **Auto-deletion:** 48-hour retention policy on uploaded files, immediate deletion on confirmation
- **Audit logging:** Upload and deletion events logged to `upload_log.json`
- **File validation:** PDF-only, 12-file limit per upload
- **Security banner:** Displayed before file upload
- **Local-first:** All data stored locally, no external services
- **No raw PDF retention:** Only transaction metadata persisted; PDFs deleted after processing

## Non-Goals (MVP)
- Real-time bank syncing (Plaid/Finicity)
- Advanced ML categorization (rules-first, ML later)
- Complex multi-user permissions
- CSV ingestion (future enhancement)
- Mobile-responsive design (desktop-first)
