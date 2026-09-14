"""Import real Showstart candidates on startup. Never publish without administrator review."""

import logging

from app.core.config import settings
from app.ingestion.runner import run


def main() -> None:
    if not settings.ingestion_on_startup:
        return
    try:
        result = run(source_key="showstart-changsha-concert-hall", limit=100, dry_run=False)
        logging.warning("Showstart ingestion: %s", result)
    except Exception:
        # A source outage must not prevent access to existing events or the review queue.
        logging.exception("Showstart import failed. Retry with: python -m app.ingestion")


if __name__ == "__main__":
    main()
