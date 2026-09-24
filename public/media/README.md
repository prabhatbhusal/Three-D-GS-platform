# Marketing footage

Read by `src/lib/media.ts`. A slot shows on the site only if its file is here;
an empty slot leaves that section in its plain design.

Most slots are stills from our own published splat tour of a college computer
lab (the `computer-lab2` space: its four track thumbnails, taken from the
scene document). `hero.*` is cut from the Chilancho Stupa capture
(`media-src/Chilancho Sample.mp4`, 2026-09-24) — the GeoNova logo baked into
that footage is blotted with a `drawbox` (see the recipe below).

| Slot | Page | Now | Format |
|---|---|---|---|
| `hero.jpg` + `hero.mp4` | Home, full-screen behind the name | Chilancho clip | ≥ 1600 wide; a clip: H.264, no audio, ≤ 4 MB, the jpg is its poster |
| `sequence/001.webp` … | Home, pinned scroll scene | Empty: the scene flies through `tour/` in CSS 3D instead | 1200 wide WebP, ~90 KB each |
| `tour/1…4.jpg` | Home, the fly-through (one per caption) and the "four ways in" tabs (Viewpoints, Walk, Orbit, Fly) | Lab stills | ≥ 1600 wide, shown 2:1 |
| `bleed.jpg` (+ optional `.mp4`) | Home, full-width band behind "We sell you enquiries" | Lab still | as hero |
| `work/<slug>.jpg\|mp4` | Work, one per project | Empty. Slugs: `gwarko`, `madan-ashrit`, `nepathya`, `basera` | 21:9 crop shown; 1280–1600 wide |
| `services/<k>.jpg\|mp4` | Services, sticky panel | Empty. Keys: `tour`, `cloud`, `plan`, `heritage`, `infra`, `embed` | 16:10, 1600 wide |
| `how/1…4.jpg\|mp4` | How it works, sticky panel | Empty | 16:10, 1600 wide, clips ≤ 2 MB |
| `about.jpg\|mp4` | About, behind the mission | Empty | as hero |

`services/` and `how/` switch their page to the sticky-panel layout as soon as
one of their slots has a file.

Cut a clip or a still from a master (Git Bash, from the repo root; masters
live in `media-src/`, gitignored, never in `public/`):

```sh
SRC="media-src/<master>.mp4"
BOX="drawbox=x=iw*0.8:y=0:w=iw*0.2:h=ih*0.16:color=black@1:t=fill"  # blots a logo baked into the top-right corner; drop if the master has none
# a clip: 0.4 s fades so it loops softly
ffmpeg -ss 0 -to 10.3 -i "$SRC" -vf "scale=1600:-2,$BOX,fade=t=in:st=0:d=0.4,fade=t=out:st=9.9:d=0.4" \
  -c:v libx264 -preset slow -crf 34 -pix_fmt yuv420p -movflags +faststart -an public/media/hero.mp4
# its poster
ffmpeg -ss 0.5 -i "$SRC" -frames:v 1 -vf "scale=1600:-2,$BOX" -q:v 4 public/media/hero.jpg
# a scroll sequence
ffmpeg -i "$SRC" -vf "fps=6,scale=1200:-2,$BOX" -c:v libwebp -quality 58 public/media/sequence/%03d.webp
```

Point-cloud footage (like Chilancho) is dense linework and compresses badly:
keep those clips at CRF 33–34, not the usual ~28.

**Never leave a master in `public/`** — it ships to every visitor. Cut what
you need into `public/media/`, keep the source only in `media-src/`
(gitignored).

Pages are prerendered: after replacing files, rebuild (`npm run build`); the
dev server picks them up on reload.
