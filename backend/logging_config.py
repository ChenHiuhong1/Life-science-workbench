"""Loguru logging setup."""
import sys

from loguru import logger

from .config import LOG_DIR


logger.remove()
logger.add(
    sys.stderr,
    level="INFO",
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <7}</level> | <cyan>{name}</cyan> | {message}",
    colorize=True,
)
logger.add(
    str(LOG_DIR / "app.log"),
    level="DEBUG",
    rotation="10 MB",
    retention="7 days",
    encoding="utf-8",
)
