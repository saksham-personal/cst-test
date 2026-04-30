from __future__ import annotations

from pathlib import Path
from typing import Any

from app.storage.json_store import load_json, save_json_atomic


class IndexJobRepository:
    def __init__(self, jobs_dir: str) -> None:
        self.jobs_dir = Path(jobs_dir)

    def ensure_dir(self) -> None:
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def job_dir(self, job_id: str) -> Path:
        return self.jobs_dir / job_id

    def job_state_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "job.json"

    def request_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "request.json"

    def source_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "source.xlsx"

    def log_stdout_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "stdout.log"

    def log_stderr_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "stderr.log"

    def prepare_job_dir(self, job_id: str) -> Path:
        job_dir = self.job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir

    def save_request(self, job_id: str, payload: dict[str, Any]) -> None:
        save_json_atomic(self.request_path(job_id), payload)

    def load_request(self, job_id: str) -> dict[str, Any] | None:
        data = load_json(self.request_path(job_id), default=None)
        return data if isinstance(data, dict) else None

    def save_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        job_id = str(payload.get("job_id", "")).strip()
        if not job_id:
            raise ValueError("job_id is required")
        self.prepare_job_dir(job_id)
        save_json_atomic(self.job_state_path(job_id), payload)
        return payload

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        data = load_json(self.job_state_path(job_id), default=None)
        return data if isinstance(data, dict) else None

    def list_jobs(self) -> list[dict[str, Any]]:
        self.ensure_dir()
        jobs: list[dict[str, Any]] = []
        for path in sorted(self.jobs_dir.glob("*/job.json"), reverse=True):
            data = load_json(path, default=None)
            if isinstance(data, dict):
                jobs.append(data)
        jobs.sort(key=lambda item: str(item.get("updated_at", "")), reverse=True)
        return jobs
