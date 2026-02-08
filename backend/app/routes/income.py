from __future__ import annotations

import json
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, File, UploadFile

from app.models import (
    ConfirmationItem,
    ConfirmRequest,
    ConfirmResponse,
    ConfirmedIncome,
    DetectedIncome,
    FileResult,
    RescanRequest,
    UploadResponse,
)
from app.services.income_identifier import identify_income, identify_income_by_keywords
from app.services.pdf_parser import RawTransaction, extract_transactions

router = APIRouter()

STORAGE_DIR = Path(__file__).resolve().parents[1] / "storage" / "uploads"
CONFIRMED_PATH = Path(__file__).resolve().parents[1] / "storage" / "confirmed_income.json"

# In-memory cache of most recent detected income (keyed by id)
_detected_cache: dict[str, DetectedIncome] = {}
# In-memory cache of raw transactions for rescan
_transactions_cache: list[RawTransaction] = []


@router.post("/upload", response_model=UploadResponse)
async def upload_statements(files: List[UploadFile] = File(...)) -> UploadResponse:
    """Upload PDF statements, parse them, and identify income transactions."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    file_results: List[FileResult] = []
    all_transactions = []

    for upload in files:
        fname = upload.filename or "unknown"
        if not fname.lower().endswith(".pdf"):
            file_results.append(FileResult(filename=fname, status="skipped", error="Not a PDF"))
            continue

        stored_name = f"{uuid4().hex[:8]}_{_safe(fname)}"
        stored_path = STORAGE_DIR / stored_name
        try:
            content = await upload.read()
            stored_path.write_bytes(content)
            txns = extract_transactions(stored_path)
            all_transactions.extend(txns)
            file_results.append(
                FileResult(filename=fname, stored_as=stored_name, size_bytes=len(content), status="stored")
            )
        except Exception as exc:
            file_results.append(FileResult(filename=fname, status="error", error=str(exc)))

    detected = identify_income(all_transactions)

    # Cache raw transactions for potential rescan
    _transactions_cache.clear()
    _transactions_cache.extend(all_transactions)

    # Cache detected income for the confirmation step
    _detected_cache.clear()
    for d in detected:
        _detected_cache[d.id] = d

    return UploadResponse(
        total_files=len(file_results),
        stored_files=sum(1 for f in file_results if f.status == "stored"),
        file_results=file_results,
        detected_income=detected,
    )


@router.get("/detected", response_model=List[DetectedIncome])
def get_detected_income() -> List[DetectedIncome]:
    """Return the most recently detected income sources."""
    return list(_detected_cache.values())


@router.post("/rescan", response_model=list[DetectedIncome])
def rescan_income(request: RescanRequest) -> list[DetectedIncome]:
    """Rescan cached transactions with user-provided keywords to find missed income."""
    if not _transactions_cache:
        return list(_detected_cache.values())

    # Collect descriptions already covered by existing detections
    existing_descriptions: set[str] = set()
    for det in _detected_cache.values():
        existing_descriptions.update(det.sample_descriptions)

    new_items = identify_income_by_keywords(
        _transactions_cache, request.keywords, existing_descriptions
    )

    # Merge new detections into the cache
    for item in new_items:
        _detected_cache[item.id] = item

    return list(_detected_cache.values())


@router.post("/confirm", response_model=ConfirmResponse)
def confirm_income(request: ConfirmRequest) -> ConfirmResponse:
    """Persist user confirmations for detected income."""
    confirmed_list: List[ConfirmedIncome] = []
    dismissed = 0

    for item in request.confirmations:
        detected = _detected_cache.get(item.id)
        if not detected:
            continue

        if item.status == "dismissed":
            dismissed += 1
            continue

        final_category = item.reclassified_category or detected.category
        confirmed_list.append(
            ConfirmedIncome(
                id=detected.id,
                source_name=detected.source_name,
                category=final_category,
                original_category=detected.category,
                status=item.status,
                amount_per_occurrence=item.amount_per_occurrence if item.amount_per_occurrence is not None else detected.amount_per_occurrence,
                total_amount=detected.total_amount,
                frequency=detected.frequency,
                is_fixed_income=detected.is_recurring and detected.frequency in ("monthly", "biweekly"),
                rule_matched=detected.rule_matched,
            )
        )

    # Persist to disk
    _save_confirmed(confirmed_list)

    return ConfirmResponse(confirmed=confirmed_list, dismissed_count=dismissed)


@router.get("/confirmed", response_model=List[ConfirmedIncome])
def get_confirmed_income() -> List[ConfirmedIncome]:
    """Return all persisted confirmed income sources."""
    return _load_confirmed()


def _save_confirmed(items: List[ConfirmedIncome]) -> None:
    CONFIRMED_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = _load_confirmed()
    existing_ids = {c.id for c in existing}
    for item in items:
        if item.id not in existing_ids:
            existing.append(item)
            existing_ids.add(item.id)
    CONFIRMED_PATH.write_text(
        json.dumps([c.model_dump() for c in existing], indent=2),
        encoding="utf-8",
    )


def _load_confirmed() -> List[ConfirmedIncome]:
    if not CONFIRMED_PATH.exists():
        return []
    try:
        data = json.loads(CONFIRMED_PATH.read_text(encoding="utf-8"))
        return [ConfirmedIncome(**item) for item in data]
    except Exception:
        return []


def _safe(filename: str) -> str:
    return "".join(ch for ch in filename if ch.isalnum() or ch in "-_.")
