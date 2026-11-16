"""Download the photos listed in photos.json into photos-source/<id>/<n>.jpg.

<n> is the photo's position in that person's list (0 = lead photo).
Re-downloads a photo when its Commons file changed (e.g. after an override).
Usage: python3 tools/download_photos.py
"""
import json
import time
import urllib.error
import urllib.request

from find_photos import OUT as PHOTOS_JSON, ROOT, UA

SRC = ROOT / "photos-source"
PAUSE = 2.0  # Commons asks bots to go gently


def fetch(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            return True
        except urllib.error.HTTPError as e:  # Commons rate-limits bursts with 429s
            wait = int(e.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
            print(f"   {e.code}, waiting {wait}s")
            time.sleep(wait)
    return False


def main():
    SRC.mkdir(exist_ok=True)
    seen_file = SRC / ".files.json"  # "<id>/<n>" -> Commons file last downloaded
    seen = json.loads(seen_file.read_text()) if seen_file.exists() else {}
    photos = json.loads(PHOTOS_JSON.read_text())
    for gid, variants in photos.items():
        (SRC / gid).mkdir(exist_ok=True)
        for n, m in enumerate(variants):
            key = f"{gid}/{n}"
            dest = SRC / f"{key}.jpg"
            if dest.exists() and seen.get(key) == m["file"]:
                continue
            if fetch(m["download"], dest):
                seen[key] = m["file"]
                seen_file.write_text(json.dumps(seen, indent=2, ensure_ascii=False))
                print("downloaded", key)
            time.sleep(PAUSE)


if __name__ == "__main__":
    main()
