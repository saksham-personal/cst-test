from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
for candidate in (str(REPO_ROOT), str(BACKEND_ROOT)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from company_screener.index_builder import IndexBuildProgress, build_index_bundle

from app.storage.index_jobs_repo import IndexJobRepository


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _compute_eta(percent: int, elapsed_seconds: float) -> float | None:
    if percent <= 0:
        return None
    remaining_ratio = max(0.0, (100 - percent) / max(1, percent))
    return round(elapsed_seconds * remaining_ratio, 2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run an index build job")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--jobs-dir", required=True)
    args = parser.parse_args()

    repo = IndexJobRepository(args.jobs_dir)
    job = repo.get_job(args.job_id)
    if job is None:
        raise SystemExit(f"Job '{args.job_id}' not found")

    start = time.time()

    def _update(progress: IndexBuildProgress) -> None:
        current_job = repo.get_job(args.job_id) or dict(job)
        current_job.update(
            {
                "state": "running",
                "stage": progress.stage,
                "percent": int(progress.percent),
                "message": progress.message,
                "current": progress.current,
                "total": progress.total,
                "eta_seconds": _compute_eta(int(progress.percent), time.time() - start),
                "started_at": current_job.get("started_at") or _now_iso(),
                "updated_at": _now_iso(),
                "pid": current_job.get("pid") or None,
                "details": {**(current_job.get("details") or {}), **progress.details},
            }
        )
        repo.save_job(current_job)

    job["state"] = "running"
    job["stage"] = "starting"
    job["message"] = "Worker started"
    job["started_at"] = job.get("started_at") or _now_iso()
    job["updated_at"] = _now_iso()
    job["pid"] = job.get("pid") or None
    repo.save_job(job)

    request = repo.load_request(args.job_id)
    if request is None:
        job.update({"state": "failed", "stage": "failed", "error": "Missing request payload"})
        repo.save_job(job)
        raise SystemExit("Missing request payload")

    try:
        result = build_index_bundle(
            request["source_path"],
            request["output_dir"],
            progress_callback=_update,
        )
        completed_job = repo.get_job(args.job_id) or dict(job)
        completed_job.update(
            {
                "state": "completed",
                "stage": "completed",
                "percent": 100,
                "message": f"Index bundle built at {result.output_dir}",
                "current": result.num_companies,
                "total": result.num_companies,
                "eta_seconds": 0,
                "completed_at": _now_iso(),
                "updated_at": _now_iso(),
                "bundle_ready": True,
                "exit_code": 0,
                "error": None,
                "timings_ms": {
                    **(completed_job.get("timings_ms") or {}),
                    "build_total": round((time.time() - start) * 1000, 2),
                },
                "details": {
                    **(completed_job.get("details") or {}),
                    "result": result.model_dump(),
                },
            }
        )
        repo.save_job(completed_job)
    except Exception as exc:  # pragma: no cover - worker failure path
        failed_job = repo.get_job(args.job_id) or dict(job)
        failed_job.update(
            {
                "state": "failed",
                "stage": "failed",
                "percent": 100 if failed_job.get("percent", 0) else 0,
                "message": f"Index build failed: {exc}",
                "error": traceback.format_exc(),
                "completed_at": _now_iso(),
                "updated_at": _now_iso(),
                "bundle_ready": False,
                "exit_code": 1,
                "timings_ms": {
                    **(failed_job.get("timings_ms") or {}),
                    "build_total": round((time.time() - start) * 1000, 2),
                },
            }
        )
        repo.save_job(failed_job)
        raise


if __name__ == "__main__":
    main()
