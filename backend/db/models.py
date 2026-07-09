"""Database models for projects, sessions, messages, artifacts, papers, and HPC connections."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    local_path = Column(Text, default="")
    archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Optional remote execution server. Used by the bio-analysis and
    # structure-bio agents when filled in: code runs over SSH on this host
    # instead of the local sandbox. Empty host = run locally (the default).
    server_host = Column(Text, default="")
    server_port = Column(Integer, default=22)
    server_username = Column(Text, default="")
    server_password = Column(Text, default="")
    server_workdir = Column(Text, default="")

    sessions = relationship("Session", back_populates="project", cascade="all, delete-orphan")


class HpcConnection(Base):
    """Stored SSH connection settings."""

    __tablename__ = "hpc_connections"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=22)
    username = Column(String, nullable=False)
    auth_method = Column(String, default="password")
    password = Column(Text, default="")
    key_path = Column(Text, default="")
    scheduler = Column(String, default="slurm")
    work_dir = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    title = Column(String, default="New Session")
    mode = Column(String, default="chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan", order_by="Message.id")
    artifacts = relationship("Artifact", back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, default="")
    tool_calls = Column(JSON, default=list)
    citations = Column(JSON, default=list)
    artifact_ids = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="messages")


class Artifact(Base):
    """Traceable code-execution artifact."""

    __tablename__ = "artifacts"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    kind = Column(String, default="code")
    title = Column(String, default="")
    language = Column(String, default="python")
    code = Column(Text, default="")
    output = Column(Text, default="")
    files = Column(JSON, default=list)
    env_snapshot = Column(Text, default="")
    project_path = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="artifacts")


class Paper(Base):
    """Starred literature record."""

    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    doi = Column(String, index=True)
    title = Column(Text, nullable=False)
    authors = Column(Text, default="")
    journal = Column(String, default="")
    year = Column(Integer)
    abstract = Column(Text, default="")
    source = Column(String, default="")
    citation_count = Column(Integer, default=0)
    url = Column(Text, default="")
    raw = Column(JSON, default=dict)
    starred = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
