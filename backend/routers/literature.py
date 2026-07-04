"""Literature search routes."""
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Paper
from ..services.literature.aggregator import search_all


router = APIRouter(prefix="/api/literature", tags=["literature"])


class SearchIn(BaseModel):
    query: str
    sources: Optional[List[str]] = None
    limit: int = 8


@router.post("/search")
async def search(inp: SearchIn):
    return await search_all(inp.query, inp.sources, inp.limit)


@router.get("/starred")
def starred(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Paper).filter(Paper.starred == True)
    if project_id:
        query = query.filter(Paper.project_id == project_id)
    return query.all()


class StarIn(BaseModel):
    doi: Optional[str] = None
    title: str
    authors: str = ""
    journal: str = ""
    year: Optional[int] = None
    abstract: str = ""
    source: str = ""
    url: str = ""
    project_id: Optional[str] = None


@router.post("/star")
def star(inp: StarIn, db: Session = Depends(get_db)):
    if inp.doi:
        existing = db.query(Paper).filter(Paper.doi == inp.doi).first()
        if existing:
            existing.starred = True
            db.commit()
            return {"ok": True, "id": existing.id}
    paper = Paper(
        doi=inp.doi,
        title=inp.title,
        authors=inp.authors,
        journal=inp.journal,
        year=inp.year,
        abstract=inp.abstract,
        source=inp.source,
        url=inp.url,
        project_id=inp.project_id,
        starred=True,
    )
    db.add(paper)
    db.commit()
    return {"ok": True, "id": paper.id}


@router.delete("/{paper_id}")
def unstar(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).get(paper_id)
    if paper:
        db.delete(paper)
        db.commit()
    return {"ok": True}
