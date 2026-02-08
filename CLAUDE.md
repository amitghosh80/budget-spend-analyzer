# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal finance web application that ingests PDF bank/credit card statements, categorizes transactions, tracks monthly trends, and provides spending insights. Built with a React + TypeScript frontend and FastAPI backend.

## Development Commands

### Frontend (from `frontend/` directory)
```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:5173
npm run build        # Production build
npm run preview      # Preview production build
```

### Backend (from `backend/` directory)
```bash
pip install -r requirements.txt                    # Install dependencies
uvicorn app.main:app --reload --port 8000          # Start dev server on http://localhost:8000
```

Both servers must run simultaneously for full functionality. The frontend expects the backend at `http://localhost:8000`.

## Architecture

### Backend Structure (`backend/app/`)
- `main.py` - FastAPI app with CORS middleware (allows localhost:5173)
- `routes/` - API endpoint handlers
- `services/` - Business logic (PDF parsing, categorization, insights)
- `services/types.py` - Pydantic schemas for API request/response models
- `storage/` - File persistence; uploaded PDFs stored in `storage/setup_uploads/`

### Frontend Structure (`frontend/src/`)
- `App.tsx` - Root component, renders Setup page
- `pages/` - Page components (Setup for historical import flow)
- `api/` - API client functions using fetch
- `components/` - Reusable UI components (planned: charts, tables)

### Data Flow
1. User uploads PDF statements via frontend
2. Backend stores PDFs and generates fingerprints for deduplication
3. Backend parses transactions and builds monthly snapshots
4. Frontend displays categorized spending, trends, and insights

### Key API Endpoints
- `POST /setup/uploads` - Upload historical PDF statements
- `GET /setup/insights` - Retrieve aggregated insights from uploaded statements

## Data Model (defined in `services/types.py`)

- **SetupUploadResult** - Upload response with file status
- **SetupInsights** - Monthly aggregates, category breakdowns, recommendations
- **SetupCategorySummary** - Category name, total, and percentage
- **SetupMonthlyNet** - Month-by-month income/expenses/net

## Current State

The app is in early development. The one-time setup flow for historical statement import is partially implemented with placeholder/estimated data. PDF parsing produces mock insights rather than actual parsed transactions.

Planned features per `plan.md`:
- PDF parsing adapters per issuer
- Rules-based transaction categorization
- Dashboard with fixed income/costs at top
- Monthly trend charts
- Markdown-based context/rules for enriching categorization
