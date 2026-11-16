"""Look up each roster member's Wikipedia lead photo on Wikimedia Commons.

Writes photos.json: one entry per person with the Commons file, licence,
author and a 1200px download URL. Only freely licensed files are kept;
anything else is flagged so a different photo can be chosen by hand.

Usage: python3 tools/find_photos.py
To use a specific Commons file for someone, add it to OVERRIDES.
"""
import html
import json
import re
import sys
import urllib.parse
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "photos.json"
UA = "NameThatNogginQuiz/0.1 (personal hobby project)"

# game id -> Wikipedia article title
ROSTER = {
    "jason-statham": "Jason Statham",
    "dwayne-johnson": "Dwayne Johnson",
    "vin-diesel": "Vin Diesel",
    "bruce-willis": "Bruce Willis",
    "samuel-l-jackson": "Samuel L. Jackson",
    "patrick-stewart": "Patrick Stewart",
    "stanley-tucci": "Stanley Tucci",
    "ben-kingsley": "Ben Kingsley",
    "woody-harrelson": "Woody Harrelson",
    "billy-zane": "Billy Zane",
    "terry-crews": "Terry Crews",
    "ving-rhames": "Ving Rhames",
    "telly-savalas": "Telly Savalas",
    "yul-brynner": "Yul Brynner",
    "michael-jordan": "Michael Jordan",
    "shaquille-oneal": "Shaquille O'Neal",
    "charles-barkley": "Charles Barkley",
    "zinedine-zidane": "Zinedine Zidane",
    "pierluigi-collina": "Pierluigi Collina",
    "arjen-robben": "Arjen Robben",
    "fabien-barthez": "Fabien Barthez",
    "andre-agassi": "Andre Agassi",
    "steve-austin": "Stone Cold Steve Austin",
    "mike-tyson": "Mike Tyson",
    "pitbull": "Pitbull (rapper)",
    "moby": "Moby",
    "michael-stipe": "Michael Stipe",
    "jeff-bezos": "Jeff Bezos",
    "dana-white": "Dana White",
    "mahatma-gandhi": "Mahatma Gandhi",
    "larry-david": "Larry David",
    "danny-devito": "Danny DeVito",
    "jason-alexander": "Jason Alexander",
}

# game id -> Commons file name ("File:...") to use instead of the article's lead image
OVERRIDES = {
    # lead images had hats on
    "billy-zane": "File:Billy Zane Cannes 2010.jpg",
    "michael-jordan": "File:Steve Lipfosky -- Michael Jordan (1997).jpg",
    "pitbull": "File:Pitbull 6, 2012.jpg",
    "samuel-l-jackson": "File:SamuelLJackson.jpg",
    "ving-rhames": "File:ヴィングラムズと松下順一氏.jpg",
}

FREE = re.compile(r"^(cc[- ]by|cc0|public domain|pd|attribution|gfdl|fal)", re.I)


def api(host, **params):
    params.update(format="json", formatversion="2")
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 30 * (attempt + 1)
            print(f"   API busy (429), waiting {wait}s", flush=True)
            time.sleep(wait)


def strip_html(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def lead_images():
    titles = list(ROSTER.values())
    found = {}
    for i in range(0, len(titles), 20):
        data = api("en.wikipedia.org", action="query", prop="pageimages",
                   piprop="name", redirects="1", titles="|".join(titles[i:i + 20]))
        q = data["query"]
        redirect = {r["to"]: r["from"] for r in q.get("redirects", [])}
        normal = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q["pages"]:
            t = page["title"]
            t = redirect.get(t, t)
            t = normal.get(t, t)
            if "pageimage" in page:
                found[t] = "File:" + page["pageimage"]
    return found


def file_info(files):
    info = {}
    for i in range(0, len(files), 20):
        data = api("commons.wikimedia.org", action="query", prop="imageinfo",
                   iiprop="url|extmetadata|size", iiurlwidth="1200",
                   titles="|".join(files[i:i + 20]))
        for page in data["query"]["pages"]:
            if page.get("missing"):
                continue
            ii = page["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            info[page["title"]] = {
                "file": page["title"],
                "page": ii["descriptionurl"],
                "download": ii.get("thumburl") or ii["url"],
                "width": ii["width"],
                "height": ii["height"],
                "license": strip_html(meta.get("LicenseShortName", {}).get("value")),
                "author": strip_html(meta.get("Artist", {}).get("value")),
            }
    return info


def main():
    leads = lead_images()
    files = {}
    for gid, title in ROSTER.items():
        f = OVERRIDES.get(gid) or leads.get(title)
        if f:
            files[gid] = f.replace("_", " ")
    info = file_info(sorted(set(files.values())))

    # photos.json holds a list per person: the lead photo first, then extra
    # variants added by pick_variants.py, which are kept across re-runs.
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    out, problems = {}, []
    for gid in ROSTER:
        f = files.get(gid)
        meta = info.get(f) if f else None
        if not meta:
            problems.append(f"{gid}: no Commons lead image ({f or 'none on Wikipedia'})")
            continue
        meta = dict(meta, free=bool(FREE.match(meta["license"])))
        if not meta["free"]:
            problems.append(f"{gid}: licence '{meta['license']}' is not free")
        prev = existing.get(gid, [])
        extras = [v for v in prev[1:] if v["file"] != meta["file"]] if isinstance(prev, list) else []
        out[gid] = [meta] + extras

    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(out)}/{len(ROSTER)} found, written to {OUT.relative_to(ROOT)}")
    for p in problems:
        print("  !", p)
    for gid, vs in out.items():
        print(f"  {gid:20} {vs[0]['license']:16} {vs[0]['file'][:52]}  (+{len(vs) - 1} variants)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
