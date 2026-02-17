"""Expense module API endpoints."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.models import (
    CategoryDefinition,
    CategoryTotal,
    CategoryUpdate,
    ExpenseSummary,
    ExpenseTransaction,
    ExpenseUploadResponse,
    FileResult,
    MonthlyExpenseTotal,
    PivotCell,
    PivotRow,
    PivotTable,
)
from app.services.cc_payment_detector import get_exclusion_reason
from app.services.database import (
    get_all_categories,
    get_connection,
    get_pivot,
    get_summary,
    get_transactions,
    insert_transaction,
    update_categories,
    upsert_category,
)
from app.services.encryption import decrypt, encrypt
from app.services.expense_categorizer import (
    EXPENSE_CATEGORIES,
    categorize_transaction,
    clean_merchant_name,
    get_category_name,
)
from app.services.pdf_parser import extract_transactions

router = APIRouter()

STORAGE_DIR = Path(__file__).resolve().parents[1] / "storage" / "uploads"
CONFIRMED_PATH = Path(__file__).resolve().parents[1] / "storage" / "confirmed_income.enc"
_LEGACY_JSON_PATH = Path(__file__).resolve().parents[1] / "storage" / "confirmed_income.json"
MAX_FILES = 12

logger = logging.getLogger(__name__)


def _fingerprint(date: str, description: str, amount: float) -> str:
    """Create a dedup fingerprint from date + description + amount."""
    raw = f"{date}|{description.strip().upper()}|{amount:.2f}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _normalize_date(date_str: str) -> str:
    """Normalize MM/DD or MM/DD/YY(YY) to YYYY-MM-DD.

    If no year is present, uses the current year.
    """
    parts = date_str.strip().split("/")
    if len(parts) == 2:
        month, day = parts
        year = str(datetime.now().year)
    elif len(parts) == 3:
        month, day, year = parts
        if len(year) == 2:
            year = "20" + year
    else:
        return date_str
    return f"{year}-{int(month):02d}-{int(day):02d}"


def _month_label(iso_date: str) -> str:
    """Convert YYYY-MM-DD to 'Jan 2025' style label."""
    try:
        dt = datetime.strptime(iso_date[:7], "%Y-%m")
        return dt.strftime("%b %Y")
    except ValueError:
        return iso_date[:7]


def _load_confirmed_income_data() -> list[dict]:
    """Load confirmed income from the encrypted .enc file (or legacy .json)."""
    # Migrate legacy plaintext if needed
    if _LEGACY_JSON_PATH.exists() and not CONFIRMED_PATH.exists():
        try:
            raw = _LEGACY_JSON_PATH.read_text(encoding="utf-8")
            CONFIRMED_PATH.write_bytes(encrypt(raw.encode("utf-8")))
            _LEGACY_JSON_PATH.unlink()
        except Exception:
            pass
    if not CONFIRMED_PATH.exists():
        return []
    try:
        plaintext = decrypt(CONFIRMED_PATH.read_bytes())
        return json.loads(plaintext.decode("utf-8"))
    except Exception:
        return []


def _load_confirmed_income_ids() -> set[str]:
    """Load the set of confirmed income source IDs."""
    return {item["id"] for item in _load_confirmed_income_data()}


def _load_confirmed_income_descriptions() -> set[str]:
    """Load sample descriptions from confirmed income to match against transactions."""
    descs: set[str] = set()
    for item in _load_confirmed_income_data():
        descs.add(item.get("source_name", "").upper())
    return descs


def _is_income_transaction(description: str, income_names: set[str]) -> bool:
    """Check if a transaction matches a confirmed income source."""
    desc_upper = description.upper()
    for name in income_names:
        if name and name in desc_upper:
            return True
    return False


# Import the income module's transaction cache for reuse
def _get_bank_transactions():
    """Pull cached checking/savings transactions from the income module."""
    from app.routes.income import _transactions_cache
    return list(_transactions_cache)


@router.post("/upload", response_model=ExpenseUploadResponse)
async def upload_expenses(files: List[UploadFile] = File(...)) -> ExpenseUploadResponse:
    """Upload credit card PDFs, merge with bank data, categorize all expenses."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    file_results: List[FileResult] = []
    cc_transactions = []

    # Parse uploaded CC statements
    for upload in files[:MAX_FILES]:
        fname = upload.filename or "unknown"
        if not fname.lower().endswith(".pdf"):
            file_results.append(FileResult(filename=fname, status="skipped", error="Not a PDF"))
            continue

        stored_name = f"cc_{uuid4().hex[:8]}_{_safe(fname)}"
        stored_path = STORAGE_DIR / stored_name
        try:
            content = await upload.read()
            txns = extract_transactions(BytesIO(content))
            stored_path.write_bytes(encrypt(content))

            for txn in txns:
                cc_transactions.append((txn, fname, "credit_card"))

            file_results.append(
                FileResult(
                    filename=fname,
                    stored_as=stored_name,
                    size_bytes=len(content),
                    status="stored" if txns else "warning",
                    error=None if txns else "No transactions found.",
                    transaction_count=len(txns),
                )
            )
        except Exception as exc:
            file_results.append(FileResult(filename=fname, status="error", error=str(exc)))

    # Pull in checking/savings transactions from Phase 1
    bank_txns = _get_bank_transactions()
    bank_data = [(txn, "bank_statement", "checking") for txn in bank_txns]

    # Combine all transactions
    all_txn_data = cc_transactions + bank_data

    # Load confirmed income info for exclusion
    income_names = _load_confirmed_income_descriptions()

    conn = get_connection()
    total_inserted = 0
    duplicate_count = 0
    categorized_count = 0
    excluded_count = 0

    try:
        for txn, source_file, account_source in all_txn_data:
            date = _normalize_date(txn.date)
            fp = _fingerprint(txn.date, txn.description, txn.amount)

            # Check if this is income
            is_income = _is_income_transaction(txn.description, income_names)

            # Check if this is a CC payment or transfer
            exclusion = get_exclusion_reason(txn.description) if account_source != "credit_card" else None

            # Categorize expense
            if is_income or exclusion:
                cat_slug, cat_name = "uncategorized", "Uncategorized"
            else:
                cat_slug, cat_name = categorize_transaction(txn.description)
                categorized_count += 1

            merchant = clean_merchant_name(txn.description)

            inserted = insert_transaction(
                conn,
                id=uuid4().hex[:12],
                date=date,
                amount=txn.amount,
                description=txn.description,
                merchant=merchant,
                category=cat_slug,
                category_source="auto",
                account_source=account_source,
                account_label=source_file,
                is_income=is_income,
                is_excluded=bool(exclusion),
                exclusion_reason=exclusion,
                fingerprint=fp,
                source_file=source_file,
            )

            if inserted:
                total_inserted += 1
                if exclusion:
                    excluded_count += 1
            else:
                duplicate_count += 1

        conn.commit()
    finally:
        conn.close()

    # Seed standard categories into the categories table
    _seed_categories()

    return ExpenseUploadResponse(
        total_files=len(file_results),
        stored_files=sum(1 for f in file_results if f.status in ("stored", "warning")),
        file_results=file_results,
        transaction_count=len(all_txn_data),
        new_transactions=total_inserted,
        duplicate_count=duplicate_count,
        categorized_count=categorized_count,
        excluded_count=excluded_count,
    )


@router.get("/transactions", response_model=List[ExpenseTransaction])
def list_transactions(
    month: Optional[str] = Query(None, description="Filter by month (YYYY-MM)"),
    category: Optional[str] = Query(None),
    account: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    include_excluded: bool = Query(False),
) -> List[ExpenseTransaction]:
    """List categorized expense transactions with optional filters."""
    conn = get_connection()
    try:
        rows = get_transactions(
            conn,
            month=month,
            category=category,
            account=account,
            search=search,
            include_excluded=include_excluded,
        )
        return [
            ExpenseTransaction(
                id=r["id"],
                date=r["date"],
                amount=r["amount"],
                description=r["description"],
                merchant=r["merchant"] or "",
                category=r["category"],
                category_source=r["category_source"],
                account_source=r["account_source"],
                account_label=r["account_label"] or "",
                is_excluded=bool(r["is_excluded"]),
                exclusion_reason=r["exclusion_reason"],
                fingerprint=r["fingerprint"],
            )
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/summary", response_model=ExpenseSummary)
def expense_summary() -> ExpenseSummary:
    """Return aggregated expense summary with category and monthly breakdowns."""
    conn = get_connection()
    try:
        data = get_summary(conn)
    finally:
        conn.close()

    grand_total = data["grand_total"]

    category_totals = [
        CategoryTotal(
            category=r["category"],
            name=get_category_name(r["category"]),
            total=round(r["total"], 2),
            percentage=round(r["total"] / grand_total * 100, 1) if grand_total else 0,
            transaction_count=r["cnt"],
        )
        for r in data["category_rows"]
    ]

    # Build monthly totals
    monthly_map: dict[str, dict[str, float]] = {}
    for r in data["monthly_rows"]:
        m = r["month"]
        if m not in monthly_map:
            monthly_map[m] = {}
        monthly_map[m][r["category"]] = round(r["total"], 2)

    monthly_totals = [
        MonthlyExpenseTotal(
            month=_month_label(m + "-01"),
            total=round(sum(cats.values()), 2),
            category_breakdown=cats,
        )
        for m, cats in sorted(monthly_map.items())
    ]

    num_months = len(monthly_totals) or 1

    return ExpenseSummary(
        total_expenses=round(grand_total, 2),
        avg_monthly=round(grand_total / num_months, 2),
        category_totals=category_totals,
        monthly_totals=monthly_totals,
        excluded_count=data["excluded_count"],
    )


@router.get("/pivot", response_model=PivotTable)
def expense_pivot() -> PivotTable:
    """Return a month × category pivot table for the summary view."""
    conn = get_connection()
    try:
        rows = get_pivot(conn)
    finally:
        conn.close()

    # Build month → {category → (total, count)}
    month_data: dict[str, dict[str, tuple[float, int]]] = {}
    all_cats: set[str] = set()

    for r in rows:
        m = r["month"]
        cat = r["category"]
        all_cats.add(cat)
        if m not in month_data:
            month_data[m] = {}
        month_data[m][cat] = (round(r["total"], 2), r["cnt"])

    # Sort categories by total spend descending
    cat_totals: dict[str, float] = {}
    for m_cats in month_data.values():
        for cat, (total, _) in m_cats.items():
            cat_totals[cat] = cat_totals.get(cat, 0) + total
    sorted_cats = sorted(all_cats, key=lambda c: cat_totals.get(c, 0), reverse=True)

    cat_names = {c: get_category_name(c) for c in sorted_cats}
    grand_total = sum(cat_totals.values())

    pivot_rows = []
    for m in sorted(month_data.keys()):
        cells = []
        row_total = 0.0
        for cat in sorted_cats:
            total, cnt = month_data[m].get(cat, (0.0, 0))
            cells.append(PivotCell(category=cat, name=cat_names[cat], total=total, count=cnt))
            row_total += total
        pivot_rows.append(PivotRow(
            month=m,
            month_label=_month_label(m + "-01"),
            categories=cells,
            row_total=round(row_total, 2),
        ))

    return PivotTable(
        rows=pivot_rows,
        all_categories=sorted_cats,
        all_category_names=cat_names,
        grand_total=round(grand_total, 2),
    )


@router.post("/categorize", response_model=List[ExpenseTransaction])
def bulk_categorize(update: CategoryUpdate) -> List[ExpenseTransaction]:
    """Bulk re-categorize transactions."""
    conn = get_connection()
    try:
        update_categories(conn, update.transaction_ids, update.new_category)
        # Return the updated transactions
        rows = conn.execute(
            f"SELECT * FROM transactions WHERE id IN ({','.join('?' for _ in update.transaction_ids)})",
            update.transaction_ids,
        ).fetchall()
        return [
            ExpenseTransaction(
                id=r["id"],
                date=r["date"],
                amount=r["amount"],
                description=r["description"],
                merchant=r["merchant"] or "",
                category=r["category"],
                category_source=r["category_source"],
                account_source=r["account_source"],
                account_label=r["account_label"] or "",
                is_excluded=bool(r["is_excluded"]),
                exclusion_reason=r["exclusion_reason"],
                fingerprint=r["fingerprint"],
            )
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/categories", response_model=List[CategoryDefinition])
def list_categories() -> List[CategoryDefinition]:
    """List all expense categories (standard + custom)."""
    _seed_categories()
    conn = get_connection()
    try:
        rows = get_all_categories(conn)
        return [
            CategoryDefinition(
                slug=r["slug"],
                name=r["name"],
                type=r["type"],
                is_custom=bool(r["is_custom"]),
                keywords=json.loads(r["keywords"]) if r["keywords"] else [],
            )
            for r in rows
        ]
    finally:
        conn.close()


@router.post("/categories", response_model=CategoryDefinition)
def create_category(definition: CategoryDefinition) -> CategoryDefinition:
    """Create or update a custom category."""
    conn = get_connection()
    try:
        upsert_category(
            conn,
            slug=definition.slug,
            name=definition.name,
            type_=definition.type,
            is_custom=True,
            keywords=definition.keywords,
        )
    finally:
        conn.close()
    return definition


@router.get("/export")
def export_csv(
    month: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
) -> StreamingResponse:
    """Export expense transactions as CSV."""
    conn = get_connection()
    try:
        rows = get_transactions(conn, month=month, category=category)
    finally:
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Amount", "Description", "Merchant", "Category", "Account"])
    for r in rows:
        writer.writerow([r["date"], r["amount"], r["description"], r["merchant"], r["category"], r["account_source"]])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"},
    )


def _seed_categories() -> None:
    """Seed the standard categories into the database if not already present."""
    conn = get_connection()
    try:
        for slug, cat in EXPENSE_CATEGORIES.items():
            upsert_category(
                conn,
                slug=slug,
                name=cat["name"],
                type_=cat["type"],
                is_custom=False,
                keywords=cat["keywords"],
            )
    finally:
        conn.close()


def _safe(filename: str) -> str:
    return "".join(ch for ch in filename if ch.isalnum() or ch in "-_.")
