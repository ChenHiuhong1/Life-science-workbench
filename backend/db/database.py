"""SQLite database setup and FastAPI session dependency."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from ..config import DATA_DIR


DB_PATH = DATA_DIR / "app.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
    """Create tables and apply small additive SQLite migrations."""
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    migrations = {
        "projects": [
            ("local_path", "TEXT DEFAULT ''"),
            ("archived", "BOOLEAN DEFAULT 0"),
            ("server_host", "TEXT DEFAULT ''"),
            ("server_port", "INTEGER DEFAULT 22"),
            ("server_username", "TEXT DEFAULT ''"),
            ("server_password", "TEXT DEFAULT ''"),
            ("server_workdir", "TEXT DEFAULT ''"),
        ],
        "hpc_connections": [],
        "artifacts": [("project_path", "TEXT DEFAULT ''")],
    }
    with engine.connect() as conn:
        for table, cols in migrations.items():
            if not inspector.has_table(table):
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for col_name, col_type in cols:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
                    import loguru

                    loguru.logger.info(f"[db] migrated {table} +{col_name}")
        conn.commit()


def get_db():
    """Yield one SQLAlchemy session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
