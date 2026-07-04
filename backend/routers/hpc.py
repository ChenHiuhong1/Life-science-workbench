"""HPC routes for SSH connections, file transfer, command execution, and schedulers."""
import os
import shlex
import tempfile
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import HpcConnection as HpcModel
from ..services.hpc import HpcConnection, get_or_create, remove


router = APIRouter(prefix="/api/hpc", tags=["hpc"])


class HpcIn(BaseModel):
    name: str = "My Server"
    host: str
    port: int = 22
    username: str
    password: str = ""
    key_path: str = ""
    scheduler: str = "slurm"
    work_dir: str = ""
    project_id: Optional[str] = None


class HpcOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    username: str
    scheduler: str
    work_dir: str
    project_id: Optional[str]
    has_password: bool


def _to_out(conn: HpcModel) -> HpcOut:
    return HpcOut(
        id=conn.id,
        name=conn.name,
        host=conn.host,
        port=conn.port,
        username=conn.username,
        scheduler=conn.scheduler,
        work_dir=conn.work_dir,
        project_id=conn.project_id,
        has_password=bool(conn.password),
    )


@router.get("", response_model=List[HpcOut])
def list_conns(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(HpcModel)
    if project_id:
        query = query.filter(HpcModel.project_id == project_id)
    return [_to_out(conn) for conn in query.order_by(HpcModel.created_at.desc()).all()]


@router.post("", response_model=HpcOut)
def create_conn(inp: HpcIn, db: Session = Depends(get_db)):
    conn = HpcModel(
        id=uuid.uuid4().hex,
        name=inp.name,
        host=inp.host,
        port=inp.port,
        username=inp.username,
        password=inp.password,
        key_path=inp.key_path,
        scheduler=inp.scheduler,
        work_dir=inp.work_dir,
        project_id=inp.project_id,
        auth_method="password" if inp.password else "key",
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return _to_out(conn)


@router.delete("/{cid}")
def delete_conn(cid: str, db: Session = Depends(get_db)):
    conn = db.query(HpcModel).get(cid)
    if not conn:
        raise HTTPException(404, "Connection does not exist")
    remove(cid)
    db.delete(conn)
    db.commit()
    return {"ok": True}


async def _get_conn(cid: str, db: Session) -> HpcConnection:
    conn = db.query(HpcModel).get(cid)
    if not conn:
        raise HTTPException(404, "Connection does not exist")
    return await get_or_create(cid, {
        "host": conn.host,
        "port": conn.port,
        "username": conn.username,
        "password": conn.password,
        "key_path": conn.key_path,
        "work_dir": conn.work_dir,
    })


@router.post("/{cid}/test")
async def test_conn(cid: str, db: Session = Depends(get_db)):
    conn = db.query(HpcModel).get(cid)
    if not conn:
        raise HTTPException(404, "Connection does not exist")
    tmp = HpcConnection(
        host=conn.host,
        port=conn.port,
        username=conn.username,
        password=conn.password,
        key_path=conn.key_path,
        work_dir=conn.work_dir,
    )
    try:
        result = await tmp.exec("echo connected_ok && hostname && whoami", timeout=15)
        await tmp.close()
        if result["code"] == 0:
            return {"ok": True, "output": result["stdout"].strip()}
        return {"ok": False, "error": result["stderr"] or "Unknown error"}
    except Exception as exc:
        await tmp.close()
        return {"ok": False, "error": str(exc)}


class TestCredsIn(BaseModel):
    host: str
    port: int = 22
    username: str
    password: str = ""
    key_path: str = ""
    work_dir: str = ""


@router.post("/test-creds")
async def test_creds(inp: TestCredsIn):
    tmp = HpcConnection(
        host=inp.host,
        port=inp.port,
        username=inp.username,
        password=inp.password,
        key_path=inp.key_path,
        work_dir=inp.work_dir,
    )
    try:
        result = await tmp.exec("echo connected_ok && hostname && whoami", timeout=15)
        await tmp.close()
        if result["code"] == 0:
            return {"ok": True, "output": result["stdout"].strip()}
        return {"ok": False, "error": result["stderr"] or "Connection refused"}
    except Exception as exc:
        await tmp.close()
        return {"ok": False, "error": str(exc)}


class ExecIn(BaseModel):
    command: str
    timeout: int = 300


@router.post("/{cid}/exec")
async def exec_cmd(cid: str, inp: ExecIn, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    return await conn.exec(inp.command, timeout=inp.timeout)


class TransferIn(BaseModel):
    local_path: str
    remote_path: str


@router.post("/{cid}/upload")
async def upload(cid: str, inp: TransferIn, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    return await conn.upload(inp.local_path, inp.remote_path)


@router.post("/{cid}/download")
async def download(cid: str, inp: TransferIn, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    return await conn.download(inp.remote_path, inp.local_path)


@router.get("/{cid}/ls")
async def list_dir(cid: str, path: str = "", db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    return await conn.list_dir(path)


class SbatchIn(BaseModel):
    script: str
    remote_path: str = ""


@router.post("/{cid}/sbatch")
async def sbatch(cid: str, inp: SbatchIn, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    remote = inp.remote_path or f"{conn.work_dir}/submit_{int(time.time())}.sh"
    remote_quoted = shlex.quote(remote)
    fd, tmp = tempfile.mkstemp(suffix=".sh")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(inp.script)
        upload_result = await conn.upload(tmp, remote)
        if not upload_result.get("ok"):
            return upload_result
    finally:
        os.unlink(tmp)

    result = await conn.exec(f"chmod +x {remote_quoted} && sbatch {remote_quoted}")
    return {"submit_result": result, "remote_script": remote}


@router.get("/{cid}/queue")
async def queue(cid: str, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    model = db.query(HpcModel).get(cid)
    if model.scheduler == "pbs":
        return await conn.exec("qstat -u $USER")
    if model.scheduler == "sge":
        return await conn.exec("qstat")
    return await conn.exec("squeue --me")


@router.get("/{cid}/job/{job_id}")
async def job_info(cid: str, job_id: str, db: Session = Depends(get_db)):
    conn = await _get_conn(cid, db)
    model = db.query(HpcModel).get(cid)
    if model.scheduler == "pbs":
        return await conn.exec(f"qstat -f {job_id}")
    return await conn.exec(f"scontrol show job {job_id}")
