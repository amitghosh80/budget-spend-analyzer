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
    AccountBreakdown,
    AccountBreakdownResponse,
    AccountMonthlyTotal,
    CashflowMonth,
    CashflowSummary,
    CategoryDefinition,
    CategoryTotal,
    CategoryUpdate,
    ExpenseSummary,
    ExpenseTransaction,
    ExpenseUploadResponse,
    FileResult,
    MerchantTotal,
    MerchantsResponse,
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
from app.services.pdf_parser import detect_statement_type, extract_transactions

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


def _year_from_filename(filename: str) -> Optional[int]:
    """Extract a 4-digit year from common statement filename patterns.

    Matches: '20251010-statements-...' or '2025-11-09.pdf' etc.
    """
    import re
    m = re.search(r"(20\d{2})", filename)
    return int(m.group(1)) if m else None


def _normalize_date(date_str: str, statement_year: Optional[int] = None) -> str:
    """Normalize MM/DD or MM/DD/YY(YY) to YYYY-MM-DD.

    If no year is present, uses *statement_year* (extracted from the PDF
    filename) when available, otherwise falls back to the current year.
    When statement_year is provided and the resulting date would be in the
    future, the previous year is used instead (handles Dec statement with
    a Jan filename date, etc.).
    """
    parts = date_str.strip().split("/")
    if len(parts) == 2:
        month, day = parts
        base_year = statement_year or datetime.now().year
        year = str(base_year)
    elif len(parts) == 3:
        month, day, year = parts
        if len(year) == 2:
            year = "20" + year
    else:
        return date_str

    # Guard against future dates when year was inferred
    if len(parts) == 2:
        try:
            candidate = datetime(int(year), int(month), int(day))
            if candidate > datetime.now():
                year = str(int(year) - 1)
        except ValueError:
            pass

    return f"{int(year)}-{int(month):02d}-{int(day):02d}"


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



@router.post("/upload", response_model=ExpenseUploadResponse)
async def upload_expenses(
    files: List[UploadFile] = File(default=[]),
    include_existing: bool = Query(
        False,
        description="Also process statements already uploaded during the income step.",
    ),
) -> ExpenseUploadResponse:
    """Upload bank and/or credit card PDFs and categorize expenses.

    Pass include_existing=true to also process statements that are already
    stored from the income step (checking account PDFs, etc.) alongside any
    newly uploaded files. Duplicate transactions are silently skipped.
    """
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    file_results: List[FileResult] = []
    all_txn_data = []

    # ── Step 1: Existing stored files (income-step uploads) ─────────────────
    if include_existing:
        for stored_path in sorted(STORAGE_DIR.glob("*.pdf")):
            try:
                content = decrypt(stored_path.read_bytes())
                stmt_type = detect_statement_type(BytesIO(content))
                account_source = stmt_type if stmt_type in ("checking", "savings") else "credit_card"
                txns = extract_transactions(BytesIO(content))
                stmt_year = _year_from_filename(stored_path.name)
                for txn in txns:
                    all_txn_data.append((txn, stored_path.name, account_source, stmt_year))
                file_results.append(
                    FileResult(
                        filename=stored_path.name,
                        stored_as=stored_path.name,
                        size_bytes=stored_path.stat().st_size,
                        status="stored" if txns else "warning",
                        error=None if txns else "No transactions found.",
                        transaction_count=len(txns),
                    )
                )
            except Exception as exc:
                file_results.append(
                    FileResult(filename=stored_path.name, status="error", error=str(exc))
                )

    # ── Step 2: Newly uploaded files ────────────────────────────────────────
    for upload in files[:MAX_FILES]:
        fname = upload.filename or "unknown"
        if not fname.lower().endswith(".pdf"):
            file_results.append(FileResult(filename=fname, status="skipped", error="Not a PDF"))
            continue

        stored_name = f"stmt_{uuid4().hex[:8]}_{_safe(fname)}"
        stored_path = STORAGE_DIR / stored_name
        try:
            content = await upload.read()
            stmt_type = detect_statement_type(BytesIO(content))
            account_source = stmt_type if stmt_type in ("checking", "savings") else "credit_card"
            txns = extract_transactions(BytesIO(content))
            stored_path.write_bytes(encrypt(content))

            stmt_year = _year_from_filename(fname)
            for txn in txns:
                all_txn_data.append((txn, fname, account_source, stmt_year))

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

    # Load confirmed income info for exclusion
    income_names = _load_confirmed_income_descriptions()

    conn = get_connection()
    total_inserted = 0
    duplicate_count = 0
    categorized_count = 0
    excluded_count = 0

    try:
        for txn, source_file, account_source, stmt_year in all_txn_data:
            date = _normalize_date(txn.date, statement_year=stmt_year)
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


@router.get("/merchants", response_model=MerchantsResponse)
def top_merchants(limit: int = Query(default=15, ge=1, le=50)) -> MerchantsResponse:
    """Return top merchants by total spend, excluding income and excluded transactions."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT
                merchant,
                SUM(amount)          AS total,
                COUNT(*)             AS txn_count,
                AVG(amount)          AS avg_amt,
                MAX(category)        AS top_category
            FROM transactions
            WHERE is_excluded = 0
              AND is_income = 0
              AND merchant != ''
            GROUP BY merchant
            ORDER BY total DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()

    merchants = [
        MerchantTotal(
            merchant=r["merchant"],
            total=round(r["total"], 2),
            transaction_count=r["txn_count"],
            avg_per_transaction=round(r["avg_amt"], 2),
            top_category=r["top_category"] or "other",
        )
        for r in rows
    ]
    return MerchantsResponse(merchants=merchants)


@router.get("/cashflow", response_model=CashflowSummary)
def cashflow_summary() -> CashflowSummary:
    """Return monthly income vs expense cashflow, using actual transactions in the DB."""
    conn = get_connection()
    try:
        income_rows = conn.execute(
            """
            SELECT substr(date, 1, 7) AS month, SUM(amount) AS total
            FROM transactions
            WHERE is_income = 1
            GROUP BY month
            ORDER BY month
            """
        ).fetchall()

        expense_rows = conn.execute(
            """
            SELECT substr(date, 1, 7) AS month, SUM(amount) AS total
            FROM transactions
            WHERE is_excluded = 0 AND is_income = 0
            GROUP BY month
            ORDER BY month
            """
        ).fetchall()
    finally:
        conn.close()

    income_by_month: dict[str, float] = {r["month"]: round(r["total"], 2) for r in income_rows}
    expense_by_month: dict[str, float] = {r["month"]: round(r["total"], 2) for r in expense_rows}

    # Only report months that have meaningful expense data (> $1,000)
    # to exclude partial months at statement edges
    all_months = sorted(
        m for m, amt in expense_by_month.items() if amt > 1000
    )

    months: list[CashflowMonth] = []
    for m in all_months:
        inc = income_by_month.get(m, 0.0)
        exp = expense_by_month.get(m, 0.0)
        months.append(CashflowMonth(
            month=m,
            month_label=_month_label(m + "-01"),
            income=inc,
            expenses=exp,
            net=round(inc - exp, 2),
        ))

    n = len(months) or 1
    total_income = sum(m.income for m in months)
    total_expenses = sum(m.expenses for m in months)
    total_net = round(total_income - total_expenses, 2)

    return CashflowSummary(
        months=months,
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        total_net=total_net,
        avg_monthly_income=round(total_income / n, 2),
        avg_monthly_expenses=round(total_expenses / n, 2),
        avg_monthly_net=round(total_net / n, 2),
    )


@router.get("/account-breakdown", response_model=AccountBreakdownResponse)
def account_breakdown() -> AccountBreakdownResponse:
    """Return monthly expense totals broken down by account source."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT account_source, substr(date, 1, 7) AS month, SUM(amount) AS total
            FROM transactions
            WHERE is_excluded = 0 AND is_income = 0
            GROUP BY account_source, month
            ORDER BY account_source, month
            """
        ).fetchall()
    finally:
        conn.close()

    account_data: dict[str, dict[str, float]] = {}
    for r in rows:
        src = r["account_source"]
        month = r["month"]
        if src not in account_data:
            account_data[src] = {}
        account_data[src][month] = round(r["total"], 2)

    all_months = sorted({m for months in account_data.values() for m in months})
    n_months = max(len(all_months), 1)
    month_labels = {m: _month_label(m + "-01") for m in all_months}

    accounts = []
    for src, month_totals in account_data.items():
        monthly = [
            AccountMonthlyTotal(
                month=m,
                month_label=month_labels[m],
                total=month_totals.get(m, 0.0),
            )
            for m in all_months
        ]
        total = sum(month_totals.values())
        accounts.append(AccountBreakdown(
            account_source=src,
            total=round(total, 2),
            avg_monthly=round(total / n_months, 2),
            monthly_totals=monthly,
        ))
    accounts.sort(key=lambda a: a.total, reverse=True)

    return AccountBreakdownResponse(
        accounts=accounts,
        months=all_months,
        month_labels=month_labels,
    )


@router.post("/recategorize")
def recategorize_all() -> dict:
    """Re-apply keyword rules from DB categories to all auto-categorized transactions."""
    conn = get_connection()
    try:
        cat_rows = get_all_categories(conn)
        # Build keyword → slug mapping (uppercase, first match wins)
        kw_map: list[tuple[str, str]] = []
        for cat in cat_rows:
            if cat["slug"] == "uncategorized":
                continue
            keywords = json.loads(cat["keywords"]) if cat["keywords"] else []
            for kw in keywords:
                kw_map.append((kw.upper(), cat["slug"]))

        txns = conn.execute(
            "SELECT id, description FROM transactions "
            "WHERE category_source = 'auto' AND is_income = 0 AND is_excluded = 0"
        ).fetchall()

        count = 0
        for txn in txns:
            desc_upper = txn["description"].upper()
            new_cat = "uncategorized"
            for kw_upper, slug in kw_map:
                if kw_upper in desc_upper:
                    new_cat = slug
                    break
            conn.execute(
                "UPDATE transactions SET category = ? WHERE id = ?",
                (new_cat, txn["id"]),
            )
            count += 1
        conn.commit()
    finally:
        conn.close()
    return {"recategorized": count}


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
