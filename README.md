# Budget Spend Analyzer

A personal finance web app that ingests PDF bank and credit card statements, identifies income, categorizes expenses, and provides monthly cashflow insights.

## Features

- **PDF statement parsing** — uploads and parses bank and credit card PDFs from any issuer
- **Income detection** — auto-identifies salary, rental, and other recurring income using keyword and pattern matching, with Claude AI as a fallback
- **Expense categorization** — rules-based engine covers 15+ categories (mortgage, utilities, dining, travel, etc.) with a Claude AI fallback for uncategorized transactions
- **CC payment filtering** — detects and excludes credit card payments, internal transfers, and income credits to prevent double-counting
- **Encrypted storage** — PDFs encrypted with AES-256-GCM at rest; transaction DB encrypted with SQLCipher; 48-hour auto-deletion of uploaded files
- **Cashflow dashboard** — monthly income vs. expenses vs. net, category pivot table, top merchants, CSV export
- **Category editor** — edit keyword rules and re-run categorization across all transactions
- **Optional auth** — register/login to persist sessions, or continue as a guest

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python 3.11+, FastAPI |
| Database | SQLite (SQLCipher encrypted) |
| PDF parsing | pdfplumber |
| Encryption | cryptography (AES-256-GCM) |
| Auth | bcrypt + HS256 JWT |
| AI | Anthropic Claude API (optional fallback) |

## Getting Started

Both servers must run simultaneously. The frontend expects the backend at `http://localhost:8000`.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Environment variables (optional)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude AI fallback for categorization |
| `GMAIL_APP_PASSWORD` | Enables new-signup email notifications |

## User Flow

```
1. Income
   Upload PDFs → Auto-detect income → Review & confirm amounts

2. Expenses
   Upload additional PDFs → Categorized transaction list → Dashboard

3. Insights
   Monthly cashflow chart · Category pivot · Top merchants · CSV export
```

Income figures confirmed in step 1 flow through to the cashflow chart in step 3, using frequency-aware conversion (biweekly, weekly, monthly, quarterly, one-time).

## Project Structure

```
backend/app/
  main.py                     FastAPI app, CORS config, startup file cleanup
  models.py                   Pydantic request/response models
  routes/
    income.py                 /income/* endpoints
    expenses.py               /expenses/* endpoints
    auth.py                   /auth/* endpoints
  services/
    pdf_parser.py             PDF → transaction extraction
    income_identifier.py      Income detection rules
    expense_categorizer.py    Rules-based categorization engine
    cc_payment_detector.py    CC payment / transfer exclusion
    database.py               SQLCipher DB access
    encryption.py             AES-256-GCM encrypt/decrypt
    auth.py                   Password hashing, JWT, user store
    notifications.py          Gmail SMTP signup alerts

frontend/src/
  App.tsx                     3-phase wizard shell, nav state
  pages/
    UploadStatements.tsx      Income PDF upload
    IncomeReview.tsx          Income detection review
    IncomeConfirmed.tsx       Confirmed income summary
    ExpenseUpload.tsx         Expense PDF upload
    ExpenseReview.tsx         Transaction review table
    ExpenseDashboard.tsx      Category charts + pivot table
    InsightsDashboard.tsx     Cashflow analysis
    CategoryEditor.tsx        Keyword rule editor
    AuthGate.tsx              Login / register / guest
  api/
    incomeApi.ts              Income endpoint client
    expenseApi.ts             Expense endpoint client
    authApi.ts                Auth endpoint client

docs/rules/
  income.md                   Income detection rule definitions
```

## API Endpoints

### Income

| Method | Path | Description |
|---|---|---|
| `POST` | `/income/upload` | Upload PDFs, detect income transactions |
| `GET` | `/income/detected` | Retrieve cached detected income |
| `POST` | `/income/confirm` | Persist user-confirmed income sources |
| `GET` | `/income/confirmed` | Read persisted confirmed income |

### Expenses

| Method | Path | Description |
|---|---|---|
| `POST` | `/expenses/upload` | Upload PDFs and categorize expenses |
| `GET` | `/expenses/transactions` | List transactions (filterable by month, category, account) |
| `GET` | `/expenses/summary` | Category totals and monthly breakdown |
| `GET` | `/expenses/pivot` | Month × category pivot table |
| `GET` | `/expenses/cashflow` | Monthly income vs. expenses vs. net |
| `GET` | `/expenses/merchants` | Top merchants by spend |
| `GET` | `/expenses/account-breakdown` | Spend by account source |
| `GET` | `/expenses/categories` | List all categories |
| `POST` | `/expenses/categories` | Create or update a custom category |
| `POST` | `/expenses/categorize` | Bulk re-categorize transactions |
| `POST` | `/expenses/recategorize` | Re-apply keyword rules to all auto-categorized transactions |
| `GET` | `/expenses/export` | Download transactions as CSV |

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Obtain JWT token |
| `GET` | `/auth/me` | Verify token, return user info |

## Security Notes

- Uploaded PDFs are encrypted on disk (AES-256-GCM) and automatically deleted after 48 hours
- The transaction database is encrypted with SQLCipher; the key is stored in `.db_encryption_key` (not committed)
- Confirmed income is stored in an encrypted `.enc` file
- User credentials are bcrypt-hashed and stored in an encrypted JSON file
- JWT secrets are generated randomly on first run and stored locally

## Customizing Categories

Category keyword rules can be edited live in the app (Insights → Edit Categories) or directly in `backend/app/services/expense_categorizer.py`. After updating rules, use the **Re-categorize** button (or `POST /expenses/recategorize`) to re-apply rules to all existing transactions.

Income detection rules are documented in `docs/rules/income.md`.
