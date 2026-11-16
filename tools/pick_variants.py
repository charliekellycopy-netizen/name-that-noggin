"""Review and approve extra photos per person.

  python3 tools/pick_variants.py sheet [id ...]
      Uses photos-candidates/screen.json to drop obvious misses (no face, a group
      shot, a tiny or side-on face, the dome cut off) and writes
      name-that-noggin/candidates.html showing the dome crop and reveal for the rest.
      Run `swift tools/crop_heads.swift photos-candidates name-that-noggin/cand-crops` first.

  python3 tools/pick_variants.py add jason-statham/3 moby/0 ...
      Appends those candidates to photos.json. Then run download_photos.py and crop_heads.swift.
"""
import html
import json
import sys

from find_photos import OUT as PHOTOS_JSON, ROOT, file_info

CAND = ROOT / "photos-candidates"
SHEET = ROOT / "name-that-noggin" / "candidates.html"
MAX_PER_PERSON = 4  # including the lead photo


def passes(s):
    """Hard filters; the colour check is too noisy to reject on, so it only ranks."""
    return (s.get("faces", 0) >= 1 and s.get("faceFrac", 0) >= 0.15 and s.get("second", 0) < 0.6
            and abs(s.get("yaw", 0)) <= 45 and s.get("headroom", -1) >= -0.2)


def sheet(only=()):
    cands = json.loads((CAND / "candidates.json").read_text())
    if only:
        cands = {k: v for k, v in cands.items() if k in only}
    screen = json.loads((CAND / "screen.json").read_text())
    have = json.loads(PHOTOS_JSON.read_text())
    sections, total = [], 0
    for gid, entries in cands.items():
        rows = []
        for e in entries:
            key = e["local"].removesuffix(".jpg")
            s = screen.get(e["local"], {})
            if passes(s):
                rows.append((s.get("domeDiff", 9), key, e))
        rows.sort()
        total += len(rows)
        cards = "".join(
            f'<figure><div class=pair><img src="cand-crops/{k}/crop.jpg"><img src="cand-crops/{k}/full.jpg"></div>'
            f'<figcaption><b>{k}</b> &middot; {d:.2f}<br>{html.escape(e["file"][5:60])}</figcaption></figure>'
            for d, k, e in rows)
        sections.append(f'<h2>{gid} <small>({len(have.get(gid, []))} in game, {len(rows)} candidates)</small></h2>'
                        f'<div class=grid>{cards or "<p>None passed screening.</p>"}</div>')
    SHEET.write_text("""<meta charset="utf-8"><title>Variant Candidates</title>
<style>body{font:13px system-ui;margin:16px;background:#1b1f1e;color:#e6eeea}h2{font-size:16px;margin:22px 0 8px}small{color:#9fb5ad;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}figure{margin:0;background:#262c2a;border-radius:8px;padding:6px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:4px}img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;background:#000}
figcaption{font-size:11px;color:#9fb5ad;margin-top:4px;word-break:break-all}b{color:#fff}</style>""" + "".join(sections))
    print(f"{total} candidates passed screening; open candidates.html")


def add(keys):
    cands = json.loads((CAND / "candidates.json").read_text())
    by_key = {e["local"].removesuffix(".jpg"): e for es in cands.values() for e in es}
    photos = json.loads(PHOTOS_JSON.read_text())
    chosen = [by_key[k] for k in keys]
    info = file_info([e["file"] for e in chosen])  # proper download URL at the standard size
    for k, e in zip(keys, chosen):
        gid = k.split("/")[0]
        lst = photos.setdefault(gid, [])
        if any(v["file"] == e["file"] for v in lst):
            continue
        if len(lst) >= MAX_PER_PERSON:
            print(f"{gid}: already has {len(lst)}, skipping {k}")
            continue
        lst.append(dict(info[e["file"]], free=True))
        print(f"added {k} → {gid}/{len(lst) - 1}")
    PHOTOS_JSON.write_text(json.dumps(photos, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if sys.argv[1:2] == ["sheet"]:
        sheet(sys.argv[2:])
    elif sys.argv[1:2] == ["add"]:
        add(sys.argv[2:])
    else:
        print(__doc__)
