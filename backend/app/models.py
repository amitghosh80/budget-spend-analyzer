from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class FileResult(BaseModel):
    filename: str
    stored_as: Optional[str] = None
    size_bytes: Optional[int] = None
    status: str  # stored, skipped, warning, error
    error: Optional[str] = None
    transaction_count: Optional[int] = None


class MonthlyTotal(BaseModel):
    month: str  # e.g. "Jan 2025", "Dec 2024"
    total: float
    transaction_count: int


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


class UploadResponse(BaseModel):
    total_files: int
    stored_files: int
    file_results: List[FileResult]
    detected_income: List[DetectedIncome]


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
