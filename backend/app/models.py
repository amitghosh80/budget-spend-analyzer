from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr


# ── Auth Models ──────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: "UserInfo"


class UserInfo(BaseModel):
    id: str
    email: str


# ── Shared Models ────────────────────────────────────────────────


class FileResult(BaseModel):
    filename: str
    stored_as: Optional[str] = None
    size_bytes: Optional[int] = None
    status: str  # stored, skipped, warning, error
    error: Optional[str] = None
    transaction_count: Optional[int] = None


# ── Phase 1: Income Models ──────────────────────────────────────


class MonthlyTotal(BaseModel):
    month: str  # e.g. "Jan 2025", "Dec 2024"
    total: float
    transaction_count: int


class IncomeTransaction(BaseModel):
    date: str
    description: str
    amount: float
    source_file: str = ""


class DetectedIncome(BaseModel):
    id: str
    source_name: str
    category: str  # salary, rental, pension, freelance, transfer, other
    rule_matched: str
    amount_per_occurrence: float
    total_amount: float
    occurrence_count: int
    frequency: str  # monthly, biweekly, quarterly, one-time
    confidence: str  # high, medium, low
    sample_descriptions: List[str]
    is_recurring: bool
    monthly_totals: List[MonthlyTotal] = []
    transactions: List[IncomeTransaction] = []


class ExcludedTransfer(BaseModel):
    date: str
    description: str
    amount: float
    reason: str  # e.g. "TRANSFER", "XFER"
    source_file: str = ""


class UploadResponse(BaseModel):
    total_files: int
    stored_files: int
    file_results: List[FileResult]
    detected_income: List[DetectedIncome]
    excluded_transfers: List[ExcludedTransfer] = []


class ConfirmationItem(BaseModel):
    id: str
    status: str  # confirmed, dismissed, reclassified
    reclassified_category: Optional[str] = None
    amount_per_occurrence: Optional[float] = None
    monthly_overrides: Optional[Dict[int, float]] = None


class ConfirmRequest(BaseModel):
    confirmations: List[ConfirmationItem]


class ConfirmedIncome(BaseModel):
    id: str
    source_name: str
    category: str
    original_category: str
    status: str
    amount_per_occurrence: float
    total_amount: float
    frequency: str
    is_fixed_income: bool
    rule_matched: str


class RescanRequest(BaseModel):
    keywords: List[str]


class ConfirmResponse(BaseModel):
    confirmed: List[ConfirmedIncome]
    dismissed_count: int


# ── Phase 2: Expense Models ─────────────────────────────────────


class ExpenseTransaction(BaseModel):
    id: str
    date: str  # YYYY-MM-DD
    amount: float
    description: str
    merchant: str
    category: str
    category_source: str  # "auto" | "user"
    account_source: str  # "checking" | "savings" | "credit_card"
    account_label: str
    is_excluded: bool = False
    exclusion_reason: Optional[str] = None
    fingerprint: str


class CategoryTotal(BaseModel):
    category: str
    name: str
    total: float
    percentage: float
    transaction_count: int


class MonthlyExpenseTotal(BaseModel):
    month: str  # "Jan 2025"
    total: float
    category_breakdown: Dict[str, float]


class ExpenseSummary(BaseModel):
    total_expenses: float
    avg_monthly: float
    category_totals: List[CategoryTotal]
    monthly_totals: List[MonthlyExpenseTotal]
    excluded_count: int


class ExpenseUploadResponse(BaseModel):
    total_files: int
    stored_files: int
    file_results: List[FileResult]
    transaction_count: int
    new_transactions: int
    duplicate_count: int
    categorized_count: int
    excluded_count: int


class PivotCell(BaseModel):
    category: str
    name: str
    total: float
    count: int


class PivotRow(BaseModel):
    month: str  # "YYYY-MM"
    month_label: str  # "Jan 2025"
    categories: List[PivotCell]
    row_total: float


class PivotTable(BaseModel):
    rows: List[PivotRow]
    all_categories: List[str]  # ordered list of category slugs
    all_category_names: Dict[str, str]
    grand_total: float


class CategoryUpdate(BaseModel):
    transaction_ids: List[str]
    new_category: str


class CashflowMonth(BaseModel):
    month: str        # "YYYY-MM"
    month_label: str  # "Jan 2025"
    income: float
    expenses: float
    net: float


class CashflowSummary(BaseModel):
    months: List[CashflowMonth]
    total_income: float
    total_expenses: float
    total_net: float
    avg_monthly_income: float
    avg_monthly_expenses: float
    avg_monthly_net: float


class MerchantTotal(BaseModel):
    merchant: str
    total: float
    transaction_count: int
    avg_per_transaction: float
    top_category: str


class MerchantsResponse(BaseModel):
    merchants: List[MerchantTotal]


class CategoryDefinition(BaseModel):
    slug: str
    name: str
    type: str = "variable"
    is_custom: bool = False
    keywords: List[str] = []


# ── Phase 3: Insights Models ─────────────────────────────────────


class AccountMonthlyTotal(BaseModel):
    month: str        # "YYYY-MM"
    month_label: str  # "Jan 2025"
    total: float


class AccountBreakdown(BaseModel):
    account_source: str  # "checking" | "credit_card" | "savings"
    total: float
    avg_monthly: float
    monthly_totals: List[AccountMonthlyTotal]


class AccountBreakdownResponse(BaseModel):
    accounts: List[AccountBreakdown]
    months: List[str]           # ordered YYYY-MM list
    month_labels: Dict[str, str]
