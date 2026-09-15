"""Local launcher; also recognizes the isolated dependencies used by this workspace."""

import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
if (root / ".test-deps").is_dir():
    sys.path.insert(0, str(root / ".test-deps"))

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.demo:app", host="0.0.0.0", port=18082)
