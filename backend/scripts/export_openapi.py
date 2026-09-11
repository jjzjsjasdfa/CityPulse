import json
from pathlib import Path

from app.main import app


def main() -> None:
    destination = Path(__file__).resolve().parents[2] / "mobile" / "openapi.json"
    destination.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {destination}")


if __name__ == "__main__":
    main()

