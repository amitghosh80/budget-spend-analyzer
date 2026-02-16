"""Income identification service.

Applies rules from docs/rules/income.md to classify transactions as income.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from app.models import DetectedIncome, ExcludedTransfer, IncomeTransaction, MonthlyTotal
from app.services.pdf_parser import RawTransaction

# ---------------------------------------------------------------------------
# Rule 1: Salary keywords
# ---------------------------------------------------------------------------
SALARY_KEYWORDS: List[str] = [
    "DIRECT DEPOSIT",
    "DIRECT DEP",
    "PAYROLL",
    "ACH CREDIT",
    "SALARY",
    "WAGE",
    "EDIPAYMENT",
]

# ---------------------------------------------------------------------------
# Rule 2: Rental income keywords
# ---------------------------------------------------------------------------
RENTAL_KEYWORDS: List[str] = [
    "RENT",
    "TENANT",
    "LEASE",
    "PROPERTY MGMT",
    "PROPERTY MANAGEMENT",
]

# ---------------------------------------------------------------------------
# Rule 3: Other recurring income keywords
# ---------------------------------------------------------------------------
OTHER_INCOME_KEYWORDS: Dict[str, List[str]] = {
    "pension": ["PENSION", "SOC SEC", "SOCIAL SECURITY", "SSA"],
    "freelance": ["FREELANCE", "CONSULTING", "COMMISSION", "1099"],
    "interest": ["INTEREST PAYMENT", "INTEREST PAID", "INTEREST CREDIT"],
    "payments": ["ZELLE PAYMENT FROM", "VENMO CASHOUT", "VENMO CREDIT"],
    "other": ["ANNUITY", "DIVIDEND", "ROYALT"],
}

# ---------------------------------------------------------------------------
# Exclusion keywords – credits that are NOT income
# ---------------------------------------------------------------------------
TRANSFER_KEYWORDS: List[str] = [
    "TRANSFER",
    "XFER",
    "TFR",
]

NON_TRANSFER_EXCLUSIONS: List[str] = [
    "REFUND",
    "RETURN",
    "REVERSAL",
    "CREDIT ADJ",
    "CASHBACK",
    "CASH BACK",
    "REWARD",
    "REBATE",
]

EXCLUSION_KEYWORDS: List[str] = NON_TRANSFER_EXCLUSIONS + TRANSFER_KEYWORDS


IncomeResult = Tuple[List[DetectedIncome], List[ExcludedTransfer]]


def identify_income(transactions: List[RawTransaction]) -> IncomeResult:
    """Run all income rules against a list of transactions and return aggregated results plus excluded transfers."""

    # Step 1: classify each transaction, tracking transfer exclusions
    classified: List[Tuple[RawTransaction, str, str]] = []  # (txn, category, rule)
    excluded_transfers: List[ExcludedTransfer] = []
    for txn in transactions:
        result = _classify_transaction(txn)
        if result:
            classified.append((txn, result[0], result[1]))
        else:
            # Check if it was excluded specifically as a transfer
            reason = _transfer_exclusion_reason(txn)
            if reason:
                excluded_transfers.append(
                    ExcludedTransfer(
                        date=txn.date,
                        description=txn.description,
                        amount=txn.amount,
                        reason=reason,
                        source_file=txn.source_file,
                    )
                )

    # Step 2: aggregate by source (category + cleaned description key)
    groups: Dict[str, Dict] = defaultdict(lambda: {
        "category": "",
        "rule": "",
        "amounts": [],
        "descriptions": [],
        "dates": [],
        "transactions": [],
    })

    for txn, category, rule in classified:
        key = _source_key(txn.description, category)
        group = groups[key]
        group["category"] = category
        group["rule"] = rule
        group["amounts"].append(txn.amount)
        group["descriptions"].append(txn.line_text)
        group["dates"].append(txn.date)
        group["transactions"].append(
            IncomeTransaction(
                date=txn.date,
                description=txn.description,
                amount=txn.amount,
                source_file=txn.source_file,
            )
        )

    # Step 3: build DetectedIncome list
    results: List[DetectedIncome] = []
    for key, group in groups.items():
        amounts = group["amounts"]
        count = len(amounts)
        total = sum(amounts)
        # Use the most recent amount (last in list) as the per-occurrence value
        # since it best represents the current expected income
        most_recent = amounts[-1] if amounts else 0
        is_recurring = count >= 2
        frequency = _detect_frequency(group["dates"], count)
        confidence = _compute_confidence(count, frequency, group["category"])

        monthly = _aggregate_monthly(group["dates"], amounts)

        results.append(
            DetectedIncome(
                id=uuid4().hex[:12],
                source_name=_pretty_source_name(key),
                category=group["category"],
                rule_matched=group["rule"],
                amount_per_occurrence=round(most_recent, 2),
                total_amount=round(total, 2),
                occurrence_count=count,
                frequency=frequency,
                confidence=confidence,
                sample_descriptions=group["descriptions"],
                is_recurring=is_recurring,
                monthly_totals=monthly,
                transactions=group["transactions"],
            )
        )

    results.sort(key=lambda d: d.total_amount, reverse=True)
    return results, excluded_transfers


def identify_income_by_keywords(
    transactions: List[RawTransaction],
    keywords: List[str],
    exclude_descriptions: set[str],
) -> List[DetectedIncome]:
    """Find income matching user-provided keywords, skipping already-detected transactions."""

    classified: List[Tuple[RawTransaction, str, str]] = []
    for txn in transactions:
        desc_upper = txn.description.upper()

        # Skip debits and withdrawals — only match deposits/credits
        if any(dw in desc_upper for dw in ("DEBIT", "WITHDRAWAL")):
            continue

        # Skip transactions already covered by existing detections
        if txn.line_text in exclude_descriptions:
            continue

        # Check if any user keyword matches
        for kw in keywords:
            if kw.upper() in desc_upper:
                classified.append(
                    (txn, "other", f"User-specified keyword '{kw}'")
                )
                break

    # Aggregate using the same logic as identify_income
    groups: Dict[str, Dict] = defaultdict(lambda: {
        "category": "",
        "rule": "",
        "amounts": [],
        "descriptions": [],
        "dates": [],
        "transactions": [],
    })

    for txn, category, rule in classified:
        key = _source_key(txn.description, category)
        group = groups[key]
        group["category"] = category
        group["rule"] = rule
        group["amounts"].append(txn.amount)
        group["descriptions"].append(txn.line_text)
        group["dates"].append(txn.date)
        group["transactions"].append(
            IncomeTransaction(
                date=txn.date,
                description=txn.description,
                amount=txn.amount,
                source_file=txn.source_file,
            )
        )

    results: List[DetectedIncome] = []
    for key, group in groups.items():
        amounts = group["amounts"]
        count = len(amounts)
        total = sum(amounts)
        most_recent = amounts[-1] if amounts else 0
        is_recurring = count >= 2
        frequency = _detect_frequency(group["dates"], count)
        confidence = _compute_confidence(count, frequency, group["category"])

        monthly = _aggregate_monthly(group["dates"], amounts)

        results.append(
            DetectedIncome(
                id=uuid4().hex[:12],
                source_name=_pretty_source_name(key),
                category=group["category"],
                rule_matched=group["rule"],
                amount_per_occurrence=round(most_recent, 2),
                total_amount=round(total, 2),
                occurrence_count=count,
                frequency=frequency,
                confidence=confidence,
                sample_descriptions=group["descriptions"],
                is_recurring=is_recurring,
                monthly_totals=monthly,
                transactions=group["transactions"],
            )
        )

    results.sort(key=lambda d: d.total_amount, reverse=True)
    return results


def _transfer_exclusion_reason(txn: RawTransaction) -> Optional[str]:
    """Return the transfer keyword that caused exclusion, or None."""
    desc_upper = txn.description.upper()
    for kw in TRANSFER_KEYWORDS:
        if kw in desc_upper:
            return kw
    return None


def _classify_transaction(txn: RawTransaction) -> Optional[Tuple[str, str]]:
    """Return (category, rule_matched) or None if not income."""
    desc_upper = txn.description.upper()

    # Check exclusions first
    for kw in EXCLUSION_KEYWORDS:
        if kw in desc_upper:
            return None

    # Rule 1: Salary
    for kw in SALARY_KEYWORDS:
        if kw in desc_upper:
            return ("salary", f"Rule 1: Salary — keyword '{kw}'")

    # Rule 2: Rental
    for kw in RENTAL_KEYWORDS:
        if kw in desc_upper:
            return ("rental", f"Rule 2: Rental — keyword '{kw}'")

    # Rule 3: Other recurring income
    for sub_cat, keywords in OTHER_INCOME_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_upper:
                return (sub_cat, f"Rule 3: Other — keyword '{kw}'")

    # Fallback: large ACH deposits that didn't match anything above
    if "ACH" in desc_upper and "DEPOSIT" in desc_upper and txn.amount >= 500:
        return ("other", "Rule 3: Other — ACH Deposit ≥ $500")

    return None


def _source_key(description: str, category: str) -> str:
    """Create a grouping key from the description."""
    # Strip dates, amounts, and normalize
    cleaned = re.sub(r"\d{1,2}/\d{1,2}(/\d{2,4})?", "", description)
    cleaned = re.sub(r"[\d,]+\.\d{2}", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().upper()
    # Take the first few meaningful words
    words = [w for w in cleaned.split() if len(w) > 1][:4]
    return f"{category}:" + " ".join(words) if words else f"{category}:UNKNOWN"


def _pretty_source_name(key: str) -> str:
    """Convert a grouping key back to a display name."""
    _, _, name = key.partition(":")
    return name.strip().title() if name.strip() else "Unknown Source"


def _detect_frequency(dates: List[str], count: int) -> str:
    if count < 2:
        return "one-time"

    # Parse month/day from date strings (MM/DD or MM/DD/YYYY)
    month_days: List[tuple[int, int]] = []
    for d in dates:
        parts = d.split("/")
        if len(parts) >= 2:
            try:
                month_days.append((int(parts[0]), int(parts[1])))
            except ValueError:
                continue

    if len(month_days) < 2:
        return "monthly"

    month_days.sort()

    # Handle year boundary (e.g. Nov, Dec, Jan → months 11, 12, 1)
    months = [m for m, _ in month_days]
    if max(months) - min(months) > 6:
        month_days = [(m + 12 if m <= 6 else m, d) for m, d in month_days]
        month_days.sort()

    # Compute gaps in approximate days between consecutive occurrences
    gaps: List[int] = []
    for i in range(1, len(month_days)):
        prev_m, prev_d = month_days[i - 1]
        curr_m, curr_d = month_days[i]
        approx_days = (curr_m - prev_m) * 30 + (curr_d - prev_d)
        if approx_days > 0:
            gaps.append(approx_days)

    if not gaps:
        return "monthly"

    median_gap = sorted(gaps)[len(gaps) // 2]

    if median_gap <= 10:
        return "weekly"
    if median_gap <= 21:
        return "biweekly"
    if median_gap <= 50:
        return "monthly"
    return "quarterly"


MONTH_NAMES = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _aggregate_monthly(dates: List[str], amounts: List[float]) -> List[MonthlyTotal]:
    """Group transactions by month and sum their amounts."""
    buckets: Dict[str, float] = defaultdict(float)
    counts: Dict[str, int] = defaultdict(int)
    sort_keys: Dict[str, tuple] = {}

    for date_str, amount in zip(dates, amounts):
        parts = date_str.split("/")
        if len(parts) < 2:
            continue
        try:
            month_num = int(parts[0])
        except ValueError:
            continue

        # Extract year if present (MM/DD/YYYY or MM/DD/YY)
        if len(parts) >= 3:
            try:
                year = int(parts[2])
                if year < 100:
                    year += 2000
            except ValueError:
                year = 0
        else:
            year = 0

        if year > 0:
            label = f"{MONTH_NAMES[month_num]} {year}"
            sort_key = (year, month_num)
        else:
            label = MONTH_NAMES[month_num]
            sort_key = (0, month_num)

        buckets[label] += amount
        counts[label] += 1
        sort_keys[label] = sort_key

    # Sort chronologically
    sorted_labels = sorted(buckets.keys(), key=lambda k: sort_keys[k])
    return [
        MonthlyTotal(
            month=label,
            total=round(buckets[label], 2),
            transaction_count=counts[label],
        )
        for label in sorted_labels
    ]


def _compute_confidence(count: int, frequency: str, category: str) -> str:
    score = 0
    if count >= 3:
        score += 2
    elif count >= 2:
        score += 1

    if frequency in ("monthly", "biweekly"):
        score += 2

    if category == "salary":
        score += 1

    if score >= 4:
        return "high"
    if score >= 2:
        return "medium"
    return "low"
