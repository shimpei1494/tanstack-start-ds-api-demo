"""Run from services/ds-api: uv run python scripts/export_openapi.py."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/ds-api"))
from src.api.app import app

(ROOT / "packages/ds-contract/openapi.json").write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"
)
