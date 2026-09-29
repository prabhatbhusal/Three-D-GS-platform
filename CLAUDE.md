# RCAAS.tech: working brief

Gaussian-splat virtual tours for hotels, campuses and heritage sites, sold to
turn visitors into enquiries. Next 16 site + studio, Express API in `server/`,
XGRIDS LCC SDK for splats. This file is the single current brief. The long
revision-C brief (tier budgets, schema tables, visual direction) is in git:
`git show a572b15^:CLAUDE.md`. Read it only when a task needs that detail.

**Keep this file current.** Any change that adds, fixes or breaks a feature
updates §4 in the same change. New work lands in "Working", "Needs fixing" or
"Next up", never nowhere.

## 1. Commands

| What | Command |
|---|---|
| Dev: site + API, picks free ports | `npm run dev` |
| All tests: client + API (API runs twice, disk and fake S3) | `npm test` |
| Types | `npx tsc --noEmit` |
| Lint (0 errors expected; ~15 old warnings) | `npm run lint` (`eslint .`; `next lint` no longer exists in Next 16) |
| Production build | `npm run build` (pins `--webpack`, see `next.config.mts`) |
| One client test file | `node --test test/client.test.mjs` (Node 24 runs `.ts` imports directly) |

CI (`.github/workflows/ci.yml`) runs lint, types, tests and build on every
push and PR, then deploys `main` to the VPS. See `deploy/README.md`.

## 2. Map

- `src/components/App.tsx`: the Canvas. `Stage` wires scene manager, walker, camera director, gizmo, collision boxes, and the `EditorApi`.
- `src/components/EditorShell.tsx` (~1.9k lines): the whole studio UI (tree, inspectors, publish, save). **Grep it and Read by offset; don't read it whole.**
- `src/components/Viewer.tsx`: the visitor tour UI.
- `src/lib/useSceneManager.ts`: loads one space at a time (LCC SDK, or `meshModel.ts` for .glb, or `panoModel.ts` for 360 video). Wraps each renderer with `withColliders`.
- `src/lib/useLccWalker.ts`: Walk/Fly/Orbit camera plus capsule collision via `renderer.intersectsCapsule`.
- `src/lib/collision.ts`: floor probes, orbit line of sight, collision-box math (`capsuleBoxPush`, `withColliders`).
- `src/lib/sceneDoc.ts`: in-memory scene doc (hotspots, colliders, booking), load/save/dirty tracking. `history.ts` handles undo/redo over it.
- `server/src/store.js` holds scenes and publish snapshots (`<id>@<n>.json`); `migrate.js` migrates on read; `routes/*` are the API; `storage.js`/`storage-s3.js` are the asset drivers.
- `deploy/`: VPS scripts (`deploy.sh`, pm2 `ecosystem.config.cjs`, `nginx.conf`, `README.md`).

Terms: **Property/project** = one client. **Space** = one captured room/scene doc. **Viewpoint** = a stop. **Track** = an authored flythrough (lives in `viewpoints.ts`, confusingly). **Asset** = uploaded files addressed by `assetId`, never by path.

## 3. Rules that override feature requests

1. The scene JSON is renderer-agnostic. No SDK concepts in the schema. Assets are referenced by id, never by path or URL.
2. A new scene-doc field must tolerate its absence (old docs): default it on load (`sceneDoc.ts`) or in `migrate.js` `fillLateDefaults`. Sanitize numbers that reach the camera.
3. Publishing snapshots a version, and visitors read only snapshots. Studio edits never change a live tour.
4. The enquiry path works even when WebGL/splat fails (`App.tsx` no-WebGL2 branch).
5. Audio never autoplays without a gesture.
6. Three.js is pinned to r164 (the SDK's version). The SDK renderer is a page singleton, so there is no React StrictMode, and after editing `useSceneManager`/loader options you must hard-reload.
7. Never guess an SDK capability. `src/vendor/README.md` is the only doc. `renderer.root` is undocumented but deliberately used (transform + collision move together).
8. Never decimate a scan to hit a size: LCC streams by LOD. Budget first-frame bytes and resident memory instead.
9. Production data lives in `DATA_DIR` outside the checkout. The studio writes scene JSON, and `server/src/data/scenes` in git is only seed content.
10. Masters (raw video, FBX sources) go in `media-src/` (gitignored), never in `public/`. Everything in `public/` ships to every visitor.
11. Ask before adding a dependency.

## 4. Feature status (update with every change)

### Working
- **Tour:** LCC splat streaming with auto quality tier (guess, then FPS-measured downgrade); Viewpoints / Walk / Fly / Orbit; touch controls; camera tracks with narration + captions; floor map with "you are here"; day/night switch; multi-building/floor layers rail; EN / नेपाली / 中文.
- **Hotspots:** text, image, video, audio, link, portal, table; reveal near/always; copy to other spaces.
  - **Placement (2026-09-29):** H, the tree's ＋ and "Set to current view" put a hotspot on the surface under the studio's centre dot (`sceneDoc.ts spotInView` → `collision.ts surfaceDistance`), not 2 units ahead in mid-air, where it slid about as the camera moved. With nothing in view, it falls back to 2 units ahead.
- **Opening (2026-09-29, replaced the curtain):** the room streams in behind the start screen, seen from a step back (`App.tsx standBack`, stopped by the first wall behind). It sits behind frosted glass with a light sweep on mouse devices; phones get a plain veil, since blur costs them frames. On Start the glass dissolves while the camera glides to the start view (`arrive`, 2.6 s, interruptible). Every later space gets the same focus pull and glide (`.vw-arrive`); day/night keeps its view and only dissolves. A 360 video or reduced motion gets no glide. Full page loads (home → `/tour`) use the browser's cross-document view transition.
- **Camera tracks (viewpoints):** each waypoint has **Go** (camera there) and **Set here** (move just that one to the camera). The last waypoint is where visitors arrive, and its thumbnail follows it. "Set to current" still replaces the whole path.
- **Embeds on a client's own site:** tapping Start inside an iframe takes the tour full screen (`Viewer.tsx enter`). Esc or the full-screen button returns to their page. iPhone Safari has no element full screen, so there the tour plays in place.
- **Collision boxes (2026-09-29):** invisible walls/floors for holes in a scan. Studio: add from the tree (＋), drag the arrows, size/turn steppers, colour picker (studio only). Tour: invisible but solid. Saved in the scene doc as `colliders[]`, covered by undo/redo, and published with the space.
- **Other space types:** 3D models (FBX/OBJ/PLY/glTF → meshopt .glb in the browser, BVH collision); 360 camera video.
- **Studio:** upload (chunked, resumable), model placement gizmo, start view, save/dirty tracking, undo/redo, publish/unpublish/revert, version history, activity log, projects with owner/member/staff roles, team invites, admin reset link.
- **Conversion:** enquiry panel, Book now card (dates passed to the hotel's link), table booking on the floor plan, room booking with per-night availability, waitlist, reservations inbox, email (Resend) + SMS (Sparrow) + WhatsApp (Cloud API) notices, leads CSV.
- **Chat on WhatsApp (2026-09-29):** set the number in the project's brand info (normalised to `977…`). A button appears above every enquiry form (tour, project page, website) with a first line pre-typed, and the website's contact list gets a WhatsApp link. Clicks count in the report funnel.
- **Link previews (2026-09-29):** `/tour?space=`, `/t/<project>`, `/t/<project>/<space>` and `/s/<project>` set Open Graph/Twitter tags (`src/lib/shareMeta.ts`). The picture is the space's first view thumbnail, served as a real JPEG by `GET /api/gallery/:id/thumb.jpg`. The gallery list links to it instead of inlining base64.
- **Venue kinds:** a new project picks Hotel, Restaurant/café, Banquet venue, College, Heritage or Other (`siteTemplates.ts`). Hotel = room booking + table booking + menu. Restaurant/café = the same table booking + menu. Banquet = an event-worded enquiry only.
- **Client websites** `/s/<project>`: draft/preview/publish/scheduled publish, client review link with comments and approval.
  - **Looks (2026-09-29):** `site.style` is heritage (default), modern or night (`website.css [data-style]`), plus the brand's accent and font. The look no longer follows the visitor's OS dark mode.
  - **Page:** optional full-width hero photo (`site.hero.image`), section heads with ornaments, gallery with a lightbox (`SiteGallery`), Google map beside the contact section when there's an address, a footer, and a floating WhatsApp button stacked above the enquiry pill. Phones get a scrollable nav row.
  - **Photos:** originals up to 25 MB (PNG/JPEG/WebP), stored untouched. The server reads each photo's size, EXIF turn included (`imageSize` in `routes/assets.js`), into its name (`img-<ts>-<w>x<h>.jpg`), and the page serves resized WebP through next/image (`next.config.mts images`). Photos uploaded before this have no size in their name and get a 3:2 placeholder until they load.
- **Embeds:** per-space key, optional allowed-sites list, enforced in `/tour`.
- **Reports:** monthly visitor report (visits, time per space, average visit, enquiry rate, the funnel from visit to confirmed booking, and hotspot opens with enquiries after each) and auto floor plans from the collision mesh, printable. Staff accounts can see it.
- **Tour start:** `/tour` reads only the opened project's published docs, not every client's.
- **AI concierge** (needs `ANTHROPIC_API_KEY`): answers from published info only.
- **Storage:** local disk or S3/R2 (`ASSET_DRIVER=s3`), `npm run assets:push` to migrate. Scan files are served with a 1-year immutable cache.

### Needs fixing
- **GitHub Pages must be switched off** (Settings → Pages → Source: None). It publishes the repo as a static page, never the app. Static export can't build (`/studio/[property]` routes). The `isStaticExport` branches in `gallery`, `s/[property]` and `t/[property]` pages are dead leftovers.
- **Repo weight:** `.git` is ~760 MB (a 100 MB mp4 and an FBX were committed, now moved to `media-src/`). They remain in history, so shrinking it needs a history rewrite (`git filter-repo`), which is a team decision.
- **The API proxies every scan byte** from R2 through the VPS. Fine to start. Put Cloudflare in front with a cache rule for `/api/assets/*` before traffic grows.
- **Collision boxes:** no click-to-select in the 3D view (select from the tree), yaw-only rotation (no ramps), a box doesn't follow the model if the model is moved later (same as hotspots).
- Studio tab converts FBX/OBJ on the main thread, so a huge model freezes the tab during upload.
- Unreferenced uploaded files (removed audio, deleted spaces' old assets) are never garbage-collected.
- No self-service password reset by email. Only the admin one-time link exists.
- **No events module:** hotels and banquet venues can't list halls (capacity, layouts) or take event-date requests into the inbox. Only an enquiry exists.
- **One dining outlet per site:** a hotel's restaurant and café share one table plan, one set of hours and one menu. Workaround: label tables by `area` ("Café") and tag menu items.
- Scene docs still inline every track thumbnail as base64 (~70 KB each), so a space with 10 views ships ~700 KB of JSON before its first frame. Serve them like the gallery picture.
- A website's link preview falls back to the tour's picture URL even when that space has no thumbnail (a 404 image, so no picture shows).
- Lint warnings: `react-hooks/exhaustive-deps` in `App.tsx`, `<img>` vs `next/image`, and a few unused vars.

### Next up (candidates for the production build, in order)
0. **Product direction (recommended 2026-09-29, awaiting decision):** embed-first.
   - A client with their own website and booking engine gets the tour embedded on their site, with Book now linking to their engine.
   - The `/s/` website, with its room and table booking, is an add-on only for clients without a site. Don't grow it.
   - Never publish both for one client: two sites and two booking channels mean duplicate content and double-booked rooms.
1. Launch on the VPS (`deploy/README.md`), with daily backup of `DATA_DIR` and an uptime monitor.
2. Events module, shared by the Hotel and Banquet kinds: halls (name, seated/standing capacity, area, photo, 3D space) plus an event request (date, guests, event type, hall) into the reservations inbox, confirm/decline, and counted in the report. Awaiting the go-ahead.
3. Measure first frame on a low-end Android over 4G (target < 5 s) and fix what the numbers show, starting with the inline track thumbnails.
4. Separate dining outlets (own hours, plan, menu), only when a client's café and restaurant keep different hours.

### Not now (don't start without a decision)
VR/headset mode, measurement tool, furniture/layout variants, side-by-side compare, CRM sync, live booking-engine availability, self-serve capture from phone video, a database migration (JSON files are fine at this scale).

## 5. Working efficiently here (for Claude)

- Start with this file, then `git status` and `git log -5`. Trust the code over this file, and fix this file when they disagree.
- Search before reading: most files are under 500 lines, but `EditorShell.tsx`, `floorplan.js` and `Viewer.tsx` aren't, so read those by offset.
- Reuse the store pattern: module-level object + `emit()` + `subscribeX()` (see `sceneDoc.ts`, `transform.ts`). React-three objects are built imperatively in `useEffect` (see `Gizmo.tsx`, `ColliderBoxes.tsx`), not with R3F JSX.
- A new studio edit type needs: a store in `sceneDoc.ts` (load in `loadSceneDoc`, write in `sceneDocFor`), a history snapshot entry, and UI in `EditorShell`.
- Verify with `npx tsc --noEmit && npm test && npm run lint`. Add one assert-style test to `test/client.test.mjs` for new pure logic.
- **Look at pages, don't guess:** `node scripts/shot.mjs <url> <out.png> [w] [h] [mobile]` takes a full-page screenshot through headless Chrome, and the Read tool shows it. To try a design on real client data without touching it:
  - copy `server/src/data/{scenes,properties,sites}` and the `site_*`/`brand_*` assets into the scratchpad;
  - run a second API there (`PORT=4200 DATA_DIR=… ASSET_DIR=…`);
  - run a second Next with `NEXT_DIST_DIR=.next-preview NEXT_PUBLIC_API_URL=http://localhost:4200 npx next dev --webpack -p 3200`;
  - afterwards restore `tsconfig.json` (Next adds `.next-preview` entries) and delete `.next-preview`.
- The 3D can't be judged headless. Headless Chrome renders splats in software at ~1.6 fps, so the tier monitor downgrades and reloads mid-test, and flights crawl because the director clamps each frame's step. Check the start screen and the logic (camera positions through `window.__camera` in dev) there, and motion on a real GPU.
- next/image refuses localhost sources outside development (Next 16's SSRF guard). Production must point `NEXT_PUBLIC_API_URL` at the public domain.
- Machine quirks: Windows + Git Bash. Prefix env vars that hold paths with `MSYS_NO_PATHCONV=1`, or `/foo` becomes `C:/Program Files/Git/foo`. There is no Python, so use Node or sed for scripted edits.
- Next adds `<distDir>/types` to `tsconfig.json` on build. Those entries for `.next` and `.next-new` are committed on purpose, because the VPS checkout must stay clean for `git pull --ff-only`.
- End every task with what was **not** done or verified (e.g. "not tried in a browser").
- Never commit or push unless asked.
