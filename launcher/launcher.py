"""
Company Screener - local launcher.

Run as script:  python_runtime\\python.exe launcher\\launcher.py
Run as exe:     CompanyScreenerLauncher.exe  (compiled with system Python)
Compile:        see scripts\\build_launcher_exe.bat
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.request import urlopen

import customtkinter as ctk
import psutil

# ---------------------------------------------------------------------------
# Root path — works both as a script (launcher/launcher.py) and as a
# PyInstaller onefile exe placed at the repo root.
# ---------------------------------------------------------------------------
_FROZEN = getattr(sys, "frozen", False)
_THIS   = Path(sys.executable if _FROZEN else __file__).resolve()
ROOT    = _THIS.parent if _FROZEN else _THIS.parent.parent

CONFIG_FILE    = ROOT / "launcher_config.json"
SETUP_MARKER   = ROOT / ".setup_complete"
BACKEND_DIR    = ROOT / "backend"
FRONTEND_DIST  = ROOT / "frontend" / "dist"
LOG_FILE       = ROOT / "backend_server.log"
PYTHON_RUNTIME = ROOT / "python_runtime" / "python.exe"
PACKAGES_DIR   = ROOT / "packages"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_python() -> str:
    if PYTHON_RUNTIME.exists():
        return str(PYTHON_RUNTIME)
    if _FROZEN:
        raise RuntimeError(
            f"python_runtime\\python.exe not found.\nExpected at: {PYTHON_RUNTIME}"
        )
    return sys.executable


def find_free_port(start: int = 8000) -> int:
    for port in range(start, 65535):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.1)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("No free TCP port found")


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8")) if CONFIG_FILE.exists() else {}
    except Exception:
        return {}


def save_config(updates: dict) -> None:
    cfg = load_config()
    cfg.update(updates)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def is_pid_alive(pid: int) -> bool:
    try:
        p = psutil.Process(pid)
        return p.status() not in (psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD)
    except (psutil.NoSuchProcess, psutil.AccessDenied, ValueError):
        return False


def check_backend_health(port: int) -> bool:
    """TCP connect check — does anything bind the port on 127.0.0.1?"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def tail_log(path: Path, n_lines: int = 60) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []
    lines = text.splitlines()
    return lines[-n_lines:] if len(lines) > n_lines else lines


def packages_installed() -> bool:
    """Quick smoke-test: can python_runtime import the core backend packages?"""
    if not PYTHON_RUNTIME.exists():
        return False
    try:
        result = subprocess.run(
            [str(PYTHON_RUNTIME), "-c", "import fastapi, uvicorn, pandas, customtkinter, psutil"],
            capture_output=True, timeout=15,
        )
        return result.returncode == 0
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------

class Launcher(ctk.CTk):

    def __init__(self) -> None:
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.title("Company Screener")
        self.geometry("940x620")
        self.minsize(700, 480)

        self._backend_port: int | None = None
        self._backend_pid: int | None = None
        self._tail_active = False

        self._build_ui()
        self.after(300, self._check_initial_state)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ------------------------------------------------------------------ UI --

    def _build_ui(self) -> None:
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=22, pady=(16, 4))
        ctk.CTkLabel(
            header, text="Company Screener",
            font=ctk.CTkFont(size=22, weight="bold"),
        ).pack(side="left")
        self._app_status = ctk.CTkLabel(
            header, text="● Stopped",
            font=ctk.CTkFont(size=13), text_color="#888",
        )
        self._app_status.pack(side="right")

        btn_row = ctk.CTkFrame(self)
        btn_row.pack(fill="x", padx=22, pady=(8, 4))
        btn_row.grid_columnconfigure((0, 1, 2, 3), weight=1)

        self._btn_setup    = self._make_btn(btn_row, 0, "Setup",          "Verify / reinstall deps",   self._run_setup)
        self._btn_backend  = self._make_btn(btn_row, 1, "Start Backend",  "Auto-assigns free port",    self._toggle_backend)
        self._btn_frontend = self._make_btn(btn_row, 2, "Start Frontend", "Verify pre-built frontend", self._check_frontend)
        self._btn_open     = self._make_btn(btn_row, 3, "Open App",       "Open in browser",           self._open_app)

        status_bar = ctk.CTkFrame(self, height=36)
        status_bar.pack(fill="x", padx=22, pady=(4, 6))
        self._lbl_backend  = self._make_status(status_bar, "Backend: not started", "left")
        self._lbl_frontend = self._make_status(status_bar, "Frontend: not checked", "left")
        self._lbl_setup    = self._make_status(status_bar, "", "right")

        log_hdr = ctk.CTkFrame(self, fg_color="transparent")
        log_hdr.pack(fill="x", padx=24, pady=(2, 2))
        ctk.CTkLabel(log_hdr, text="Output", font=ctk.CTkFont(size=12, weight="bold")).pack(side="left")
        ctk.CTkButton(
            log_hdr, text="Clear", width=60, height=22,
            font=ctk.CTkFont(size=10), command=self._clear_log,
        ).pack(side="right")

        log_container = ctk.CTkFrame(self)
        log_container.pack(fill="both", expand=True, padx=22, pady=(0, 16))
        self._log_box = ctk.CTkTextbox(
            log_container,
            font=ctk.CTkFont(family="Consolas", size=11),
            wrap="word", state="disabled",
        )
        self._log_box.pack(fill="both", expand=True, padx=4, pady=4)

    def _make_btn(self, parent, col, label, subtitle, cmd) -> ctk.CTkButton:
        frame = ctk.CTkFrame(parent, fg_color="transparent")
        frame.grid(row=0, column=col, padx=6, pady=10, sticky="nsew")
        btn = ctk.CTkButton(
            frame, text=label, command=cmd,
            height=46, font=ctk.CTkFont(size=13, weight="bold"), corner_radius=8,
        )
        btn.pack(fill="x")
        ctk.CTkLabel(
            frame, text=subtitle,
            font=ctk.CTkFont(size=10), text_color="#888", justify="center",
        ).pack(pady=(3, 0))
        return btn

    def _make_status(self, parent, text, side) -> ctk.CTkLabel:
        lbl = ctk.CTkLabel(parent, text=text, font=ctk.CTkFont(size=11), text_color="#888")
        lbl.pack(side=side, padx=12, pady=6)
        return lbl

    # --------------------------------------------------------------- Logging --

    def _log(self, msg: str) -> None:
        def _do() -> None:
            self._log_box.configure(state="normal")
            self._log_box.insert("end", msg + "\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")
        self.after(0, _do)

    def _clear_log(self) -> None:
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    # -------------------------------------------------- Initial state check --

    def _check_initial_state(self) -> None:
        self._log(f"App root: {ROOT}")

        # Auto-mark setup complete if everything is already installed
        if not SETUP_MARKER.exists():
            if PYTHON_RUNTIME.exists() and (FRONTEND_DIST / "index.html").exists():
                self._log("Checking pre-installed packages...")
                if packages_installed():
                    SETUP_MARKER.write_text("ok", encoding="utf-8")
                    self._log("✓ All packages detected — setup is complete.")

        self._refresh_setup_label()

        # Check frontend
        if (FRONTEND_DIST / "index.html").exists():
            self._set_frontend_ready()
        else:
            self._log("⚠  frontend/dist/ not found — frontend build is missing from this package.")

        # Reconnect to a running backend
        cfg  = load_config()
        pid  = cfg.get("backend_pid")
        port = cfg.get("backend_port")
        if pid and port:
            if is_pid_alive(int(pid)):
                if check_backend_health(int(port)):
                    self._backend_pid  = int(pid)
                    self._backend_port = int(port)
                    self._set_backend_running(int(port))
                    self._log(f"Reconnected to running backend — port {port}  PID {pid}")
                    self._start_log_tail()
                else:
                    self._log(f"Backend PID {pid} is alive but not responding yet.")
            else:
                self._log("Previous backend session has ended.")
                save_config({"backend_pid": None, "backend_port": None})

    # ------------------------------------------------------------ Setup btn --

    def _run_setup(self) -> None:
        self._btn_setup.configure(state="disabled", text="Setting up...")
        threading.Thread(target=self._setup_worker, daemon=True).start()

    def _setup_worker(self) -> None:
        try:
            python = get_python()
        except RuntimeError as e:
            self._log(f"ERROR: {e}")
            self.after(0, lambda: self._btn_setup.configure(state="normal", text="Setup"))
            return

        self._log("=" * 56)
        self._log(f"Setup  |  Python: {python}")

        req_file = BACKEND_DIR / "requirements.txt"
        launcher_req = ROOT / "launcher" / "requirements.txt"

        if PACKAGES_DIR.is_dir() and any(PACKAGES_DIR.glob("*.whl")):
            pip_cmd = [python, "-m", "pip", "install", "--no-index",
                       "--find-links", str(PACKAGES_DIR),
                       "-r", str(req_file), "-r", str(launcher_req)]
            self._log("[1/2] Installing from local packages/ folder (offline)...")
        else:
            pip_cmd = [python, "-m", "pip", "install",
                       "-r", str(req_file), "-r", str(launcher_req)]
            self._log("[1/2] Installing from PyPI (internet required)...")

        if self._run_subprocess(pip_cmd, str(ROOT)) != 0:
            self._log("\nERROR: pip install failed.")
            self.after(0, lambda: self._btn_setup.configure(state="normal", text="Setup"))
            return

        self._log("\n[2/2] Checking frontend build...")
        if (FRONTEND_DIST / "index.html").exists():
            self._log(f"✓ frontend/dist/ found.")
        else:
            self._log("⚠  frontend/dist/ not found — this build is missing the pre-built frontend.")

        SETUP_MARKER.write_text("ok", encoding="utf-8")
        self._log("\n✓ Setup complete.")

        def _done() -> None:
            self._btn_setup.configure(state="normal", text="Setup")
            self._refresh_setup_label()
            if (FRONTEND_DIST / "index.html").exists():
                self._set_frontend_ready()

        self.after(0, _done)

    def _run_subprocess(self, cmd: list[str], cwd: str) -> int:
        try:
            proc = subprocess.Popen(
                cmd, cwd=cwd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True,
            )
            for line in proc.stdout:
                self._log(line.rstrip())
            proc.wait()
            return proc.returncode
        except Exception as exc:
            self._log(f"Command failed: {exc}")
            return 1

    # ------------------------------------------------------- Backend btn --

    def _toggle_backend(self) -> None:
        if self._backend_pid and is_pid_alive(self._backend_pid):
            threading.Thread(target=self._stop_backend, daemon=True).start()
        else:
            self._btn_backend.configure(state="disabled", text="Starting...")
            threading.Thread(target=self._start_backend_worker, daemon=True).start()

    def _start_backend_worker(self) -> None:
        try:
            python = get_python()
        except RuntimeError as e:
            self._log(f"ERROR: {e}")
            self.after(0, lambda: self._btn_backend.configure(state="normal", text="Start Backend"))
            return

        port = find_free_port(8000)
        self._log(f"\n{'=' * 56}")
        self._log(f"Starting backend on port {port}...")
        self._log(f"  Root:    {ROOT}")
        self._log(f"  Backend: {BACKEND_DIR}")
        self._log(f"  Python:  {python}")

        if not BACKEND_DIR.is_dir():
            self._log(f"ERROR: backend/ directory not found at {BACKEND_DIR}")
            self.after(0, lambda: self._btn_backend.configure(state="normal", text="Start Backend"))
            return

        LOG_FILE.write_text("", encoding="utf-8")

        # Set PYTHONPATH so 'company_screener' at repo root is importable
        env = os.environ.copy()
        env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")

        cmd = [python, "-m", "uvicorn", "app.main:app",
               "--host", "127.0.0.1", "--port", str(port)]
        try:
            flags = 0
            if os.name == "nt":
                flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP

            with open(LOG_FILE, "w", encoding="utf-8") as log_fh:
                proc = subprocess.Popen(
                    cmd,
                    cwd=str(BACKEND_DIR),
                    stdout=log_fh,
                    stderr=subprocess.STDOUT,
                    env=env,
                    creationflags=flags,
                )
        except Exception as exc:
            self._log(f"Failed to start backend: {exc}")
            self.after(0, lambda: self._btn_backend.configure(state="normal", text="Start Backend"))
            return

        self._backend_pid  = proc.pid
        self._backend_port = port
        save_config({"backend_pid": proc.pid, "backend_port": port})

        self._log(f"Backend PID: {proc.pid}")
        self._log("Waiting for backend to be ready...")
        ready = False
        for _ in range(40):
            time.sleep(0.5)
            if not is_pid_alive(proc.pid):
                break
            if check_backend_health(port):
                ready = True
                break

        if not ready:
            self._log("")
            self._log("=" * 56)
            if not is_pid_alive(proc.pid):
                self._log("✗ Backend process exited before binding the port.")
            else:
                self._log("✗ Backend did not bind the port within 20s.")
            self._log(f"--- backend_server.log ({LOG_FILE}) ---")
            lines = tail_log(LOG_FILE, 80)
            if lines:
                for ln in lines:
                    self._log(ln)
            else:
                self._log("(log file is empty — backend may have failed before writing output)")
            self._log("=" * 56)
            self._backend_pid  = None
            self._backend_port = None
            save_config({"backend_pid": None, "backend_port": None})
            self.after(0, lambda: self._btn_backend.configure(state="normal", text="Start Backend"))
            self.after(0, lambda: self._lbl_backend.configure(text="Backend: failed to start", text_color="#e55"))
            return

        self._log(f"✓ Backend running — http://127.0.0.1:{port}")
        self._log(f"  API docs: http://127.0.0.1:{port}/docs")
        self.after(0, lambda: self._set_backend_running(port))
        self._start_log_tail()

    def _stop_backend(self) -> None:
        pid = self._backend_pid
        self.after(0, lambda: self._btn_backend.configure(state="disabled", text="Stopping..."))
        if pid:
            try:
                p = psutil.Process(pid)
                p.terminate()
                p.wait(timeout=8)
            except Exception:
                try:
                    psutil.Process(pid).kill()
                except Exception:
                    pass
        self._backend_pid  = None
        self._backend_port = None
        self._tail_active  = False
        save_config({"backend_pid": None, "backend_port": None})
        self._log("Backend stopped.")

        def _done() -> None:
            self._lbl_backend.configure(text="Backend: stopped", text_color="#888")
            self._btn_backend.configure(state="normal", text="Start Backend")
            self._app_status.configure(text="● Stopped", text_color="#888")

        self.after(0, _done)

    def _start_log_tail(self) -> None:
        if self._tail_active:
            return
        self._tail_active = True
        threading.Thread(target=self._tail_log_file, daemon=True).start()

    def _tail_log_file(self) -> None:
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as fh:
                fh.seek(0, 2)
                while self._tail_active:
                    if self._backend_pid and not is_pid_alive(self._backend_pid):
                        break
                    line = fh.readline()
                    if line:
                        self._log(line.rstrip())
                    else:
                        time.sleep(0.15)
        except Exception:
            pass
        self._tail_active = False

    # ------------------------------------------------------- Frontend btn --

    def _check_frontend(self) -> None:
        if (FRONTEND_DIST / "index.html").exists():
            self._log("✓ frontend/dist/ is present and ready.")
            if self._backend_port:
                self._log(f"  Served at: http://127.0.0.1:{self._backend_port}")
            self._set_frontend_ready()
        else:
            self._log("✗ frontend/dist/ not found.")
            self._lbl_frontend.configure(text="Frontend: dist missing", text_color="#e55")

    # ---------------------------------------------------------- Open App --

    def _open_app(self) -> None:
        port = self._backend_port or load_config().get("backend_port")
        if not port:
            self._log("Start the backend first.")
            return
        url = f"http://127.0.0.1:{port}"
        self._log(f"Opening {url}")
        webbrowser.open(url)

    # -------------------------------------------------------- UI helpers --

    def _set_backend_running(self, port: int) -> None:
        self._lbl_backend.configure(text=f"Backend: port {port}", text_color="#4c4")
        self._btn_backend.configure(state="normal", text="Stop Backend")
        self._app_status.configure(text=f"● Running on :{port}", text_color="#4c4")

    def _set_frontend_ready(self) -> None:
        self._lbl_frontend.configure(text="Frontend: ready", text_color="#4c4")

    def _refresh_setup_label(self) -> None:
        if SETUP_MARKER.exists():
            self._lbl_setup.configure(text="Setup: done", text_color="#4c4")
        else:
            self._lbl_setup.configure(text="Setup: required", text_color="#e90")

    # ------------------------------------------------------------- Close --

    def _on_close(self) -> None:
        self._tail_active = False
        self.destroy()


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
