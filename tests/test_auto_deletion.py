"""Tests for 48-hour auto-deletion of uploaded files."""

import json
import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import _purge_expired_uploads, UPLOAD_LOG_PATH


@pytest.fixture
def temp_uploads(tmp_path, monkeypatch):
    """Create a temporary uploads directory and patch STORAGE_DIR."""
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    import app.main as main_mod
    monkeypatch.setattr(main_mod, "STORAGE_DIR", uploads)
    monkeypatch.setattr(main_mod, "UPLOAD_LOG_PATH", tmp_path / "upload_log.json")
    return uploads, tmp_path / "upload_log.json"


class TestPurgeExpiredUploads:
    def test_deletes_old_files(self, temp_uploads):
        uploads, log_path = temp_uploads
        old_file = uploads / "old_statement.pdf"
        old_file.write_bytes(b"old content")
        # Set mtime to 3 days ago
        old_time = time.time() - (72 * 3600)
        os.utime(old_file, (old_time, old_time))

        _purge_expired_uploads()

        assert not old_file.exists()

    def test_keeps_recent_files(self, temp_uploads):
        uploads, log_path = temp_uploads
        recent_file = uploads / "recent_statement.pdf"
        recent_file.write_bytes(b"recent content")
        # mtime is now (just created) — well within 48 hours

        _purge_expired_uploads()

        assert recent_file.exists()

    def test_mixed_old_and_recent(self, temp_uploads):
        uploads, log_path = temp_uploads
        old_file = uploads / "old.pdf"
        old_file.write_bytes(b"old")
        old_time = time.time() - (72 * 3600)
        os.utime(old_file, (old_time, old_time))

        recent_file = uploads / "recent.pdf"
        recent_file.write_bytes(b"recent")

        _purge_expired_uploads()

        assert not old_file.exists()
        assert recent_file.exists()

    def test_logs_deletions(self, temp_uploads):
        uploads, log_path = temp_uploads
        old_file = uploads / "logged_delete.pdf"
        old_file.write_bytes(b"to be deleted")
        old_time = time.time() - (72 * 3600)
        os.utime(old_file, (old_time, old_time))

        _purge_expired_uploads()

        assert log_path.exists()
        log = json.loads(log_path.read_text(encoding="utf-8"))
        assert len(log) == 1
        assert log[0]["event"] == "auto_delete"
        assert log[0]["stored_as"] == "logged_delete.pdf"
        assert log[0]["reason"] == "exceeded_48h_retention"
        assert log[0]["age_hours"] >= 72

    def test_empty_directory(self, temp_uploads):
        uploads, log_path = temp_uploads
        # No files — should not crash
        _purge_expired_uploads()
        assert not log_path.exists()

    def test_missing_directory(self, tmp_path, monkeypatch):
        import app.main as main_mod
        monkeypatch.setattr(main_mod, "STORAGE_DIR", tmp_path / "nonexistent")
        # Should not crash
        _purge_expired_uploads()
