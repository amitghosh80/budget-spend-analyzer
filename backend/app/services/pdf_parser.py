"""Parse PDF bank/credit card statements and extract individual transaction lines."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import pdfplumber


@dataclass
class RawTransaction:
    date: str
    description: str
    amount: float
    line_text: str


def extract_transactions(pdf_path: Path) -> List[RawTransaction]:
    """Extract credit/deposit transactions from a PDF statement."""
    transactions: List[RawTransaction] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text += page_text + "\n"

            for line in full_text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                txn = _parse_transaction_line(line)
                if txn:
                    transactions.append(txn)
    except Exception:
        pass
    return transactions


def _parse_transaction_line(line: str) -> Optional[RawTransaction]:
    """Try to parse a single line as a deposit/credit transaction."""
    # Look for lines with a date and a dollar amount
    # Common formats: MM/DD  description  amount
    date_match = re.match(r"(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+(.+)", line)
    if not date_match:
        return None

    date_str = date_match.group(1)
    rest = date_match.group(2)

    # Extract amounts from the rest of the line
    amounts = re.findall(r"[\d,]+\.\d{2}", rest)
    if not amounts:
        return None

    # Take the first amount as the transaction amount
    # (the last amount on the line is typically the running balance)
    amount_str = amounts[0]
    amount = _parse_amount(amount_str)
    if amount <= 0:
        return None

    # The description is everything before the first amount
    desc_end = rest.find(amount_str)
    description = rest[:desc_end].strip().rstrip("$").strip()
    if not description:
        return None

    return RawTransaction(
        date=date_str,
        description=description,
        amount=amount,
        line_text=line[:120],
    )


def _parse_amount(amount_str: str) -> float:
    try:
        return float(amount_str.replace(",", ""))
    except ValueError:
        return 0.0
