"""List freely licensed Commons photos from a person's category, as a picker page.

Usage: python3 tools/find_alternatives.py billy-zane "Category:Billy Zane" [more id/source pairs...]
A source can also be "search:<words>" to search Commons file names.
Writes name-that-noggin/alternatives.html. Pick a file, put it in OVERRIDES in
find_photos.py, and re-run find_photos.py.
"""
import hashlib
import html
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from find_photos import FREE, ROOT, UA, api, strip_html  # noqa: E402

OUT = ROOT / "name-that-noggin" / "alternatives.html"
THUMBS = ROOT / "name-that-noggin" / "alt-thumbs"  # Wikimedia blocks hotlinking from localhost


def local_thumb(url):
    THUMBS.mkdir(exist_ok=True)
    dest = THUMBS / (hashlib.md5(url.encode()).hexdigest()[:12] + ".jpg")
    if not dest.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        for _ in range(3):
            try:
                dest.write_bytes(urllib.request.urlopen(req, timeout=30).read())
                break
            except Exception:
                time.sleep(4)
        time.sleep(0.4)
    return f"alt-thumbs/{dest.name}"


def candidates(source, limit=40):
    # source is "Category:..." or "search:<words>" for a Commons file search
    if source.startswith("search:"):
        gen = dict(generator="search", gsrsearch=source[7:] + " filetype:bitmap",
                   gsrnamespace="6", gsrlimit=str(limit))
    else:
        gen = dict(generator="categorymembers", gcmtitle=source, gcmtype="file", gcmlimit=str(limit))
    data = api("commons.wikimedia.org", action="query", **gen,
               prop="imageinfo", iiprop="url|extmetadata|mime", iiurlwidth="320")
    for page in data.get("query", {}).get("pages", []):
        ii = page["imageinfo"][0]
        if ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        lic = strip_html(ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value"))
        if FREE.match(lic):
            yield page["title"], ii["thumburl"], lic


def main(pairs):
    sections = []
    for gid, cat in zip(pairs[::2], pairs[1::2]):
        cards = "".join(
            f'<figure><img src="{local_thumb(t)}" loading="lazy"><figcaption>{html.escape(f)}<br><small>{html.escape(l)}</small></figcaption></figure>'
            for f, t, l in candidates(cat))
        sections.append(f"<h2>{html.escape(gid)}</h2><div class=grid>{cards or '<p>No free photos found.</p>'}</div>")
        print(gid, cat)
    OUT.write_text("""<meta charset="utf-8"><title>Photo Alternatives</title>
<style>body{font:13px system-ui;margin:16px;background:#1b1f1e;color:#e6eeea}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
figure{margin:0}img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px;background:#000}
figcaption{word-break:break-all;font-size:11px;color:#9fb5ad}</style>""" + "".join(sections))


if __name__ == "__main__":
    main(sys.argv[1:])
