"""Async SSH connection manager for HPC workflows."""
import asyncio
import shlex
from pathlib import Path
from typing import Optional

import asyncssh
from loguru import logger


def fix_gitbash_path(path: str) -> str:
    """Normalize paths that may have been rewritten by Git Bash/MSYS."""
    if not path:
        return path
    if path.startswith("C:/Program Files/Git/") or path.startswith("C:\\Program Files\\Git\\"):
        path = path.replace("C:/Program Files/Git/", "/").replace("C:\\Program Files\\Git\\", "/")
    if "AppData/Local/Temp/" in path or "AppData\\Local\\Temp\\" in path:
        import re

        path = re.sub(r"C:[/\\]Users[/\\][^/\\]+[/\\]AppData[/\\]Local[/\\]Temp", "/tmp", path)
    return path


class HpcConnection:
    """Single reusable SSH connection."""

    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = "",
        password: str = "",
        key_path: str = "",
        work_dir: str = "",
        ready_timeout: int = 20,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.key_path = key_path
        self.work_dir = work_dir or "~"
        self.ready_timeout = ready_timeout
        self._conn: Optional[asyncssh.SSHClientConnection] = None
        self._lock = asyncio.Lock()

    async def _ensure_connected(self):
        if self._conn is not None:
            try:
                result = await asyncio.wait_for(self._conn.run("echo ok", check=False), timeout=5)
                if result.exit_status == 0:
                    return self._conn
            except Exception:
                pass
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

        logger.info(f"[hpc] connecting {self.username}@{self.host}:{self.port}")
        kwargs = dict(
            host=self.host,
            port=self.port,
            username=self.username,
            known_hosts=None,
            login_timeout=self.ready_timeout,
        )
        if self.password:
            kwargs["password"] = self.password
        if self.key_path and Path(self.key_path).exists():
            kwargs["client_keys"] = [self.key_path]

        self._conn = await asyncssh.connect(**kwargs)
        logger.info(f"[hpc] connected {self.host}")
        return self._conn

    async def exec(self, command: str, timeout: int = 120) -> dict:
        async with self._lock:
            conn = await self._ensure_connected()
            if self.work_dir and self.work_dir not in ("~", ".", ""):
                command = f"cd {shlex.quote(self.work_dir)} 2>/dev/null || cd $HOME; {command}"
            logger.debug(f"[hpc] exec: {command[:120]}")
            result = await conn.run(command, check=False, timeout=timeout)
            return {
                "code": result.exit_status if result.exit_status is not None else -1,
                "stdout": result.stdout or "",
                "stderr": result.stderr or "",
            }

    async def upload(self, local_path: str, remote_path: str) -> dict:
        local_path = fix_gitbash_path(local_path)
        local = Path(local_path)
        if not local.exists():
            return {"ok": False, "error": f"Local path does not exist: {local_path}"}

        remote_is_dir = local.is_dir() or remote_path.endswith("/") or "." not in remote_path.rsplit("/", 1)[-1]
        if remote_is_dir:
            remote_path = remote_path.rstrip("/") + "/" + local.name

        async with self._lock:
            conn = await self._ensure_connected()
            try:
                remote_dir = remote_path.rsplit("/", 1)[0] if "/" in remote_path else "."
                await conn.run(f"mkdir -p {shlex.quote(remote_dir)}", check=False, timeout=10)
                await asyncssh.scp(local_path, (conn, remote_path), recurse=local.is_dir())
                size = _path_size(local)
                logger.info(f"[hpc] uploaded {local.name} -> {remote_path} ({size}B)")
                return {"ok": True, "remote": remote_path, "size": size, "is_dir": local.is_dir()}
            except Exception as exc:
                logger.warning(f"[hpc] upload failed: {exc}")
                return {"ok": False, "error": str(exc)}

    async def download(self, remote_path: str, local_path: str) -> dict:
        local_path = fix_gitbash_path(local_path)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)

        async with self._lock:
            conn = await self._ensure_connected()
            try:
                await asyncssh.scp((conn, remote_path), local_path)
                size = Path(local_path).stat().st_size if Path(local_path).exists() else 0
                logger.info(f"[hpc] downloaded {remote_path} -> {local_path} ({size}B)")
                return {"ok": True, "local": local_path, "size": size}
            except Exception as exc:
                logger.warning(f"[hpc] download failed: {exc}")
                return {"ok": False, "error": str(exc)}

    async def list_dir(self, remote_path: str = ".") -> dict:
        remote_path = fix_gitbash_path(remote_path) or self.work_dir
        async with self._lock:
            conn = await self._ensure_connected()
            try:
                sftp = await conn.start_sftp_client()
                entries = []
                for item in await sftp.readdir(remote_path or "."):
                    name = item.filename.split("/")[-1]
                    if name in (".", "..") or name.startswith("."):
                        continue
                    entries.append({
                        "name": name,
                        "longname": item.longname,
                        "is_dir": (item.longname or "").startswith("d"),
                        "size": item.size,
                    })
                return {"ok": True, "path": remote_path, "entries": entries}
            except Exception as exc:
                return {"ok": False, "error": str(exc)}

    async def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info(f"[hpc] closed connection {self.host}")


_pool: dict[str, HpcConnection] = {}


def _path_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            total += child.stat().st_size
    return total


async def get_or_create(conn_id: str, params: dict, db_conn=None) -> HpcConnection:
    if conn_id in _pool:
        return _pool[conn_id]
    conn = HpcConnection(
        host=params["host"],
        port=params.get("port", 22),
        username=params["username"],
        password=params.get("password", ""),
        key_path=params.get("key_path", ""),
        work_dir=params.get("work_dir", "~"),
    )
    _pool[conn_id] = conn
    return conn


def remove(conn_id: str):
    conn = _pool.pop(conn_id, None)
    if conn:
        asyncio.create_task(conn.close())
