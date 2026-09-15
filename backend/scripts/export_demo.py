"""Export a portable fixture; no database or external credentials required."""

import json
from pathlib import Path

from app.demo_data import build_dataset

if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "fixtures" / "demo-events.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_dataset(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Exported 200 fictional activities to {destination}")
