from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.schemas.index_jobs import (
    IndexJobCollectionResponse,
    IndexJobCreateRequest,
    IndexJobDetail,
)
from app.storage.json_store import save_json_atomic
from app.services.search import SearchService
from app.storage.index_jobs_repo import IndexJobRepository


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


class IndexJobService:
    def __init__(self, settings: Settings, search_service: SearchService) -> None:
        self.settings = settings
        self.search_service = search_service
        self.repo = IndexJobRepository(settings.index_jobs_dir)
        self.jobs_dir = Path(settings.index_jobs_dir)
        self.bundles_dir = Path(settings.index_bundles_dir)
        self.uploads_dir = Path(settings.index_uploads_dir)
        self.backend_root = Path(__file__).resolve().parents[2]
        self.repo.ensure_dir()
        self.bundles_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self._processes: dict[str, subprocess.Popen[Any]] = {}

    def _slugify(self, value: str | None, fallback: str = "bundle") -> str:
        clean = re.sub(r"[^\w]+", "-", str(value or "").strip()).strip("-").lower()
        return clean or fallback

    def _build_output_dir(self, bundle_name: str, job_id: str) -> Path:
        return self.bundles_dir / f"{self._slugify(bundle_name)}_{job_id[:8]}"

    def _default_bundle_name(self, source_path: str | None) -> str:
        if not source_path:
            return "index_bundle"
        return Path(source_path).stem or "index_bundle"

    def _job_from_dict(self, data: dict[str, Any]) -> IndexJobDetail:
        return IndexJobDetail(**data)

    def _load_job_or_raise(self, job_id: str) -> dict[str, Any]:
        job = self.repo.get_job(job_id)
        if job is None:
            raise NotFoundError(f"Index job '{job_id}' not found.")
        return job

    def _read_log_excerpt(self, path: Path, *, max_chars: int = 4000) -> str | None:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore").strip()
        except OSError:
            return None
        if not text:
            return None
        return text[-max_chars:] if len(text) > max_chars else text

    def _reconcile_job_runtime(self, job: dict[str, Any]) -> dict[str, Any]:
        state = str(job.get("state", "")).lower()
        if state not in {"queued", "running", "activating"}:
            return job

        job_id = str(job.get("job_id", "")).strip()
        if not job_id:
            return job

        proc = self._processes.get(job_id)
        if proc is None:
            return job

        exit_code = proc.poll()
        if exit_code is None:
            return job

        self._processes.pop(job_id, None)
        latest_job = self.repo.get_job(job_id) or job
        latest_state = str(latest_job.get("state", "")).lower()
        if latest_state not in {"queued", "running", "activating"}:
            return latest_job

        stderr_excerpt = self._read_log_excerpt(self.repo.log_stderr_path(job_id))
        first_log_line = ""
        if stderr_excerpt:
            first_log_line = next((line.strip() for line in stderr_excerpt.splitlines() if line.strip()), "")
        message = "Index build worker exited unexpectedly."
        if first_log_line:
            message = f"Index build worker exited unexpectedly: {first_log_line}"

        now = _now_iso()
        latest_job.update(
            {
                "state": "failed",
                "stage": "failed",
                "message": message,
                "completed_at": latest_job.get("completed_at") or now,
                "updated_at": now,
                "exit_code": int(exit_code),
                "error": stderr_excerpt,
                "bundle_ready": False,
            }
        )
        self.repo.save_job(latest_job)
        return latest_job

    def list_jobs(self) -> IndexJobCollectionResponse:
        jobs = [self._job_from_dict(self._reconcile_job_runtime(job)) for job in self.repo.list_jobs()]
        return IndexJobCollectionResponse(count=len(jobs), jobs=jobs)

    def get_job(self, job_id: str) -> IndexJobDetail:
        return self._job_from_dict(self._reconcile_job_runtime(self._load_job_or_raise(job_id)))

    def _write_initial_job(
        self,
        *,
        job_id: str,
        source_type: str,
        source_path: str,
        source_filename: str,
        output_bundle_name: str,
        output_dir: Path,
        activate_on_success: bool,
    ) -> dict[str, Any]:
        now = _now_iso()
        job = {
            "job_id": job_id,
            "source_type": source_type,
            "state": "queued",
            "stage": "queued",
            "percent": 0,
            "message": "Queued for index build",
            "current": 0,
            "total": None,
            "eta_seconds": None,
            "source_path": source_path,
            "source_filename": source_filename,
            "output_bundle_name": output_bundle_name,
            "output_dir": str(output_dir),
            "activate_on_success": activate_on_success,
            "created_at": now,
            "updated_at": now,
            "started_at": None,
            "completed_at": None,
            "activated_at": None,
            "pid": None,
            "exit_code": None,
            "error": None,
            "bundle_ready": False,
            "timings_ms": {},
            "details": {},
        }
        self.repo.save_job(job)
        self.repo.save_request(
            job_id,
            {
                "job_id": job_id,
                "source_type": source_type,
                "source_path": source_path,
                "source_filename": source_filename,
                "output_bundle_name": output_bundle_name,
                "output_dir": str(output_dir),
                "activate_on_success": activate_on_success,
            },
        )
        return job

    def _spawn_worker(self, job_id: str) -> subprocess.Popen[Any]:
        stdout_path = self.repo.log_stdout_path(job_id)
        stderr_path = self.repo.log_stderr_path(job_id)
        stdout_handle = stdout_path.open("a", encoding="utf-8")
        stderr_handle = stderr_path.open("a", encoding="utf-8")
        try:
            env = os.environ.copy()
            pythonpath_parts = [str(self.backend_root.parent), str(self.backend_root)]
            existing_pythonpath = env.get("PYTHONPATH")
            if existing_pythonpath:
                pythonpath_parts.append(existing_pythonpath)
            env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)
            worker_script = self.backend_root / "app" / "workers" / "index_job_worker.py"
            cmd = [
                sys.executable,
                str(worker_script),
                "--job-id",
                job_id,
                "--jobs-dir",
                str(self.jobs_dir),
            ]
            return subprocess.Popen(
                cmd,
                cwd=str(self.backend_root),
                stdout=stdout_handle,
                stderr=stderr_handle,
                env=env,
            )
        finally:
            stdout_handle.close()
            stderr_handle.close()

    def _terminate_job_process(self, job_id: str, pid: int | None) -> bool:
        proc = self._processes.pop(job_id, None)
        if proc is not None:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
            return True

        if not pid:
            return False

        try:
            if os.name == "nt":
                completed = subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                output = f"{completed.stdout}\n{completed.stderr}".lower()
                return completed.returncode == 0 or "not found" in output or "no running instance" in output
            os.kill(pid, signal.SIGTERM)
            return True
        except ProcessLookupError:
            return True
        except OSError:
            return False

    def _monitor_auto_activation(self, job_id: str) -> None:
        def _runner() -> None:
            deadline = time.time() + 24 * 60 * 60
            while time.time() < deadline:
                job = self.repo.get_job(job_id)
                if not job:
                    return
                state = str(job.get("state", "")).lower()
                if state in {"failed", "activated", "cancelled"}:
                    return
                if state == "completed" and job.get("activate_on_success") and not job.get("activated_at"):
                    try:
                        self.activate_job(job_id)
                    except Exception:
                        return
                    return
                time.sleep(1.0)

        threading.Thread(target=_runner, daemon=True).start()

    def create_job_from_request(self, payload: IndexJobCreateRequest | dict[str, Any]) -> IndexJobDetail:
        if hasattr(payload, "model_dump"):
            data = payload.model_dump()
        else:
            data = dict(payload)

        source_type = str(data.get("source_type", "")).strip().lower()
        if source_type != "path":
            raise ValidationAppError("source_type must be 'path' for this endpoint.")

        source_path = str(data.get("xlsx_path", "")).strip()
        if not source_path:
            raise ValidationAppError("xlsx_path is required when source_type is 'path'.")
        source_file = Path(source_path)
        if not source_file.exists():
            raise ValidationAppError(f"Workbook not found: {source_path}")
        if source_file.suffix.lower() != ".xlsx":
            raise ValidationAppError("Only .xlsx workbooks are supported.")

        bundle_name = str(data.get("output_bundle_name") or self._default_bundle_name(source_path)).strip()
        activate_on_success = bool(data.get("activate_on_success", False))
        job_id = f"idx_{uuid.uuid4().hex[:16]}"
        output_dir = self._build_output_dir(bundle_name, job_id)
        self.repo.prepare_job_dir(job_id)
        initial = self._write_initial_job(
            job_id=job_id,
            source_type="path",
            source_path=source_path,
            source_filename=source_file.name,
            output_bundle_name=bundle_name,
            output_dir=output_dir,
            activate_on_success=activate_on_success,
        )
        proc = self._spawn_worker(job_id)
        self._processes[job_id] = proc
        initial["pid"] = proc.pid
        initial["state"] = "running"
        initial["stage"] = "starting"
        initial["message"] = "Index build process started"
        initial["started_at"] = _now_iso()
        initial["updated_at"] = _now_iso()
        self.repo.save_job(initial)
        if activate_on_success:
            self._monitor_auto_activation(job_id)
        return self.get_job(job_id)

    def create_job_from_upload(
        self,
        upload: UploadFile,
        *,
        output_bundle_name: str | None = None,
        activate_on_success: bool = False,
    ) -> IndexJobDetail:
        source_filename = Path(upload.filename or "uploaded.xlsx").name
        if Path(source_filename).suffix.lower() != ".xlsx":
            raise ValidationAppError("Only .xlsx uploads are supported.")
        job_id = f"idx_{uuid.uuid4().hex[:16]}"
        self.repo.prepare_job_dir(job_id)
        source_path = self.repo.source_path(job_id)
        with source_path.open("wb") as dest:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                dest.write(chunk)
        try:
            upload.file.close()
        except Exception:
            pass
        bundle_name = str(output_bundle_name or self._default_bundle_name(source_filename)).strip()
        output_dir = self._build_output_dir(bundle_name, job_id)
        initial = self._write_initial_job(
            job_id=job_id,
            source_type="upload",
            source_path=str(source_path),
            source_filename=source_filename,
            output_bundle_name=bundle_name,
            output_dir=output_dir,
            activate_on_success=activate_on_success,
        )
        proc = self._spawn_worker(job_id)
        self._processes[job_id] = proc
        initial["pid"] = proc.pid
        initial["state"] = "running"
        initial["stage"] = "starting"
        initial["message"] = "Index build process started"
        initial["started_at"] = _now_iso()
        initial["updated_at"] = _now_iso()
        self.repo.save_job(initial)
        if activate_on_success:
            self._monitor_auto_activation(job_id)
        return self.get_job(job_id)

    def cancel_job(self, job_id: str) -> IndexJobDetail:
        job = self._load_job_or_raise(job_id)
        state = str(job.get("state", "")).lower()

        if state == "cancelled":
            return self._job_from_dict(job)
        if state in {"completed", "failed", "activated"}:
            raise ValidationAppError("Only queued, running, or activating jobs can be cancelled.")

        pid_raw = job.get("pid")
        pid = int(pid_raw) if isinstance(pid_raw, int) or (isinstance(pid_raw, str) and str(pid_raw).isdigit()) else None
        terminated = self._terminate_job_process(job_id, pid)
        if not terminated and state in {"running", "activating"}:
            raise ValidationAppError("Unable to terminate the running index build process.")

        now = _now_iso()
        job.update(
            {
                "state": "cancelled",
                "stage": "cancelled",
                "message": "Index build cancelled by user",
                "updated_at": now,
                "completed_at": job.get("completed_at") or now,
                "exit_code": -1,
                "bundle_ready": False,
            }
        )
        self.repo.save_job(job)
        return self._job_from_dict(job)

    def activate_job(self, job_id: str) -> IndexJobDetail:
        job = self._load_job_or_raise(job_id)
        output_dir = Path(str(job.get("output_dir", "")))
        if not output_dir.exists():
            raise NotFoundError(f"Built bundle for job '{job_id}' not found.")
        if not (output_dir / "search.db").exists():
            raise ValidationAppError("Bundle is missing search.db.")
        if not (output_dir / "company_metadata.parquet").exists():
            raise ValidationAppError("Bundle is missing company_metadata.parquet.")
        if not (output_dir / "index_config.json").exists():
            raise ValidationAppError("Bundle is missing index_config.json.")

        self.search_service.reload_index(output_dir)
        save_json_atomic(
            Path(self.settings.active_index_state_path),
            {
                "job_id": job_id,
                "index_dir": str(output_dir),
                "activated_at": _now_iso(),
                "output_bundle_name": job.get("output_bundle_name", ""),
            },
        )
        self._processes.pop(job_id, None)
        job.update(
            {
                "state": "activated",
                "stage": "activated",
                "percent": 100,
                "message": f"Activated bundle '{job.get('output_bundle_name', '')}'",
                "activated_at": _now_iso(),
                "updated_at": _now_iso(),
                "bundle_ready": True,
            }
        )
        self.repo.save_job(job)
        return self._job_from_dict(job)
