"""Email notifications via Gmail SMTP."""

from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText
from datetime import datetime


_GMAIL_FROM = "amitghosh80@gmail.com"
_GMAIL_TO = "amitghosh80@gmail.com"
_SMTP_HOST = "smtp.gmail.com"
_SMTP_PORT = 587


def _app_password() -> str | None:
    return os.environ.get("GMAIL_APP_PASSWORD")


def send_signup_notification(new_user_email: str) -> None:
    """Send a sign-up notification email. Silently no-ops if GMAIL_APP_PASSWORD is not set."""
    password = _app_password()
    if not password:
        return

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    body = f"New sign-up on Budget Analyzer\n\nEmail: {new_user_email}\nTime:  {now}\n"

    msg = MIMEText(body)
    msg["Subject"] = f"[Budget Analyzer] New sign-up: {new_user_email}"
    msg["From"] = _GMAIL_FROM
    msg["To"] = _GMAIL_TO

    try:
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(_GMAIL_FROM, password)
            smtp.sendmail(_GMAIL_FROM, [_GMAIL_TO], msg.as_string())
    except Exception as exc:
        # Never crash the sign-up flow because of a notification failure
        print(f"[notifications] Failed to send sign-up email: {exc}")
