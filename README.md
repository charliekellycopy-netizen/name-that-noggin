# Name That Noggin

A quiz: you're shown only the dome of a famous bald head and pick its owner from four names.
Each correct answer climbs you up the Great Dome, from the eyebrows through the Norwood stages
to the summit at 1,000m. Swift answers climb further.

Live at https://charliekellycopy-netizen.github.io/name-that-noggin/

## Running locally

Needs Node 22.12 or later.

```bash
npm install
npm run dev
```

Pushing to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## Where things are

- `src/pages/index.astro`: the page shell
- `src/scripts/game.js`: rounds, answers, results
- `src/scripts/ascent.js`: the climb: zones, landmarks, metres per answer, the camera
- `src/data/celebs.js`: the roster
- `src/data/photos.json`: the photo for each person, with Commons licence and author
- `public/img/<id>/<n>/crop.jpg` and `full.jpg`: the dome crop and the reveal

## Photos

All photos come from Wikimedia Commons under free licences, credited on every reveal.
The scripts in `tools/` find, download and crop them (cropping uses Apple Vision, so macOS only):

1. `python3 tools/find_photos.py` for each person's lead photo, written to `src/data/photos.json`
2. `python3 tools/find_variants.py`, `swift tools/screen_heads.swift` and `python3 tools/pick_variants.py` for extra photos
3. `python3 tools/download_photos.py`, then `swift tools/crop_heads.swift photos-source public/img`

Per-photo crop fixes go in `tools/adjust.json`.
