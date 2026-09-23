# Marketing footage

Read by `src/lib/media.ts`. A slot shows on the site only if its file is here;
an empty slot leaves that section in its plain design.

Everything here now is cut from GeoNova's Chilancho Stupa capture
(`media-src/Chilancho Sample.mp4`, the 4K master, kept out of `public/` and
out of git). Only Chilancho's own footage goes in `work/chilancho.*`: the other
projects stay without footage until they have their own.

| Slot | Page | Now | Format |
|---|---|---|---|
| `hero.mp4` + `hero.jpg` | Home, behind the name | Chilancho, whole clip | 1600 wide, H.264, no audio, ≤ 4 MB; the jpg is its poster |
| `sequence/001.webp` … | Home, pinned scroll | Chilancho at 6 fps (62 frames), scrubbed by scroll | 1200 wide WebP, ~90 KB each |
| `work/<slug>.jpg|mp4` | Work, one per project | `chilancho` only. Slugs: `gwarko`, `chilancho`, `madan-ashrit`, `nepathya`, `basera` | 21:9 crop shown; 1280–1600 wide |
| `services/<k>.jpg|mp4` | Services, sticky panel | Chilancho stills, splat or point cloud per service: `tour`, `cloud`, `plan`, `heritage`, `infra`, `embed` | 16:10, 1600 wide |
| `how/1…4.jpg|mp4` | How it works, sticky panel | 1 and 3 stills, 2 and 4 clips | 16:10, 1600 wide, clips ≤ 2 MB |
| `about.mp4` + `about.jpg` | About, behind the mission | Chilancho point cloud | as hero |

The home page's collage appears once three projects have `work/` footage.

Re-cut from the master (Git Bash, from the repo root):

```sh
SRC="media-src/Chilancho Sample.mp4"
# a clip: from 4.8 s to 10.3 s, 1280 wide, 0.4 s fades so it loops softly
ffmpeg -ss 4.8 -to 10.3 -i "$SRC" -vf "scale=1280:-2,fade=t=in:st=0:d=0.4,fade=t=out:st=5.1:d=0.4" \
  -c:v libx264 -preset slow -crf 33 -pix_fmt yuv420p -movflags +faststart -an public/media/work/chilancho.mp4
# its poster, and a still
ffmpeg -ss 5.3 -i "$SRC" -frames:v 1 -vf scale=1600:-2 -q:v 4 public/media/work/chilancho.jpg
# the scroll sequence
ffmpeg -i "$SRC" -vf "fps=6,scale=1200:-2" -c:v libwebp -quality 58 public/media/sequence/%03d.webp
```

Point-cloud footage is dense linework and compresses badly: keep clips at
CRF 33–34, not the usual 23–28 (the whole hero at CRF 27 was 23 MB).

Pages are prerendered: after replacing files, rebuild (`npm run build`); the
dev server picks them up on reload.
