"""Lightweight execution sandbox helpers.

This module provides a defensive isolation layer for the Python/R code that
agents execute. It is intentionally *not* a full OS sandbox (a local
single-user desktop app does not need a container), but it adds the boundaries
that matter for accidental (not malicious) damage:

- **Memory cap** via a ``psutil`` watcher thread that kills the runaway process
  tree when the resident set exceeds the configured limit.
- **Whole-process-tree kill** on timeout, so a parent script cannot leave
  orphaned children behind (the default ``subprocess.run`` only kills the
  direct child).
- **Environment scrubbing**: removes ``LLM_API_KEY`` and other secrets from the
  child environment so a generated script cannot exfiltrate credentials by
  accident.

All helpers degrade gracefully: if ``psutil`` is unavailable, execution still
proceeds with whatever isolation the current platform offers. Correctness (the
script runs) is never sacrificed for hardening.
"""
from __future__ import annotations

import os
import threading
from typing import Iterable

from loguru import logger


# Variables stripped from every spawned code-execution subprocess. A generated
# script should never need the user's API key, and leaving it in the inherited
# environment is a footgun (e.g. ``os.environ.get("LLM_API_KEY")`` in print
# debugging, or a third-party lib that ships telemetry).
ENV_DENYLIST = (
    "LLM_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "ZHIPU_API_KEY",
    "GLM_API_KEY",
)


def scrubbed_env(base: dict | None = None) -> dict:
    """Return a copy of ``base`` (or ``os.environ``) with secret vars removed."""
    env = dict(base if base is not None else os.environ)
    for key in list(env.keys()):
        if key.upper() in ENV_DENYLIST:
            env.pop(key, None)
    return env


def has_psutil() -> bool:
    try:
        import psutil  # noqa: F401  # type: ignore
        return True
    except Exception:
        return False


class MemoryWatcher:
    """Best-effort memory watcher for a process tree.

    Polls the process tree every 0.5s and kills any process whose resident set
    exceeds the limit. Uses ``psutil`` when available; otherwise it is a no-op
    (correctness over hardening). Construct with :py:meth:`start` and stop with
    :py:meth:`stop` once the run completes.
    """

    def __init__(self, procs: Iterable, memory_limit_mb: int):
        self._stop = threading.Event()
        self._limit_bytes = memory_limit_mb * 1024 * 1024
        try:
            import psutil  # type: ignore
            self._psutil = psutil
            self._parents = [p for p in procs if p is not None]
        except Exception:
            self._psutil = None
            self._parents = []
        self._thread: threading.Thread | None = None

    def start(self) -> "MemoryWatcher":
        if not self._psutil or not self._parents:
            return self
        self._thread = threading.Thread(target=self._run, daemon=True, name="sw-sandbox-watch")
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        psutil = self._psutil
        while not self._stop.is_set():
            for parent in list(self._parents):
                try:
                    if not parent.is_running():
                        continue
                    rss = parent.memory_info().rss
                    if rss > self._limit_bytes:
                        logger.warning(
                            f"[sandbox] process {parent.pid} exceeded memory cap "
                            f"({rss // (1024 * 1024)} MB > {self._limit_bytes // (1024 * 1024)} MB); killing tree"
                        )
                        for child in parent.children(recursive=True) + [parent]:
                            try:
                                child.kill()
                            except Exception:
                                pass
                        return
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            self._stop.wait(0.5)


def kill_process_tree(proc) -> None:
    """Forcefully terminate a process and all its descendants.

    Used on timeout so a runaway ``subprocess.run`` cannot leave orphaned child
    processes. Falls back to a direct ``kill()`` when ``psutil`` is missing.
    """
    try:
        import psutil  # type: ignore

        if proc and hasattr(proc, "pid"):
            try:
                parent = psutil.Process(proc.pid)
            except psutil.NoSuchProcess:
                return
            for child in parent.children(recursive=True):
                try:
                    child.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            try:
                parent.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            return
    except Exception:
        pass

    try:
        if proc and proc.poll() is None:
            proc.kill()
    except Exception:
        pass
