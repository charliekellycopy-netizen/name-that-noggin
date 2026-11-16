# Name That Noggin

A quiz: you're shown only the dome of a famous bald head and pick its owner from four names.
The picture slowly zooms out to the full face, and the sooner you name him the more he's worth
(Dome 100, Brow 70, Eyes 40, Face 20).

- **The Daily Noggin**: the same ten heads for everyone each day, one sitting, with a streak and a shareable grid.
- **The Practice Room**: unlimited rounds, not recorded.

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
- `src/scripts/game.js`: the daily and practice rounds, the zoom-out, scoring, results
- `src/scripts/placeholder.js`: a drawn head shown if a photo fails to load
- `src/data/celebs.js`: the roster
- `src/data/photos.json`: the photo for each person, with Commons licence and author
- `src/data/zoom.json`: per photo, its dome and full framings inside `zoom.jpg`, and when the brows, eyes and nose appear
- `public/img/<id>/<n>/zoom.jpg` and `crop.jpg`: the zoom-out picture and the dome thumbnail

## Photos

All photos come from Wikimedia Commons under free licences, credited on every reveal.
The scripts in `tools/` find, download and crop them (cropping uses Apple Vision, so macOS only):

1. `python3 tools/find_photos.py` for each person's lead photo, written to `src/data/photos.json`
2. `python3 tools/find_variants.py`, `swift tools/screen_heads.swift` and `python3 tools/pick_variants.py` for extra photos
3. `python3 tools/download_photos.py`, then `swift tools/crop_heads.swift photos-source public/img tools/adjust.json`
4. `python3 tools/zoom_data.py` to copy the zoom framings into `src/data/zoom.json`

Per-photo crop fixes go in `tools/adjust.json`.
