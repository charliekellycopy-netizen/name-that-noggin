"""Copy each photo's zoom framings from public/img/crops-report.json into src/data/zoom.json.

Usage: python3 tools/zoom_data.py   (after crop_heads.swift)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
report = json.loads((ROOT / "public" / "img" / "crops-report.json").read_text())
zoom = {e["id"]: e["zoom"] for e in report if "zoom" in e}
(ROOT / "src" / "data" / "zoom.json").write_text(json.dumps(zoom, separators=(",", ":")) + "\n")
print(f"{len(zoom)} photos written to src/data/zoom.json")
