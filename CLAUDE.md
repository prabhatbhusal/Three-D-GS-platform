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
push and PR. **Hosting is postponed (2026-09-29):** everything runs on this PC
for now. The VPS deploy job in CI stays skipped until the `DEPLOY_*` settings
exist, and `deploy/` is ready for when hosting is picked up again.

## 2. Map

- `src/components/App.tsx`: the Canvas. `Stage` wires scene manager, walker, camera director, gizmo, collision boxes, and the `EditorApi`.
- `src/components/EditorShell.tsx` (~1.9k lines): the whole studio UI (tree, inspectors, publish, save). **Grep it and Read by offset; don't read it whole.**
- `src/components/Viewer.tsx`: the visitor tour UI.
- `src/lib/useSceneManager.ts`: loads one space at a time (LCC SDK, or `meshModel.ts` for .glb, or `panoModel.ts` for 360 video). Wraps each renderer with `withColliders`.
- `src/lib/useLccWalker.ts`: Walk/Fly/Orbit camera plus capsule collision via `renderer.intersectsCapsule`.
- `src/lib/collision.ts`: floor probes, orbit line of sight, collision-box math (`capsuleBoxPush`, `withColliders`).
- `src/lib/sceneDoc.ts`: in-memory scene doc (hotspots, colliders, booking), load/save/dirty tracking. `history.ts` handles undo/redo over it.
- `server/src/db.js`: the Postgres pool, `tx()` and `migrate()` (`server/db/*.sql`). Used only when `DATABASE_URL` is set.
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
- **Hotspots:** text, image, video, audio, link, portal, table, room, hall; reveal near/always; copy to other spaces.
  - **Book from the 3D space (2026-09-30):** **table**, **room** and **hall** hotspots each have a Book now that works with nothing else set up. The studio types what visitors see on the hotspot itself (payload `capacity`, `standing`, `price`, `deposit`; tables show no price). The visitor fills in dates/day/time, guests and name/phone in `HotspotBookCard.tsx`, and it lands in Reservations as kind `request` (`of` room/hall/table, `POST /api/reservations/:id/requests`, published hotspots only). The team confirms or declines there, and the guest gets a text/email. It is counted in the report. **Tables in 3D:** a dining room has many tables, each its own table hotspot (numbered "Table N", 4 seats by default; the sidebar's "＋ Next table" places the next one where the dot is). They are booked by the sitting on the hours under Website → Table booking (09:00–21:30, 90 min, if unset; on or off). `GET /api/sites/:id/requests/tables?space=&date=` says which are free when (`tables`: the published ones it knows; a table only in the draft gets the hours with nothing taken, so the studio's card still has times). If the times can't load, the card falls back to a typed time. The card lists the room's tables, strikes out taken times, and offers the ones free at that time. The server refuses a second request for the same table and sitting (409), a time off the hours, and more guests than the table seats. With `bookUrl` set, Book now goes to the hotel's own booking page instead, with `{checkin}` `{checkout}` `{guests}` `{nights}` filled in. Optionally a hotspot can point at a website item (`outlet`+`tableId`, `roomId`, `hallId`), and then it uses that live booking with availability instead (`HotspotMarkers.tsx HotspotPanel`, studio `EditorShell.tsx BookablePicker`).
  - **Placement (2026-09-29):** H, the tree's ＋ and "Set to current view" put a hotspot on the surface under the studio's centre dot (`sceneDoc.ts spotInView` → `collision.ts surfaceDistance`), not 2 units ahead in mid-air, where it slid about as the camera moved. With nothing in view, it falls back to 2 units ahead.
- **Opening (2026-09-29, replaced the curtain):** the room streams in behind the start screen, seen from a step back (`App.tsx standBack`, stopped by the first wall behind). It sits behind frosted glass with a light sweep on mouse devices; phones get a plain veil, since blur costs them frames. On Start the glass dissolves while the camera glides to the start view (`arrive`, 2.6 s, interruptible). Every later space gets the same focus pull and glide (`.vw-arrive`); day/night keeps its view and only dissolves. A 360 video or reduced motion gets no glide. Full page loads (home → `/tour`) use the browser's cross-document view transition.
- **Camera tracks (viewpoints):** each waypoint has **Go** (camera there) and **Set here** (move just that one to the camera). The last waypoint is where visitors arrive, and its thumbnail follows it. "Set to current" still replaces the whole path.
- **Embeds on a client's own site:** tapping Start inside an iframe takes the tour full screen (`Viewer.tsx enter`). Esc or the full-screen button returns to their page. iPhone Safari has no element full screen, so there the tour plays in place.
- **Collision boxes (2026-09-29):** invisible walls/floors for holes in a scan. Studio: add from the tree (＋), drag the arrows, size/turn steppers, colour picker (studio only). Tour: invisible but solid. Saved in the scene doc as `colliders[]`, covered by undo/redo, and published with the space.
- **Other space types:** 3D models (FBX/OBJ/PLY/glTF → meshopt .glb in the browser, BVH collision); 360 camera video.
- **Studio:** upload (chunked, resumable), model placement gizmo, start view, save/dirty tracking, undo/redo, publish/unpublish/revert, version history, activity log, projects with owner/member/staff roles, team invites, admin reset link.
- **Conversion:** enquiry panel, Book now card (dates passed to the hotel's link), table booking on the floor plan, room booking with per-night availability, waitlist, reservations inbox, email (Resend) + SMS (Sparrow) + WhatsApp (Cloud API) notices, leads CSV.
  - **Events (2026-09-30):** halls (seated/standing, size, photo, 3D space, price and deposit in words) in `site.events`, with rules in `server/src/events.js`. A guest asks for a hall on a day for the daytime, the evening or the whole day; the whole day clashes with both halves. Requests go to the Reservations inbox (kind `event`) for confirm/decline, with a text and email to the guest, and are counted in the report. It shows on the website (`#events`, `EventBooking.tsx`) and in the tour ("Plan an event", or "Book this hall" in a hall's space). A new Hotel or Banquet-venue project starts with a hall to fill in, switched off.
  - **More dining places (2026-09-30):** `site.dining[]` holds a café, a bar and so on, each with its own name, menu, floor plan, tables and hours. The main place is still `site.menu`/`site.booking` (with an optional `booking.name`). Every table route takes `outlet`, a place's bookings carry `outlet`/`outletName`, and `atOutlet` keeps each place's tables apart, so two places can both have a "T1". The website shows each place's menu and booking (`#menu-<id>`, `#reserve-<id>`); the tour's table card gets a Place dropdown when more than one place takes bookings.
  - **Deposits:** room types and halls can state a deposit in words ("Rs 2,000 when we confirm"). No payment is taken online.
- **Chat on WhatsApp (2026-09-29):** set the number in the project's brand info (normalised to `977…`). A button appears above every enquiry form (tour, project page, website) with a first line pre-typed, and the website's contact list gets a WhatsApp link. Clicks count in the report funnel.
- **Link previews (2026-09-29):** `/tour?space=`, `/t/<project>`, `/t/<project>/<space>` and `/s/<project>` set Open Graph/Twitter tags (`src/lib/shareMeta.ts`). The picture is the space's first view thumbnail, served as a real JPEG by `GET /api/gallery/:id/thumb.jpg`. The gallery list links to it instead of inlining base64.
- **Venue kinds:** a new project picks Hotel, Restaurant/café, Banquet venue, College, Heritage or Other (`siteTemplates.ts`). Hotel = room booking + table booking + menu + a banquet hall (events). Restaurant/café = the same table booking + menu. Banquet venue = event booking with a hall + an event-worded enquiry. Extra dining places are added under Website → More dining places.
- **Client websites** `/s/<project>`: draft/preview/publish/scheduled publish, client review link with comments and approval.
  - **Looks (2026-09-29):** `site.style` is heritage (default), modern or night (`website.css [data-style]`), plus the brand's accent and font. The look no longer follows the visitor's OS dark mode.
  - **Page:** optional full-width hero photo (`site.hero.image`), section heads with ornaments, gallery with a lightbox (`SiteGallery`), Google map beside the contact section when there's an address, a footer, and a floating WhatsApp button stacked above the enquiry pill. Phones get a scrollable nav row. A chapter whose 3D space is a room or a hall offers "Book this room" / "Book this hall".
  - **Selling sections (2026-09-30):** offers/packages (`site.offers`, each with "Ask about this offer", which opens the enquiry naming the offer), guest reviews (`site.reviews`: quotes plus an https "read more" link), and an FAQ (`site.faq`, native `<details>`). The page carries schema.org JSON-LD: the place (Hotel/Restaurant/EventVenue/LocalBusiness, from what the draft holds, via `renderSite` `kind`) plus the FAQ as FAQPage. Reviews are left out on purpose, since Google ignores a business's own reviews. `renderSite` re-runs `cleanSite` on the published copy, so older sites get new fields' defaults.
  - **Photos:** originals up to 25 MB (PNG/JPEG/WebP), stored untouched. The server reads each photo's size, EXIF turn included (`imageSize` in `routes/assets.js`), into its name (`img-<ts>-<w>x<h>.jpg`), and the page serves resized WebP through next/image (`next.config.mts images`). Photos uploaded before this have no size in their name and get a 3:2 placeholder until they load.
- **Embeds:** per-space key, optional allowed-sites list, enforced in `/tour`.
- **Reports:** monthly visitor report (visits, time per space, average visit, enquiry rate, the funnel from visit to confirmed booking, and hotspot opens with enquiries after each) and auto floor plans from the collision mesh, printable. Staff accounts can see it.
- **Tour start:** `/tour` reads only the opened project's published docs, not every client's. Their view thumbnails come as links (`/api/scenes/:id/published/thumbs/<track>.jpg`), not inline base64: the Basera lobby is 1 KB before its first frame, down from 470 KB. Drafts, and so the studio, keep the data URLs, because the studio saves them back.
- **Quality downgrade mid-visit:** when the tier monitor reloads the same space at a lower quality, the visitor keeps their place, mode and flight (`useSceneManager` load, `App.tsx settledIn`). It used to teleport them back to the start view.
- **AI concierge** (needs `ANTHROPIC_API_KEY`): answers from published info only.
- **Accounts in Postgres (2026-10-04):** with `DATABASE_URL` in `server/.env` (Supabase, Singapore, session pooler), studio accounts live in `app.users` (`usersStore-pg.js`); without it, in JSON files (`usersStore-file.js`). `usersStore.js` picks one. Migrations are `server/db/*.sql`, applied on API start (`db.js migrate`, recorded in `app.schema_migrations`); the `app` schema isn't exposed by Supabase's Data API and has RLS on. `npm run db:import-users` copies file accounts in (ids and passwords kept). `/api/health` answers 503 when the database is down. Plain Postgres through `pg`: moving off Supabase is `pg_dump` + a new URL.
- **Forgot password (2026-10-04):** "Forgot password?" on `/login` (`AuthPanel.tsx ForgotPanel`) → `POST /api/auth/forgot` emails a one-time link (24 h, once) through Resend. Same answer whether or not the email has an account, and the mail goes after the reply. Without `RESEND_API_KEY` it says to ask an admin for a link.
- **Search, answer engines and AI (2026-10-04):** `NEXT_PUBLIC_SITE_URL` (`shareMeta.ts SITE_URL`) is the base for canonical links (every marketing page, `/s/<project>`, `/t/<project>`), `/sitemap.xml` (marketing pages + published websites from `GET /api/sites` + project tour pages, hourly), `/robots.txt` (everyone allowed, AI crawlers included) and `/llms.txt` (company, services, steps, FAQ, pages; built from `siteContent.ts`). Studio, sign-in, settings, profile and review links are `noindex` (`NOINDEX`). Every marketing page carries `ProfessionalService` + `WebSite` JSON-LD with the service catalogue (`JsonLd.tsx`, facts in `siteContent.ts COMPANY`); How it works shows the FAQ (`FAQ`) and marks it up as `FAQPage`. robots/sitemap are plain routes (`app/robots.txt/route.ts`), not `app/robots.ts`: Next's metadata-route loader breaks on the apostrophe in this checkout's path.
- **Cookies (2026-10-04):** `/cookies` lists the one cookie (`splatspace_session`, studio sign-in only) and what's kept in local storage. A client website's Google map loads only after "Show map" (`SiteParts.tsx SiteMap`), so visitors get no third-party cookies unasked and no banner is needed.
- **Fixed 2026-10-04 (bug sweep):** a table hotspot books only at its own dining place (`booking.ts bookableTable`; before, a place with booking off sent it to the main restaurant, and two places' "T1" could collide), and the studio's tour preview tags each place with its id (`livePlaces`). A hall hotspot refuses a clashing part of the day (409), its card strikes out what's taken (`GET /api/sites/:id/requests/halls`). Branded 404 (`app/not-found.tsx`, styled in `globals.css`: root not-found CSS imports don't load in dev). Lint no longer scans `.next-*` build folders; `{ ip, ...rest }` and `_arg` are allowed.
- **Policy pages (2026-10-04):** `/terms`, `/privacy`, `/security` (`PolicyPage.tsx`, `.lp-legal` in `landing.css`), linked from every marketing page's footer. Written to match what the code does (no cookies or IPs in stats, the concierge stores nothing, providers named). Drafts: they need a lawyer's review before launch.
- **Storage:** local disk or S3/R2 (`ASSET_DRIVER=s3`), `npm run assets:push` to migrate. Scan files are served with a 1-year immutable cache.

### Needs fixing
- **GitHub Pages must be switched off** (Settings → Pages → Source: None). It publishes the repo as a static page, never the app. The static-export code was removed on 2026-09-29.
- **Repo weight:** `.git` is ~760 MB (a 100 MB mp4 and an FBX were committed, now moved to `media-src/`). They remain in history, so shrinking it needs a history rewrite (`git filter-repo`), which is a team decision.
- **The API proxies every scan byte** from R2 through the VPS. Fine to start. Put Cloudflare in front with a cache rule for `/api/assets/*` before traffic grows.
- **Collision boxes:** no click-to-select in the 3D view (select from the tree), yaw-only rotation (no ramps), a box doesn't follow the model if the model is moved later (same as hotspots).
- Studio tab converts FBX/OBJ on the main thread, so a huge model freezes the tab during upload.
- Unreferenced uploaded files (removed audio, deleted spaces' old assets) are never garbage-collected.
- **Only accounts are in Postgres.** Projects, spaces, sites, bookings, leads, activity and stats are still JSON files in `DATA_DIR`. Move them one store at a time, behind the same exports. The API tests never use `server/.env`'s database (they set `DATABASE_URL` to `API_TEST_DATABASE_URL` or empty), and CI doesn't run them against Postgres yet.
- **Forgot password sends no real email yet:** `RESEND_API_KEY` (and a verified `LEADS_FROM` domain) aren't set on this PC.
- **Policy pages name Cloudflare storage and HTTPS,** which are only true once hosting is live (scans are on this PC's disk today).
- **Events:** no waitlist for a taken hall (rooms and tables have one), no calendar grid (a plain date field, with taken parts of the day struck out once a hall and day are picked), and no preview of real availability in the studio's website preview.
- **Room hotspot Book now checks no availability:** two guests can ask for the same room on the same night, and the team sorts it out when confirming. Undecided on purpose: a room hotspot may stand for one room or a room type with several. Halls and tables do check (2026-10-04), and reopening a declined request re-checks them. No waitlist for any of them.
- **Scan files aren't in git** (`server/src/data/assets/` is ignored). A new checkout or server has the scene JSON but no scans, and those tours show the start screen with no 3D. The studio's publish panel now warns (`routes/scenes.js missingFiles`). On 2026-10-04 eight were copied over from the older checkout; three exist nowhere on this PC and need uploading again: `computer-lab2`, `demo-project-map-plan`, `space-3d-model`. Long-term fix: `ASSET_DRIVER=s3` (R2), so every PC and server reads the same files.
- Lint: 6 warnings (5 deliberate `<img>`, and `App.tsx` onState deps, checked: camera is stable and every `mgr` value is listed).

### Next up (candidates for the production build, in order)
0. **Product direction (recommended 2026-09-29, awaiting decision):** embed-first.
   - A client with their own website and booking engine gets the tour embedded on their site, with Book now linking to their engine.
   - The `/s/` website, with its room and table booking, is an add-on only for clients without a site. Don't grow it.
   - Never publish both for one client: two sites and two booking channels mean duplicate content and double-booked rooms.
1. ~~Launch on the VPS~~ **postponed** by the owner (2026-09-29). When it's picked up: `deploy/README.md`, daily backup of `DATA_DIR`, and an uptime monitor.
2. ~~Events module~~ and ~~separate dining places~~: built 2026-09-30 (see Working).
3. Measure first frame on a low-end Android over 4G (target < 5 s) and fix what the numbers show.

### Not now (don't start without a decision)
VR/headset mode, measurement tool, furniture/layout variants, side-by-side compare, CRM sync, live booking-engine availability, self-serve capture from phone video, Supabase Auth/Storage/Edge Functions (they'd tie us to Supabase; we use it as plain Postgres).

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
