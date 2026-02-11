import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.income import router as income_router

logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).resolve().parent / "storage" / "uploads"
UPLOAD_LOG_PATH = Path(__file__).resolve().parent / "storage" / "upload_log.json"
MAX_AGE = timedelta(hours=48)


def _purge_expired_uploads() -> None:
    """Delete uploaded files older than 48 hours. Log each deletion."""
    if not STORAGE_DIR.exists():
        return

    now = datetime.now(timezone.utc)
    deleted = 0

    for file_path in STORAGE_DIR.iterdir():
        if not file_path.is_file():
            continue
        mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
        age = now - mtime
        if age > MAX_AGE:
            try:
                file_path.unlink()
                _log_auto_deletion(file_path.name, age)
                deleted += 1
            except OSError:
                logger.warning("Failed to auto-delete expired file: %s", file_path.name)

    if deleted:
        logger.info("Startup cleanup: deleted %d file(s) older than 48 hours", deleted)


def _log_auto_deletion(stored_name: str, age: timedelta) -> None:
    """Append an auto-deletion event to the upload log."""
    UPLOAD_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "event": "auto_delete",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stored_as": stored_name,
        "age_hours": round(age.total_seconds() / 3600, 1),
        "reason": "exceeded_48h_retention",
    }
    try:
        if UPLOAD_LOG_PATH.exists():
            log = json.loads(UPLOAD_LOG_PATH.read_text(encoding="utf-8"))
        else:
            log = []
        log.append(entry)
        UPLOAD_LOG_PATH.write_text(json.dumps(log, indent=2), encoding="utf-8")
    except Exception:
        logger.warning("Failed to write auto-deletion log entry: %s", entry)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _purge_expired_uploads()
    yield


app = FastAPI(
    title="Budget Spend Analyzer — Income Identification",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(income_router, prefix="/income", tags=["income"])
