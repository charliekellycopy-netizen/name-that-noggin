"""Gather more photos of each roster member from their Wikimedia Commons category.

For each person: finds their Commons category (via Wikidata), lists freely
licensed JPEGs in it and its direct subcategories, keeps the ones most likely
to be a solo photo of them, and downloads a screening copy to
photos-candidates/<id>/<n>.jpg. Writes photos-candidates/candidates.json.

Next: swift tools/screen_heads.swift, then python3 tools/pick_variants.py.

Usage: python3 tools/find_variants.py [--deeper] [id ...]   (default: everyone)
--deeper searches further for people already gathered and adds new candidates.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

from find_photos import FREE, OUT as PHOTOS_JSON, ROOT, ROSTER, UA, api, strip_html

CAND = ROOT / "photos-candidates"
PER_PERSON = 6        # screening downloads per person
PAUSE = 2.0           # seconds between downloads; Commons asks bots to go gently
MAX_SUBCATS = 8
DEEPER_PER_PERSON = 14  # extra candidates per person on a --deeper pass
DEEPER_SUBCATS = 40
SKIP_WORDS = re.compile(r"\b(and|with|&|und|et|y|signature|autograph|poster|logo|statue|wax|mural|graffiti|stamp|cast|crowd|team|family)\b", re.I)


def commons_category(title):
    data = api("en.wikipedia.org", action="query", prop="pageprops", ppprop="wikibase_item",
               redirects="1", titles=title)
    qid = data["query"]["pages"][0].get("pageprops", {}).get("wikibase_item")
    if not qid:
        return None
    claims = api("www.wikidata.org", action="wbgetclaims", entity=qid, property="P373")
    vals = claims.get("claims", {}).get("P373", [])
    return "Category:" + vals[0]["mainsnak"]["datavalue"]["value"] if vals else None


def files_in(category):
    data = api("commons.wikimedia.org", action="query", generator="categorymembers",
               gcmtitle=category, gcmtype="file", gcmlimit="200",
               prop="imageinfo", iiprop="url|extmetadata|mime|size", iiurlwidth="330")  # small standard size: enough to screen, light on Commons
    for page in data.get("query", {}).get("pages", []):
        if not page.get("imageinfo"):
            continue  # broken or missing file
        yield from files_in_page(page)


def subcategories(category, limit=MAX_SUBCATS):
    data = api("commons.wikimedia.org", action="query", list="categorymembers",
               cmtitle=category, cmtype="subcat", cmlimit=str(limit))
    return [c["title"] for c in data.get("query", {}).get("categorymembers", [])]


def rank(c, surname):
    """Prefer files named after the person with no sign of other people."""
    name = c["file"]
    s = 0
    if surname.lower() in name.lower():
        s += 2
    if SKIP_WORDS.search(name.replace("File:", "")):
        s -= 3
    if "cropped" in name.lower():
        s += 1  # someone already cropped it to them
    return s


def fetch(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            return True
        except urllib.error.HTTPError as e:  # Commons rate-limits bursts with 429s
            wait = int(e.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
            print(f"   {e.code}, waiting {wait}s")
            time.sleep(wait)
        except Exception as e:
            print("   retrying:", e)
            time.sleep(10)
    return False


def files_matching(words):
    """Commons file search, for people whose category is thin or full of objects."""
    data = api("commons.wikimedia.org", action="query", generator="search",
               gsrsearch=f'"{words}" filetype:bitmap', gsrnamespace="6", gsrlimit="100",
               prop="imageinfo", iiprop="url|extmetadata|mime|size", iiurlwidth="330")
    for page in data.get("query", {}).get("pages", []):
        if not page.get("imageinfo"):
            continue
        yield from files_in_page(page)


def files_in_page(page):
    ii = page["imageinfo"][0]
    if ii.get("mime") != "image/jpeg" or min(ii["width"], ii["height"]) < 600:
        return
    meta = ii.get("extmetadata", {})
    lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
    if FREE.match(lic):
        yield {"file": page["title"], "page": ii["descriptionurl"], "screen": ii.get("thumburl") or ii["url"],
               "width": ii["width"], "height": ii["height"], "license": lic,
               "author": strip_html(meta.get("Artist", {}).get("value"))}


def main(ids, deeper=False):
    """deeper: for people already gathered, look further (more subcategories plus a
    file-name search) and add up to DEEPER_PER_PERSON new candidates after the old ones."""
    CAND.mkdir(exist_ok=True)
    out_path = CAND / "candidates.json"
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    have = json.loads(PHOTOS_JSON.read_text())

    for gid in ids:
        if gid in out and not deeper:
            continue  # already gathered; delete its entry in candidates.json to redo
        title = ROSTER[gid]
        cat = commons_category(title)
        if not cat:
            print(f"{gid}: no Commons category")
            continue
        prior = out.get(gid, [])
        used = {v["file"] for v in have.get(gid, [])} | {e["file"] for e in prior}
        pool = {}
        sources = [cat] + subcategories(cat, DEEPER_SUBCATS if deeper else MAX_SUBCATS)
        for c in sources:
            for f in files_in(c):
                if f["file"] not in used:
                    pool[f["file"]] = f
            time.sleep(1.0)
        if deeper:
            for f in files_matching(title.replace(" (rapper)", "")):
                if f["file"] not in used:
                    pool[f["file"]] = f
        surname = title.replace("(rapper)", "").split()[-1]
        chosen = sorted(pool.values(), key=lambda c: -rank(c, surname))
        chosen = [c for c in chosen if rank(c, surname) >= 0][:DEEPER_PER_PERSON if deeper else PER_PERSON]

        folder = CAND / gid
        folder.mkdir(exist_ok=True)
        start = 1 + max((int(e["local"].split("/")[1].removesuffix(".jpg")) for e in prior), default=-1)
        entries = list(prior)
        for n, c in enumerate(chosen, start):
            dest = folder / f"{n}.jpg"
            if fetch(c["screen"], dest):
                entries.append(dict(c, local=f"{gid}/{n}.jpg"))
            time.sleep(PAUSE)
        out[gid] = entries
        out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
        print(f"{gid}: {len(sources)} categories, {len(pool)} new free photos, "
              f"{len(entries) - len(prior)} downloaded for screening", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    deeper = "--deeper" in args
    ids = [a for a in args if a != "--deeper"]
    main(ids or list(ROSTER), deeper)
