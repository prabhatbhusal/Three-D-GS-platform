# threedview.services — brief, developer guide and working agreement

Revision C — 2026-09-13. Supersedes the earlier "Splatspace" brief.
Incorporates the Platform Design minutes of 8 September 2026 (GeoNova Solutions).

This one file is the project's brief, developer guide and working agreement.
Keep exactly one doc current. If something here becomes wrong, fix it here in
the same commit that makes it wrong.

---

## 0. How to read this file

### 0.1 Status markers

Every feature below carries one. Do not assume anything is built.

| Marker | Meaning |
|---|---|
| `[built]` | Exists in the repo today and works. |
| `[build]` | Agreed and to be built. Safe to start without further approval. |
| `[remove]` | Exists today and must be deleted. Deleting it is a task, not a side effect. |
| `[later]` | Agreed in direction, deliberately not now. Do not start. |
| `[ask]` | Not approved. Do not build. Listed in §19 so it is not lost. |

### 0.2 Terminology — one word per thing

The code and the old brief used three words for two concepts. Fixed here, and
fixed in the code as a task (§13).

| Term | Means | Not |
|---|---|---|
| **Property** | A client site section — one hotel, building or campus. Owns the hub page. | "project" |
| **Space** | One captured room, rendered from one scene document. | "room", "model" |
| **Viewpoint** | A discrete stop the visitor jumps between. Schema: `viewpoints[]`, camera mode `"viewpoint"`. | "waypoint", "viewport" |
| **Track** | One authored flythrough. | "viewpoint" (the legacy name in `src/lib/viewpoints.js`) |
| **Shot** | One keyframe in a track. Schema: `tracks[].keyframes[]`. | "waypoint" |
| **Cue** | A timed annotation reveal during a track. | — |
| **Asset** | An uploaded file set addressed by `assetId` — a splat export, a video, an image, an audio file. | a filesystem path |

The minutes say "viewports". In the UI and the schema the word is **viewpoint**.
Pick this one and never write the other.

**Exception, decided 2026-09-21:** in the **studio UI** a property is called a
**project** ("Projects", "New project"), because that is what the team calls
it. Code, API, schema and file names keep **property** (`propertyId`,
`/api/properties`, `data/properties/`) — renaming those would move data for
no gain. So: "project" on screen in the studio, "property" everywhere else.

### 0.3 What changed in revision B

1. **Product name is threedview.services.** A GeoNova / I.STEM Lab brand. The
   internal name "Splatspace" is retired — not in code, copy or filenames.
2. **Third-person / avatar mode is removed** `[remove]` — §6.1.
3. **Conversion is the core product objective.** In-experience lead capture and
   a persistent CTA are first-class features, not an add-on. Every design
   decision is tested against: does this turn a visitor into an enquiry?
4. **Two-level structure**: hub page (property) → detail page (space). This adds
   a **property document** above the scene document (§5.1).
5. **3DGS upload in the studio**, behind a storage driver seam. Local disk
   today, object storage + CDN when hosting is purchased (§9).
6. **Publish → embed link** is a product step, not a manual file copy.
7. **Three quality tiers** — high / medium / low, detected from the device and
   verified against measured frame time (§8).
8. **Audio**: ambient sound per space, music and narration per track (§6.3).
9. **Free roam is a supported visitor mode**, alongside viewpoints and
   flythrough. Viewpoints stay the default (§6.1).
10. **Annotations during flythrough** — `tracks[].cues`.
11. **Creator-side editing is a real surface**: transform gizmo, one-click
    viewpoint capture, visual flythrough timeline. No coordinate typing in the
    normal creator flow.
12. **`waypoints` → `viewpoints`** throughout, per §0.2, with a migration.
13. **Revision C: the 80 MB per-space cap is gone.** It degraded large-area
    scans, which is the opposite of what it was for. Budgets are now on bytes to
    first interactive frame, resident splats and sustained streaming — never on
    total scene size (§3.2, §8.2).

---

## 1. What we are building

A self-hosted platform for publishing 3D Gaussian Splatting captures as
interactive tours that sell space — hotel rooms, banquet halls, apartments,
showrooms, campuses, heritage sites.

GeoNova captures spaces with handheld SLAM LiDAR (Lixel Kitty K1) and processes
them in XGRIDS Lixel Studio. The platform is what turns that output into
something a client can put on their own website and get enquiries from.

Three surfaces:

- **Studio** — internal authoring tool. Upload a model, place it, author
  viewpoints, hotspots, audio and a flythrough, publish. Three to five internal
  users.
- **Tour** — the public experience. Hub page per property, detail page per
  space, lead capture inside the experience.
- **Embed** — the detail page, chromeless, in an iframe on the client's site.

The thing we sell to a hotel is not the 3D model. It is enquiries. The model is
how we get them.

---

## 2. The one decision that shapes everything

A scene is **splat asset + scene JSON**. The splat file is one asset the scene
references. Everything else — transform, viewpoints, hotspots, tracks, audio,
media, spawn, CTA, theme — lives in a renderer-agnostic JSON document.

Never let renderer-specific concepts leak into the scene or property schema. If
we swap the renderer, every tour our team has authored must still load. This
schema is the actual IP.

Corollary now that upload exists: an asset is addressed by an **asset id**,
never by a filesystem path or an absolute URL. Moving from disk to object
storage must change one driver, not one scene document.

---

## 3. Hard constraints — these override feature requests

1. **Time to first frame under 5 seconds on the low tier.** Reference device:
   Vivo V20 (Snapdragon 720G, 2020) over 4G. If a feature breaks this budget,
   the feature loses. Not the budget.
2. **There is no cap on total scene size or total splat count.** A large-area
   scan may be 300 MB or 2 GB on the server and that is fine. Capping the model
   to protect a phone is the wrong lever — it degrades exactly the captures that
   sell best (campuses, grounds, heritage sites, whole floors) to solve a problem
   streaming already solves. The LCC format streams tiled `.sog` over HTTP byte
   ranges against the `meta.lcc2` LOD index: the visitor downloads what the
   camera can see, not the model. **Never decimate a scan to hit a file size.**

   What *is* budgeted, per tier (§8):

   - **Bytes to first interactive frame** — low ≤ 12 MB, medium ≤ 20 MB,
     high ≤ 35 MB. This is what constraint 1 depends on.
   - **Resident budget** — the real wall on mobile is memory, not bandwidth. iOS
     Safari kills a tab that grows too large; Android Chrome drops the WebGL
     context. Both look to a visitor like the tour crashing. Hold no more than
     the tier's resident splat ceiling (§8) and evict tiles behind the camera.
   - **Sustained streaming** — a minute of ordinary exploration should stay near
     25 MB on low, 50 MB on medium, uncapped on high. These are starting targets;
     replace them with measured numbers from the reference device, don't defend
     them.

   Load one space at a time, prefetch its graph neighbours, evict the rest. Never
   hold a whole building resident. Audio has its own budget (§6.3) and is fetched
   after the first frame.
3. **The viewer must run without WebGPU.** WebGL2 is mandatory; WebGPU is an
   enhancement if detected.
4. **No build step in the embed.** Clients paste an iframe snippet. That's it.
5. **The CTA is never blocked by the 3D.** If the renderer fails, is still
   loading, or the device can't run it, the enquiry path still works. A visitor
   who never sees a splat must still be able to leave their details.
6. **A published tour never breaks when we edit.** Publishing snapshots a
   version; editing a draft does not change what a client's visitors see.
7. **Audio never autoplays without a gesture and never blocks the first frame.**

---

## 4. Stack — settled

**Next.js (App Router) + Node.js/Express. This is decided and not revisited.**
Do not propose Vite, Django, or a framework swap. If a task seems to need one,
the task is wrong.

- **Renderer:** XGRIDS LCC Web SDK (v0.6.1, vendored at `src/vendor/sdk/`) on
  Three.js **r164** + React Three Fiber v9.
  PlayCanvas was evaluated and rejected: Lixel Studio exports tiled `.sog` with
  a `meta.lcc2` LOD/streaming index, and that index does not detach from the
  SDK — a PlayCanvas port would lose LOD, collision and byte-range streaming,
  blowing the byte and TTFF budgets.
- **Frontend:** React + Next.js App Router, at `/`, in TypeScript (`.ts`/`.tsx`
  under `src/`, loosely typed — `any` only at the vendored-SDK/Three.js
  boundary, see `src/@types/vendor.d.ts`). `src/components/` is flat (no
  `editor/`/`viewer/`/`tour/` subfolders); shared types live in `src/@types/`.
  Path alias `@/*` → `./src/*` (tsconfig). The viewer/studio tree is pure
  client-side (`LCCRender` is a module singleton — see `reactStrictMode: false`
  in `next.config.ts`) and is loaded via `next/dynamic` with `ssr: false`.
  Nothing about the splat renderer benefits from SSR, and the 5 s budget can't
  afford a server render pass. The Node API in `/server` stays plain JavaScript
  — this migration is frontend-only.
  **Exception `[build]`:** the hub page, the lead form and all SEO-relevant text
  *are* server-rendered. They are ordinary HTML and must work with the canvas
  absent (constraint 5).
- **Backend:** Node.js + Express at `/server`. File-backed stores for now
  (`server/src/data/{properties,scenes,leads}/*.json`) behind
  `server/src/store.js` — swap in Postgres behind the same interface when a real
  database exists.
- **Asset storage:** driver seam at `server/src/storage.js` `[built]`. Local
  disk today, S3-compatible + CDN later (§9). The NAS is for masters and
  processing only — never serve clients from it.
- **Auth:** session cookie for the studio, signed short-lived tokens for embeds.
  Studio accounts are per person `[built]` (`server/src/usersStore.js`,
  scrypt from `node:crypto`, file-backed under `data/users/`, gitignored).
  **Creating an account needs the team access code** — today that is
  `EDITOR_PASSWORD`. The studio session can upload and overwrite scenes, so
  open public sign-up would hand that to anyone. Do not remove the code check
  without a replacement (invites, or an admin approving accounts).

Frontend runtime deps are exactly: `next`, `@react-three/fiber`, `react`,
`react-dom`, `three` (r164), plus the vendored SDK. `@react-three/drei` is
approved **for `TransformControls` only** (§7.2) — a genuine need, not a
convenience.

Backend runtime deps are exactly: `express`, `cors`, `cookie-parser`,
`jsonwebtoken`, `dotenv`, `yauzl`. `yauzl` is approved **for zip-upload
extraction only** (§7.1) — streaming, no native bindings, entries read one at
a time so a multi-GB export never sits in server memory (§7.1's own rule).

Deps the new work will need, **not approved — ask in the task that first needs
one**: email delivery for leads. Propose one, with its size and what it
replaces.

No state-management libraries, component libraries, CSS frameworks or ORMs.
Audio uses the Web Audio API directly — no audio library. The team maintaining
this has roughly one year of professional experience; favour the boring version.

---

## 5. Data model

### 5.1 Property document — partly `[built]`

**As built (2026-09-21):** `{ id, version: 1, title, createdAt }` only, one file
per property under `server/src/data/properties/<id>.json` (tracked, like
scenes — no PII). The studio groups spaces by it. Membership lives on the
scene's `propertyId`, **not** in a `spaces[]` list here, so there is one source
of truth. **Rename** changes `title` only — the id is what every space and URL
points at. **Delete** never deletes a space: its spaces go back to "Not in a
project yet" (`propertyId: null`) and published tours keep working, since a
tour doesn't read the property. Not built: `location`, `hero`, `spaces[]`
ordering/blurbs, `theme`, `cta`, `status`/publish — all of it arrives with
the hub page. On screen it is a **project** (§0.2).

```jsonc
{
  "id": "basera",
  "version": 1,
  "title": "Basera Boutique Hotel",
  "location": "Babar Mahal, Kathmandu",
  "hero": {
    "type": "video" | "image",
    "src": "asset://<assetId>",
    "poster": "asset://<assetId>",
    "headline": "Where Kathmandu slows down"
  },
  "spaces": [
    { "sceneId": "basera-lobby", "title": "Reception",
      "blurb": "Where guests arrive",
      "thumb": "asset://<assetId>", "order": 1 }
  ],
  "theme": { "accent": "#RRGGBB", "logoUrl": "...", "font": "..." },
  "cta": {
    "headline": "Ask about this space",
    "submitLabel": "Send enquiry",
    "fields": ["name", "phone", "email", "requirement", "dates", "message"],
    "required": ["name", "phone"],
    "delivery": { "email": ["..."], "webhook": null }
  },
  "status": "draft" | "published",
  "publishedAt": "2026-09-13T00:00:00Z"
}
```

The hub page carries ordinary video footage of the property with the list of
visitable spaces down the right-hand side. It sets the impression; the detail
page does the work.

### 5.2 Scene document — schema version 2

```jsonc
{
  "id": "basera-lobby",
  "version": 2,
  "propertyId": "basera",
  "title": "Reception",

  // One logical model, up to three exported variants (§8.2).
  // "high" is mandatory; medium/low fall back to it if absent.
  "splat": {
    "format": "lcc2",
    "variants": {
      "high":   { "assetId": "ast_7k2m", "meta": "meta.lcc2",
                  "splatCount": 2840000, "bytes": 78000000 },
      "medium": { "assetId": "ast_7k2n", "meta": "meta.lcc2",
                  "splatCount": 1400000, "bytes": 41000000 },
      "low":    { "assetId": "ast_7k2p", "meta": "meta.lcc2",
                  "splatCount": 600000,  "bytes": 19000000 }
    }
  },

  // Authored with the gizmo; applied to the splat root AND to collision.
  "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": 1 },
  "unitScale": 1,                    // world units per metre — measurement, not intent

  "spawn": { "position": [x,y,z], "yaw": 0, "eyeHeight": 1.65 },
  "camera": { "fov": 62, "near": 0.1, "far": 200, "mode": "viewpoint" },

  "viewpoints": [
    { "id": "vp1", "position": [x,y,z], "yaw": 0, "pitch": 0,
      "label": "Reception", "thumb": "asset://<assetId>",
      "links": ["vp2","vp3"] }
  ],

  "hotspots": [
    { "id": "hs1", "type": "image" | "video" | "text" | "link" | "portal" | "audio",
      "position": [x,y,z], "radius": 0.4, "label": "Deluxe suite",
      "payload": { /* type-specific, plus optional
                      "audio": "asset://<assetId>/<file>.m4a",
                      "transcript": "what the audio says" (§6.3) */ },
      "occludedBy": "geometry" | "none" }
  ],

  "tracks": [
    { "id": "intro", "label": "Entrance to bar", "loop": false,
      "autoplayOnLoad": true,
      "keyframes": [
        { "t": 0, "position": [x,y,z], "target": [x,y,z], "fov": 62,
          "hold": 0, "easing": "easeInOutCubic" }
      ],
      "cues": [ { "t": 4.5, "hotspotId": "hs1", "duration": 3.0 } ],
      "audio": {
        "music":     { "src": "asset://<id>", "gain": 0.5, "fadeIn": 1.0 },
        "narration": { "src": "asset://<id>", "gain": 1.0, "offset": 0.5,
                       "duckMusicTo": 0.15 }
      } }
  ],

  "audio": {
    "ambient": { "src": "asset://<id>", "gain": 0.3, "loop": true },
    "startMuted": true               // always true; see §6.3
  },

  "cta": null,                       // null = inherit property.cta
  "theme": null,                     // null = inherit property.theme
  "booking": null | { "enabled": true, "label": "Book now",
                      "url": "https://…?arrive={checkin}&depart={checkout}&adults={guests}",
                      "title": "Deluxe Suite", "subtitle": "…",
                      "price": "$120", "priceUnit": "/ night",
                      "priceNote": "Includes taxes & fees",
                      "askDates": true },   // §7.6; null = off; all past url optional
  "neighbours": ["basera-bar", "basera-banquet"],
  "status": "draft" | "published"
}
```

### 5.3 Migration rules

Every new schema field needs a migration path. v1 → v2:

| v1 | v2 |
|---|---|
| `splat: { meta: "<path>", format }` | mint an asset id for the local directory, write it as `splat.variants.high`, write back on next save |
| `waypoints[]` | rename to `viewpoints[]`, ids `wp*` kept as-is |
| `camera.mode: "waypoint"` | `"viewpoint"` |
| `camera.mode: "avatar"` | `"walk"`, logged once |
| `transform` absent | identity |
| `tracks[].cues` absent | `[]` |
| `tracks[].seconds` absent | 4 (docs saved before 2026-09-17 never stored it; their keyframe `t` was an index, not seconds) |
| `tracks[].thumb` absent | none |
| `transform.rotation` | degrees, YXZ order — every doc before the gizmo had `[0,0,0]`, so no conversion |
| `tracks[].audio`, `audio` absent | `null` |
| `cta`, `theme` absent | `null`, meaning inherit |
| `booking` absent (any v2 doc before 2026-09-21) | `null` (off). Filled by `fillLateDefaults()` on every read — late v2 fields don't bump the version |
| `booking.title/subtitle/price/priceUnit/priceNote/askDates` absent | none / `false`: the card shows the space's name and no dates or price |
| hotspot `type: "audio"` | new type; older readers that don't know it should treat it as `text` with its transcript |
| `hotspots[].payload.audio` / `.transcript` absent | none — no audio |
| `propertyId` absent | `null` — listed under "Not in a property yet" in the studio |

Migrations live in `server/src/migrate.js` `[build]` and run **on read**, not as
a one-off script. A scene authored last month must open today without anyone
remembering to run anything. Write the migrated doc back only on the next save.

---

## 6. Client-side experience (the tour)

### 6.1 Navigation modes

Five visitor modes since 2026-09-21 (Fly and Orbit added at the owner's
explicit, repeated request — see §20 #1). That is the whole list. The switch
is a **mode dial**, top centre, like a camera's mode ring: only the current
mode shows — its icon in an accent-ringed medallion, its name in the display
serif, one line on what it's for. ‹ › (or a swipe on a phone) step
Viewpoints → Walk → Orbit → Fly and wrap; the name slides in from the side
you went and the icon turns in; a track's accent thumb glides to the current
mode. Reduced motion turns the animation off (`ModeSlider` in `Viewer.tsx`,
`.vw-dial` in `viewer.css`).

- **Viewpoints (default).** Discrete authored stops, free look at each, smooth
  dolly between linked neighbours. Deliberate: splats captured from a walking
  path look broken from anywhere off that path, and unrestricted movement mostly
  shows visitors the smeared holes in our capture.
- **Walk / free roam `[built]`.** First-person, gravity + capsule collision,
  joystick on mobile. A supported mode, agreed in the minutes. It is **not** the
  default and must not become the default by accident — a space always opens in
  viewpoints or flythrough.
- **Flythrough `[built, extend]`.** A guided cinematic pass for visitors who
  don't want to navigate. Played **live, never rendered to video** — live
  playback is a fraction of the size, stays sharp at any resolution, and lets a
  visitor break out mid-flight to look around. MP4 export stays a separate
  marketing deliverable.

- **Fly `[built]`, revised 2026-09-22.** Free flight like an Unreal Engine
  viewport, taking off from where the visitor stands: **W A S D** along the
  view, **E** / Space up, **Q** / C down, Shift faster, drag with the left or
  right button to look (no pointer capture), scroll or − + for speed
  (`walkerCfg.flyBoost`, 1/8× … 8×). The keys work without holding the mouse.
  No gravity and no collision, as in an editor viewport. Reset view returns to
  where the flight began; Exit fly mode returns to exactly where the visitor
  was. Fly carries over when switching space from the layers rail (starting
  at that space's start view). The earlier aerial "dollhouse" circling view
  was replaced on request; its wall/ceiling line-of-sight clamp
  (`clearOrbitDistance()`) now serves Orbit only.

- **Orbit `[built]`.** Circle the middle of the room standing up (pitch held between slightly down and slightly up), with
  the same line-of-sight clamp, zoom, reset and exit. Switching Orbit ⇄ Fly
  re-frames without losing the pre-orbit pose.

**Removed `[built]`: third-person / avatar mode.** Done — `Avatar.jsx`,
the `avatar` branch in `src/lib/useLccWalker.ts`, `walkerCfg.avatar` and the
camera boom, the avatar option in the studio's movement-mode control, and the
viewer's first-person/avatar "Take a walk" toggle are all gone. The viewer's
mode control is Viewpoints | Walk | Orbit | Fly. The studio's own free-flight
and orbit tools are separate (`walkerCfg.mode`); visitor Fly is
`navMode.flyEnabled`, which drives the walker's orbit.

### 6.2 Flythrough with annotations `[build]`

While a track plays, its `cues` reveal hotspot annotations on time: a label card
appears near the projected hotspot, holds for `duration`, leaves. The camera
keeps moving. Any visitor input on the 3D view (a press on the canvas, a key,
the wheel) interrupts the track and hands control back — that already works
and must keep working. A tap on the tour's own buttons is not camera input
and does not interrupt (`useCameraDirector.ts`): otherwise Pause's own
press ended the tour and its click restarted it.

If the visitor has not interacted within the first second after the first frame,
and the scene has a track with `autoplayOnLoad`, play it. This is the highest
value default we have: it shows the space without asking the visitor to learn
controls.

On interruption: stop narration, fade music out over 400 ms, leave ambient
running. Narration continuing over free roam is worse than no narration.

### 6.3 Audio — hotspot audio `[built]`, ambient and track audio `[build]`

**As built (2026-09-21):** `src/lib/audio.ts` — one `AudioContext`, one gain
node (the only layer so far: hotspot clips) that is also the mute switch.
Created and resumed only inside a tap: the enter gate, the studio's Preview
button, Listen, the sound toggle, or the hotspot tap itself. Starts muted,
mute remembered in `localStorage['threedview.muted']`, suspended while the tab
is hidden. A hotspot's clip is fetched when it opens, so never before the
first frame; decoded clips are cached. Muted, opening a hotspot shows
**Listen** and the transcript open; with sound on it plays straight away.
Closing stops it. The sound toggle shows only in spaces that have audio.
Uploads: `POST /api/assets/:id/finalize?kind=audio` takes exactly one
`.m4a`, ≤ 2 MB, and checks the MP4 `ftyp` header, so a renamed MP3 is
refused. Publish warns when a hotspot has audio but no transcript. Not built:
ambient, track music/narration and ducking, and the **2 MB per-space total**
(only the per-file 2 MB is checked).

Two layers, both optional, both authored per space:

- **Ambient** — a looping room tone or background track for the whole space.
- **Track audio** — music and/or narration attached to a flythrough, with the
  music ducking under narration (`duckMusicTo`).

Rules, all of them non-negotiable:

- **Audio starts muted.** Browsers block autoplay with sound until a user
  gesture, and on iOS Safari the `AudioContext` itself starts suspended. The
  viewer's enter gate tap is our gesture — resume the context there, and only
  there. Never call `play()` on load and hope.
- A **sound toggle** is always visible while audio exists. Muting is remembered
  per visitor in `localStorage`. Assume a good share of visitors are on a hotel
  page at work and will never unmute; the tour must be complete without sound.
- **Audio is fetched after the first frame** and never blocks TTFF. Ambient can
  start late. Track audio is preloaded when the visitor starts the track, not on
  page load.
- **Budget: ≤ 2 MB per space total, outside the splat byte budget.** Encode AAC
  in `.m4a`, mono, 96 kbps. That format plays everywhere; Opus does not play in
  every Safari version we care about, and this is not the place to be clever.
- Use the Web Audio API directly — one `AudioContext`, a gain node per layer.
  No audio library.
- Narration is spoken content: it needs a text equivalent. Store the script in
  the cue label or hotspot text so a muted visitor gets the same information.
- Pause everything on `visibilitychange` when the tab is hidden.

Licensing: only music we have the right to use. Log the source and licence in
the property folder. A hotel's site playing an unlicensed track is our problem,
not theirs.

### 6.4 Conversion: CTA and lead capture `[build]`

This is the product. A visitor exploring the space is already high-intent; the
platform captures that intent while they are still inside the experience.

- A **persistent CTA** the whole time, not only at the end of the tour.
  Bottom-right on desktop, bottom bar on mobile. It never covers the space
  switcher, the sound toggle or the joystick.
- Tapping it opens an **enquiry panel over the scene** — the scene keeps
  rendering behind it, dimmed. No navigation away, no new tab, no third-party
  form.
- Fields come from `cta.fields`. Default: name, phone, requirement (meeting
  hall, deluxe room, event space), dates, message. Phone before email — in this
  market phone is the channel that gets answered.
- The **space is prefilled** from where the visitor is standing. Opened from the
  banquet hall, "Banquet hall" is already selected.
- On submit: store the lead, deliver it per `cta.delivery`, confirm in place.
  Never clear the scene, never redirect.
- Record which space and which hotspot preceded the enquiry. That number is what
  renews the contract.
- The form works with the 3D absent (constraint 5).

**As built (2026-09-21):** the CTA is a pill bottom-right (a full-width bar on
phones) opening a light card at the right (a bottom sheet on phones): name,
phone and email side by side, requirement, dates, message, one **Send
enquiry** button, confirmation in place. It shares one slot with the Book now
card — opening one closes the other — and both buttons stay clickable above
the cards' backdrop on desktop. Input `maxLength`s mirror the server's
`FIELD_LIMITS`. Still not built: fields from `cta.fields`, prefilling the
space, recording the preceding hotspot.

`POST /api/leads` is public and therefore hostile-facing: rate limit by IP,
honeypot field, submission-time check, size cap on every field, no HTML stored,
nothing echoed back into the page unescaped.

### 6.5 Hub and detail pages `[build]`

- `/t/<property>` — hub. Hero video, property name, space list down the right.
  Server-rendered, fast, indexable. No splat loads here.
- `/t/<property>/<space>` — detail. Full experience + CTA.
- `/embed/<property>/<space>` — chromeless, token-gated, for the iframe.

Prefetching one space's `meta.lcc2` on hover/tap of a hub list item is
encouraged — it buys back most of the 5 s budget. Prefetch one, not all, and
prefetch the variant the tier resolver chose (§8).

---

## 7. Creator side (the studio)

The studio is for our team, and everything must be doable with the mouse. A
creator should never type a coordinate to do normal work. Numeric fields stay,
behind a collapsed "Numbers" disclosure, for debugging.

### 7.1 Upload a model `[built]`

1. Studio → **New space** → drop the Lixel Studio export folder, or a single
   `.zip` of it. It must contain `meta.lcc2` and its tiled `.sog` set. A zip
   is extracted server-side on finalize (`yauzl`, approved §4) before the
   same validate-and-move path a dropped folder takes — one code path either
   way, and a corrupt or empty zip is rejected with staging cleaned up, not
   left half-extracted.
2. The server validates that `meta.lcc2` is present and non-empty, stores the
   set under a new asset id, and returns `{ assetId, bytes, fileCount }`.
   No `bbox`/`splatCount` in that response: `meta.lcc2` has no documented
   schema (`src/vendor/README.md` doesn't cover it), so the server can't
   honestly parse one out. The real bbox still comes from the SDK once the
   space is opened (`useSceneManager.ts`'s existing measurement).
3. A scene document is created referencing that asset as the **high** variant,
   and the studio's scene list picks it up (no reload needed).
4. Optionally drop a medium and a low export into the same scene (§8.2). They
   upload and save into `splat.variants` correctly, but **tier-based loading
   doesn't read them yet** `[build]` — `useSceneManager.ts` always loads one
   path regardless of the resolved tier; tier currently only changes load
   *options* (dpr, `useEnv`, far plane), never which variant's assetId gets
   fetched. Also not built: flagging a variant whose extent differs from the
   high one, and the bytes-to-first-frame estimate — both need the
   bbox/splat-count data §7.1 step 2 above explains we don't have.

Built: chunked resumable upload (8 MB chunks, resumes from the server's
reported byte offset — `src/lib/upload.ts`, `server/src/routes/assets.js`),
the local-disk storage driver (`server/src/storage.js`, §9's exact
put/get/stat/url/remove seam), range-capable reads, the three-slot
high/medium/low panel (`src/components/Uploader.tsx`).

Requirements:

- **Chunked, resumable upload.** A room export is ~120 MB; a large-area scan can
  be several GB (constraint 2 puts no ceiling on it). Over a Kathmandu office
  connection a dropped link must not mean starting again, and the uploader must
  not assume a size that fits in memory or in one request.
- **Progress that tells the truth** — bytes sent of bytes total, not a spinner.
- **Range requests on read.** The SDK streams tiles with `206 Partial Content`;
  whatever serves assets must support it (Nginx does by default, some static
  handlers don't).
- Reject on validation failure with a message naming the missing file.
- Never load a scan into server memory to validate it. Stream to disk, then
  inspect.

The same path handles hero video, thumbnails, hotspot media and audio — smaller,
same driver, same asset ids.

### 7.2 Place the model — transform gizmo `[built]`

**As built (2026-09-17):** `src/lib/transform.ts` + `src/components/Gizmo.tsx`,
three.js r164's own `TransformControls` (no drei). Keys are **`G` / `R` / `T`**,
not `G / R / S` — `S` already walks backwards. `Esc` turns the tool off.
Handles appear ~2.5 m in front of the camera when the tool is switched on, and
a drag is applied to the model *around* them (a 3D-cursor pivot); the model's
own origin is usually off-screen. The Scene panel's "Model placement" section
has X/Y/Z number fields with ‹ › steppers (hold to repeat) and step presets.
Rotation is stored in **degrees, YXZ order**; scale is uniform. "Drop to floor"
is labelled **Floor to 0 m**: it moves the model so the floor under the camera
sits at y = 0. The placement is applied in the tour too, not only the studio.
Not built: a separate "numbers" disclosure (the numbers are always visible).

A three-mode gizmo on the splat root: **move / rotate / scale**, keys `G` / `R`
/ `S`, with:

- Snapping held with `Ctrl` (0.1 m translate, 15° rotate, 0.1 scale).
- A live numeric readout in the inspector — monospace, tabular figures, updating
  as you drag (§10.1).
- **Reset transform** and **Drop to floor** (raycast the bbox base down onto the
  collision mesh) as one-click actions. Getting a scan level and on the ground is
  the most common fix; it should not be a slider hunt.
- Written straight to `scene.transform`.

Implementation notes:

- Apply the transform via the SDK's `modelMatrix`. **Collision queries must use
  the same matrix.** If `intersectsCapsule` runs against the untransformed
  model, a rotated scan gets invisible walls in the old orientation. Verify this
  explicitly with a rotated scene before calling the gizmo done.
- Effective metre calibration is `unitScale × transform.scale`. Keep the two
  separate: `unitScale` is what we measured, `transform.scale` is what the author
  chose. Everything derived — eye height, speed, collision radius, gravity, near
  plane — multiplies by the product.
- Changing scale rescales the walker mid-session. Re-derive, don't reload.
- The transform applies to all three variants. Variants are the same model at
  different densities; if a variant needs a different transform, the export was
  wrong.

### 7.3 Capture viewpoints `[build]`

- Fly or walk to a view you like → **Capture view** (or `C`). Done.
- Each capture becomes a card in a filmstrip with an auto-generated thumbnail,
  an inline-editable name, and drag-to-reorder.
- Hovering a card previews that view; clicking flies the studio camera to it.
- **Set as start view** on any card writes `spawn`.
- Linking: drag from one card to another to create a `links` edge, or **Link to
  all** for a small space. The links graph is what the visitor's next/previous
  arrows follow.

Thumbnail gotcha: with `preserveDrawingBuffer: false` (our setting),
`canvas.toDataURL()` returns blank. Capture inside the same frame as a render —
render, read, continue — or flip the flag for exactly one frame. Downscale to
320 px WebP before upload.

### 7.4 Author the flythrough `[build]`

A visual timeline, bottom of the studio. No coordinate entry.

- **＋ Add shot** captures the current camera as the next keyframe, with a
  thumbnail. Drag cards to reorder; drag the gap between two cards to set travel
  time; drag a card's right edge to set a `hold`.
- A **scrub head** moves the real camera through the spline as you drag it, so
  the creator is always looking at the actual result.
- **Play / Pause** in place. Preview is the real viewer path, not an
  approximation.
- **Attach annotation**: with the playhead where you want it, click a hotspot in
  the scene tree → a cue chip lands on the timeline at that time. Drag to retime,
  drag its edge for `duration`.
- **Audio lane** under the shot lane: drop a music file, drop a narration file,
  drag to set `offset`, one gain slider each, and a ducking toggle. Waveform
  drawn from a decoded `AudioBuffer`, downsampled to peaks — don't render a
  sample per pixel.
- Per-segment easing from a small dropdown on each gap. Default
  `easeInOutCubic`; changing it is rare and should look rare.
- The path is Catmull-Rom through the shots — already implemented in
  `useCameraDirector.js`. This is a UI over it, not a new engine.

A creator should be able to produce a decent 45-second flythrough of a hotel
lobby, with music, in under five minutes without reading anything.

### 7.5 Publish `[built]` for spaces

**As built (2026-09-17):** the studio top bar has **Publish**, opening a panel
with status, blockers/warnings, Publish / Revert to published / Unpublish,
the link and an iframe snippet (three size presets). Server:
`server/src/store.js` (`publishScene`, `unpublishScene`, `revertToPublished`,
`getPublishedScene`, `listPublished`) and routes `GET|POST
/api/scenes/:id/publish`, `POST …/unpublish`, `POST …/revert`, `GET
…/published` (public), `GET /api/gallery` (public). Snapshots are
`scenes/<id>@<n>.json`, written with `wx` so one is never overwritten, and
kept after unpublish as history. Publish state (`status`, `publishedVersion`,
`publishedAt`) is owned by these routes — a normal save keeps whatever is on
disk, so a stale studio tab can't unpublish a space. Publish saves unsaved
edits first. The public tour (`/tour`) and gallery read published copies only.
Not built: **Publish property**, the extent-mismatch blocker (no bbox data,
§7.1), and embed-token enforcement — the snippet points at
`/tour?space=<id>&embed=1`, which anyone with the link can open.

**Publish** on a space, **Publish property** on the hub.

- Publishing snapshots the current draft into an immutable published version
  (`scenes/<id>@<n>.json`). Visitors read published versions only; the studio
  edits the draft.
- Publish is **blocked with a clear reason** if: no high variant, no spawn set,
  or a variant's extent doesn't match the high one (§8.2). Warn — don't block —
  if medium/low variants are missing or if measured bytes-to-first-frame misses
  constraint 2. **Never block on total scene size.**
- On publish, a **share panel**: public URL, iframe snippet with size presets,
  copy button on each. Plain HTML, no build step (constraint 4).
- **Unpublish** and **Revert to published** both exist. A tour that went out
  wrong must be pullable in one click.
- Embed tokens: `server/src/routes/embed.js` issues signed short-lived tokens;
  the viewer must actually enforce them for embedded loads (today it doesn't —
  §18).

---

### 7.6 Book now `[built]`

Some hotels want a direct booking button next to the enquiry form; Basera
does not, for now. So it is **off by default and per space**: Scene pane →
**Book now** → toggle, button text, link. When on and the link is an
http(s) address, the tour shows one filled pill in the top-right cluster,
in the property's accent, opening the hotel's own booking page in a new tab.

- Stored as `booking` on the scene doc (§5.2), so it goes through
  publish/snapshot like everything else (constraint 6).
- Only `https?://` links are ever rendered (`safeUrl()` in `src/lib/api.ts`),
  and publish is **blocked** if Book now is on with anything else — a
  `javascript:` link would otherwise run on a client's public page.
- **The card (2026-09-21, approved by the owner — see §20):** Book now opens
  a card like the owner's reference: room or offer name, tagline, optional
  check-in / check-out / guests (native date inputs, validated: not in the
  past, at least one night), the price and a note as the hotel typed them,
  and one button that continues on the hotel's page. The visitor's choices
  reach that page only through `{checkin} {checkout} {guests} {nights}` in
  the link (`src/lib/booking.ts`, tested). **There is no booking engine,
  payment, or live availability** — the price is text, not a quote.
- Per space, not per property: a 6-space hotel enters the link 6 times until
  the property document carries `cta`/`booking` for its spaces to inherit.

## 8. Quality tiers `[build]`

> **Active override, 2026-09-17 — tier detection is currently disabled.**
> Every session is forced to `high` with `dpr` uncapped to native
> `devicePixelRatio`, for local/internal preview of maximum visual fidelity.
> Requested explicitly, after being told this breaks constraint 1 below for
> any real visitor on a real low-end device — **do not publish or deploy a
> tour while this is active.** It is not a fix to anything; it is a
> deliberate, temporary hole in constraint 1 and 2.
>
> What's disabled, and where, each commented out in place (not deleted) so a
> revert is one block per file:
> - `src/lib/deviceTier.ts` — `resolveInitialTier()` short-circuits to
>   `{ tier: 'high', ... }` before its real body (still present, commented).
> - `src/lib/useSceneManager.ts` — the runtime measured-FPS downgrade
>   (`createFpsMonitor`/`onDowngrade`) is commented out, so a session can't
>   drop out of `high` even if the frame rate craters.
> - `src/components/App.tsx` — the Canvas `dpr` reads native
>   `window.devicePixelRatio` instead of `tierProfile(detectTier()).dpr`.
>
> **To revert:** in each file above, delete the override and uncomment the
> original block directly beneath it. No other file changed. Once reverted,
> §8 below is accurate again as written.

Three tiers, resolved once per session **before the SDK loads**, because the
tier decides which asset the loader fetches.

| Tier | Target device | Variant | Resident splat ceiling | dpr cap | Far plane | `useEnv` |
|---|---|---|---|---|---|---|
| `high` | Desktop, powerful laptop, discrete or recent integrated GPU | `high` (full export) | 3 M+ | 1.5 | full | on |
| `medium` | Recent iPhone, flagship Android, older laptop | `medium` | ~1.5 M | 1.25 | 0.6 × full | on |
| `low` | Ordinary Android, older iPhone | `low` | ~0.6 M | 1.0 | 0.4 × full | off |

`low` is the Vivo V20 case and is what constraint 1 is measured against.

The ceiling is **resident splats, not downloaded bytes** — a 2 GB campus scan is
legitimate on every tier; what differs is how much of it is held at once and at
what LOD. The SDK already caps splat count by its own GPU tiering (~1M–3M);
check `src/vendor/README.md` for the exact figures at v0.6.1 and align our
ceilings to them rather than fighting them.

### 8.1 Detection — guess, then verify

There is no reliable device-capability API on the web. Every signal below is
missing or lies on some browser, so the resolver is a **guess that gets
corrected by measurement**. Write it that way.

Signals, in `src/lib/deviceTier.js` `[build]` (extends the existing
`src/lib/lccConfig.js` tiering — extend it, don't add a second system):

```js
// All of these are optional. Treat every one as possibly undefined.
navigator.hardwareConcurrency   // Safari under-reports; absent on some browsers
navigator.deviceMemory          // Chromium only — absent on Safari/iOS entirely
window.devicePixelRatio
matchMedia('(pointer: coarse)') // touch primary => phone/tablet
// WEBGL_debug_renderer_info: Firefox hides it by default, Safari returns a
// generic string. Use it as a bonus signal, never as the deciding one.
gl.getExtension('WEBGL_debug_renderer_info')
gl.getParameter(gl.MAX_TEXTURE_SIZE)
```

Rules:

1. No WebGL2 → do not load the splat at all. Show the poster image, the space
   list and the CTA (constraint 5).
2. Coarse pointer + no `deviceMemory` (i.e. iOS) → start at `medium`. iOS gives
   us almost nothing to work with, and a recent iPhone handles `medium` easily.
3. Coarse pointer + `deviceMemory ≤ 4` or `hardwareConcurrency ≤ 6` → `low`.
4. Fine pointer + `deviceMemory ≥ 8` and `hardwareConcurrency ≥ 8` → `high`.
5. Everything else → `medium`. Medium is the default when unsure, always.
6. **Verify by measurement.** After the first frame, take a rolling median frame
   time over 5 s. Median FPS below 24 for 3 consecutive seconds → drop one tier
   and reload the scene at that variant. Do this at most once per session, and
   never auto-upgrade — oscillating between tiers looks like a bug to a visitor.
7. Persist the final tier in `localStorage` keyed by device, and start there next
   time. Persist the *measured* result, not the guess.
8. Honour Save-Data: `navigator.connection?.saveData === true` → force `low`.
9. Overrides: `?tier=high|medium|low` in the URL (keep `desktop-high` /
   `desktop-low` working as aliases), and a manual quality control in the
   viewer's settings menu. Manual choice wins over everything and is persisted.

Log one line at load: `tier=medium (guessed: high, downgraded: fps) variant=medium bytes=41.0MB`.
Every quality bug report starts with that line.

### 8.2 What the three variants actually are

The tier picks a **separately exported density of the same model**, not a
runtime slider and not a smaller area. Export from Lixel Studio at roughly
100% / 50% / 20% density, same extent every time, and upload each into its slot
(§7.1).

Three rules that follow from constraint 2:

- **Never trim the extent to make a variant smaller.** A low variant of a campus
  is the whole campus at lower density. If a variant covers less ground than the
  high one, the export is wrong — reject it at upload.
- **The high variant is the full-fidelity capture with nothing removed.** On a
  large-area scan it may be very large. That is correct and it is not a bug to
  report.
- Variants exist to lower what a weak device holds resident and how fast it
  reaches an interactive frame. They are not a total-size control.

Fallbacks: if a variant is missing, fall back upward (`low` → `medium` →
`high`) and log it. A space with only a high variant still works everywhere —
streaming handles it — but a phone reaches its first frame slower and evicts
more, so publish warns rather than blocks.

What the tier controls **inside** the renderer — dpr cap, far plane, `useEnv`,
eviction aggressiveness — reduces fill cost and resident memory, not download
total.

**Do not invent SDK options.** Before adding any load flag to cap splat count,
bias LOD or change cache size, check `src/vendor/README.md` and
`src/vendor/examples/three.html` for whether the SDK actually exposes it at
v0.6.1. If it isn't documented there, it doesn't exist — say so and stop rather
than passing a flag that is silently ignored. `useEnv`, `useIndexDB` and
`useLoadingEffect` are the three we know are real (§17).

Every tier change must be reported as a measurement: tier, variant, bytes
transferred, TTFF, median FPS on the reference device. Not "optimised for
mobile".

---

## 9. Asset storage — local now, hosted later

Current truth: models live on the machine running the server, under
`server/src/data/assets/<assetId>/` (override with `ASSET_DIR`). **No hosting
has been purchased.** Do not write code that assumes a CDN exists, and do not
write code that assumes one never will.

`server/src/storage.js` is the whole seam — built, local driver only:

```js
// put(assetId, relPath, readStream) -> void
// get(assetId, relPath, { range })  -> readStream   // must honour byte ranges
// stat(assetId, relPath)            -> { bytes, contentType }
// url(assetId, relPath)             -> string       // local: /assets/... ; s3: CDN URL
// remove(assetId)                   -> void
```

Scene documents store `asset://<assetId>/<relPath>`; `url()` resolves it at read
time. When hosting is bought we write an `s3` driver and change one env var
(`ASSET_DRIVER`). If any scene JSON anywhere contains `http://localhost` or
`/public/assets/`, that is a bug in this seam.

Retention: masters and processing stay on the NAS. Uploaded assets are published
derivatives — reproducible from the master, so they don't need the same backup
paranoia. Three variants per space means storage grows ~1.7× the high export;
budget for it when sizing the hosting plan.

---

## 10. Visual direction

Two surfaces, deliberately opposite. Do not use one design system for both.

### 10.1 Studio — floating panels over the viewport

**Revised 2026-09-17.** This section previously specified the opposite — a
survey-instrument look: flat panels docked to the screen edge, hairline rules,
hi-vis survey yellow, "no card shadows, no rounded panel stacks, no gradient
anything", density over comfort. That was deliberately replaced, on request,
with the modern-SaaS idiom below. The old text is preserved in this paragraph
so nobody re-derives it from the code and thinks the change was an accident.

**Revised again 2026-09-20.** The floating-island look above lasted three
days. The studio is now **docked and flat**: every pane runs edge to edge with
no gutter and square corners, so the chrome reads as one continuous black
surface from the top bar round to the filmstrip. The controls *on* the panes
keep their radius — square panes, rounded buttons and fields. Tokens live at
the top of `src/components/editor.css` and `uploader.css` inherits them.

- Dark **and** light: the viewport shows photographic 3D content, so dark is
  the default and the right choice for colour judgement, but both themes exist
  and `ThemeToggle` in the top bar switches them. Neutral near-black, not blue-
  black: ground `#09090A`, panel `#131315`, card `#1C1C1F`, well `#060607`,
  border `#26262A` — with the same token names inverted under
  `:root[data-theme="light"]`.
- Panes are square (`--ed-r: 0`), flush (`--ed-gap: 0`), and carry exactly one
  hairline each, on the side that faces the viewport — flush panes would
  otherwise double their borders at every seam. They cast no shadow. Controls
  keep `--ed-r-sm` 8px, and floating elements (dropdowns, toasts, the upload
  dialog) keep `--ed-shadow`.
- One accent, `--ed-signal`, for **active selection and the current keyframe
  only**. The chrome is now monochrome, so it is plain full contrast — white on
  dark, near-black on light. Earlier passes used cyan `#4FC3D9` and, before
  that, survey yellow `#E8C547`; both are gone. If a second accent appears,
  delete it. Gizmo axis colours are the one exception — red/green/blue axes are
  a convention, not decoration.
- Object kinds are told apart by a small tinted icon tile on the row, not by
  colouring the row itself.
- Numeric readouts (coordinates, FOV, eye height, splat count, frame time,
  transform values, byte sizes) stay in a monospace face with tabular figures.
  These are measurements and must not jitter as they update. **This one did not
  change and must not.**
- Comfort over density now: generous padding, two-line list items, rounded
  filled rows. Keyboard shortcuts for every tool still matter — three users,
  hours a day — but the chrome no longer optimises purely for tight rows.
- §10.2's "Avoid" list (rounded cards, soft shadows, `·`-joined meta strings,
  `→` on buttons) governs **the tour only**. The studio uses rounded cards and
  soft shadows on its controls and floating elements, never on its panes.

### 10.2 Tour — the room is the interface

Chrome gets out of the way. Every pixel of UI is a pixel of hotel a guest
doesn't see. The CTA is the one exception, and it earns its pixels.

- Persistent UI: place name, two icon buttons (sound, settings/quality), the
  space switcher, and the CTA. Nothing else until the visitor acts.
- Themeable per client. Accent, logo and heading typeface come from `theme`.
  Build tokens so a hotel's brand drops in without a code change. Neutral
  default: warm-neutral translucent panels over the scene, high contrast text,
  no glassmorphism blur (it costs frames on mobile, and mobile is the low tier).
- Typography carries the personality since there is almost no other UI. Default
  pairing: a transitional serif for place names and hotspot titles, a plain
  grotesque for body and controls. Place names are the hero — set them large.
- Motion only in response to a tap, with one exception: the autoplay flythrough
  (§6.2), which is content, not decoration. No ambient animation, no attract
  loop, no fade-in-on-scroll.
- Joystick is a translucent overlay, bottom-left, fades when untouched, absent
  in viewpoint mode. It must not collide with the CTA.
- The hub page is a normal, fast web page: hero video, property name, space list.
  It should feel like the hotel's own site, not like a 3D app's landing screen.

**As built (2026-09-21):** enter gate is a left-aligned hero over the
streaming room (brand, place name, tagline, **Start virtual tour**). In the
tour: place name top-left; top-right a row of dark round icon buttons
(Spaces, Sound, HD, Controls, Full screen), then Book now (§7.6) and Exit;
the **mode dial** top centre (§6.1 — no Floor plan, §20 #2; under 1180 px
wide and on phones it drops below the top buttons); the bottom is one
**centred** column — a filmstrip of numbered view cards, then the **tour
bar**: ‹ ›, a round play button whose ring fills over the current view's
flight, the view's name in the serif with `1 / 3 now flying` under it, a
**Views** toggle for the filmstrip, and progress segments along its bottom
edge (click one to jump). The bar counts as playing across the short pause
between views, so Pause always pauses. In Orbit/Fly the bar becomes zoom (or
fly speed), reset and exit. The studio
preview's Exit preview sits bottom-left. The enquiry CTA sits bottom-right; Book now and enquiry open as light cards at the right. **Layers:** the
project's spaces as a floor-picker spine down the left edge — numbered nodes
on a line, the current one named in the serif, a gold marker that glides to
the space you pick and a turning ring on its node while it loads (desktop;
phones keep the Spaces button). Once the tour has shown, the top buttons and
the spine stay up while the next space loads; the spine sits above the
loading screen. The tour only lists spaces published under the **same
project** as the one it opens on. Hotspots are callouts
in every camera mode: a ring on the spot, a leader line, and a card
(thumbnail or icon, title, one line of text, a speaker mark if it has
audio). Only the 4 nearest show their card; the rest are rings until
hovered. Placement maths is `src/lib/hotspotLayout.ts`.

Avoid: cream-and-terracotta palettes, acid-green-on-black, identical rounded
cards with the same soft grey shadow, ALL-CAPS eyebrow labels above headings,
`→` glued to button text, meta strings joined with middle dots.

---

## 11. Copy rules

Sentence case. Active voice. A button says what happens: "Publish space", not
"Submit". Errors say what broke and what to do, with no apology and no exception
strings. Empty states invite an action.

CTA copy is the client's voice: it comes from `cta.headline` and
`cta.submitLabel`. Never hardcode "Contact us" into a component.

---

# Developer guide

## 12. Running this project

Two processes: the Next.js app and the Node API.

```bash
# terminal 1 — API
cd server
cp .env.example .env   # EDITOR_PASSWORD / SESSION_SECRET / EMBED_TOKEN_SECRET
                       # ASSET_DRIVER=local / ASSET_DIR
npm install
npm run dev            # http://localhost:4000

# terminal 2 — app
cp .env.example .env.local   # NEXT_PUBLIC_API_URL defaults to http://localhost:4000
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
```

Routes. `editorActive.ts` decides by path (anything under `/studio` = editor).
Move between studio pages with plain `<a>`, never `<Link>`: only a full page
load gives each property a clean `LCCRender` singleton.

| Route | What | Status |
|---|---|---|
| `/` | Marketing home — static, server-rendered | `[built]` |
| `/login` | Sign in / create account (`?mode=signup`, `?next=` same-site paths only) | `[built]` |
| `/studio` | Project list: one card per client (click to open; ⋯ → Rename / Delete project), the last-opened project first and tagged. **New project** opens a large dialog: input type (Lixel Studio export — folder or .zip, the same upload path as the studio uploader; 360 camera video shown as *Coming soon*, not built), drop zone, project name and first-space name (taken from the export). Create opens the project with that space already loaded. "Not in a project yet" always shows when spaces are unfiled, with **Group into a project** (defaults to "Demo project") or a per-space Move to…. Signed-out visitors are sent to `/login` | `[built]` |
| `/studio/<property>` | The editor, scoped to that project's spaces before the 3D mounts. The top bar shows **Projects / <current project ▾>** — the switcher lists every project and opens any of them. Leaving with unsaved edits triggers the browser's "Leave site?" prompt. No spaces yet → uploader. New uploads get the id `<property>-<title>` | `[built]` |
| `/tour` | Visitor viewer, **published spaces only**. `?space=<id>` picks one (default: newest published); `?embed=1` hides Exit 3D. Unpublished or unknown → a message, and the 3D never mounts. **Interim**, until `/t/<property>/<space>` exists | `[built]` |
| `/gallery` | Every published space, rendered per request | `[built]` |

Still to build:

| Route | What |
|---|---|
| `/t/<property>` | Hub page |
| `/t/<property>/<space>` | Detail page — full experience + CTA |
| `/embed/<property>/<space>` | Chromeless embed, token-gated |
| `/studio/<property>/<space>` | Deep link to one space (today the editor opens on the property's first space) |

Tests — Node's own `node:test`, no framework:

```bash
npm test               # client helpers (test/*.test.mjs), then cd server && npm test
```

`server/test/api.test.js` starts the real API against a throwaway
`DATA_DIR`/`ASSET_DIR` and covers properties, moving spaces, the booking
migration and blocker, the transcript warning, audio upload validation and
asset-id traversal. `test/client.test.mjs` runs the TypeScript helpers
directly (Node 24 strips types). Every file-backed store reads `DATA_DIR`
(`server/src/dataDir.js`) — point it anywhere to run against scratch data.

The tour works with the API stopped — it falls back to scenes baked into
`src/lib/scenes.js`. The 5 s budget means the app never blocks its first frame
on the API.

Production: `npm run build && npm start` for the Next app on any Node host, and
`cd server && npm start` for the API, behind something that supports HTTP range
requests.

## 13. How the code is organized

Existing:

`src/components/` is flat — no `editor/`/`viewer/`/`tour/` subfolders. Shared
types live in `src/@types/*.types.ts` (plus `vendor.d.ts` and `global.d.ts`
for ambient declarations).

| File | Job |
|---|---|
| `src/lib/transform.ts` | Scene transform store (degrees, YXZ, uniform scale), `applyToRenderer()` (§17), gizmo tool state. `[built]` |
| `src/components/Gizmo.tsx` | Move / rotate / scale handles (`G`/`R`/`T`, Ctrl snaps) and `useSceneTransform()`, which applies placement in studio and tour. `[built]` |
| `src/components/SiteNav.tsx`, `src/app/gallery/page.tsx` | Marketing nav; public gallery of published spaces. |
| `src/app/studio/page.tsx`, `src/app/studio/[property]/page.tsx` | Project list (create, rename, delete, last opened), and the editor scoped to one project (§12). `src/lib/useStudioSession.ts` is their shared sign-in gate. The editor's project switcher and unsaved-edits guard are `ProjectSwitcher` / `LeaveGuard` in `EditorShell.tsx`. `[built]` |
| `src/lib/audio.ts` | One `AudioContext`, gesture unlock, mute persistence, visibility pause, hotspot clip playback (§6.3). `[built]` for hotspot audio |
| `src/components/BookingCard.tsx` + `src/lib/booking.ts` | The Book now card (§7.6) and its pure date/link helpers. `[built]` |
| `src/components/NewProjectDialog.tsx` | The New project dialog (§12). Reuses `uploadVariant` and the uploader's `slugify` / `freeSceneId`. `[built]` |
| `src/lib/collision.ts` → `clearOrbitDistance()` | Fly mode's line-of-sight probe (§6.1). |
| `src/lib/hotspotLayout.ts` | Where a hotspot's callout card sits on screen, and which hotspots get one. Pure, tested. `[built]` |
| `server/src/routes/properties.js` | Property list (with space counts), create, rename (`PATCH`, title only), delete (releases its spaces) — studio session only. `POST /api/scenes/:id/property` in `scenes.js` moves a space. `[built]` |
| `server/src/dataDir.js` | `DATA_DIR` for every file-backed store (tests use a temp one). |
| `src/components/ThemeToggle.tsx` + `src/lib/theme.ts` | Light/dark switch. Writes `<html data-theme>` + `localStorage.threedview-theme`; `site.css` and `editor.css` each flip their own tokens off it, and `layout.tsx` applies it in an inline script before first paint. Stateless — the icon swap is CSS in `globals.css`. Mounted in the marketing nav and the studio top bar; the tour stays dark. `[built]` |
| `src/app/tour/page.tsx` | Decides which published space opens and hydrates the scene list from published docs before the 3D mounts (`limitTour()` in scenes.ts). |
| `src/lib/scenes.ts` | Scene list: id, name, tagline, spawn. `setSessionSpawn` / `spawnFor` back the studio's spawn override. `renameScene()` retitles a scene (double-click its tree row) — label only, never the `id`, which addresses the asset. `hydrateScenes()` merges metadata from the API, best-effort. |
| `src/lib/viewpoints.ts` | **Misnamed** — holds *tracks*, not viewpoints (§0.2). Rename to `src/lib/tracks.ts` when the timeline lands, and update the studio's "Copy tracks JSON" target. |
| `src/lib/walkerConfig.ts` | Live tunable movement + camera settings (mode, eye height, radius, near plane, speed), in world units. Scene manager fills scale-derived defaults; studio sliders write here; walker reads it every frame. |
| `src/lib/uiConfig.ts` | Visitor-facing presentation (brand, labels, accent) driven by the Look tab. |
| `src/lib/deviceTier.ts` | Tier guess + measured downgrade + persistence (§8.1). |
| `src/lib/useSceneManager.ts` | Loads one scene at a time. Measures the bbox → `unitScale` → rescales walker + camera near/far. |
| `src/lib/useCameraDirector.ts` | Cinematic engine — Catmull-Rom spline through a track's shots, ease in/out, hands back. Interruptible by any input. |
| `src/lib/useLccWalker.ts` | Walk / fly / orbit controller on the SDK's `intersectsCapsule` collision. Owns the mandatory `LCCRender.update()`. |
| `src/lib/sceneDoc.ts` | Renderer-agnostic scene doc — session hotspot store, `sceneDocFor()` and `exportSceneJSON()`. Update to schema v2. |
| `src/lib/hotspotProjector.ts` | Per-frame world→screen projection of hotspots. Also feeds cue placement during tracks. |
| `src/lib/editorActive.ts` | Dev or `?edit` → studio; `?view` forces viewer. **Retire once routes land.** |
| `src/lib/lccConfig.ts` | Device tiering + SDK load options. **Extend for the three tiers (§8), don't duplicate.** |
| `src/lib/api.ts` | Client for the Node API. Every call best-effort; the app never blocks on it. Also the asset-upload endpoints (create/init/chunk/finalize/delete, §7.1). |
| `src/lib/upload.ts` | Chunked resumable upload engine — folder walking (drag-and-drop + `webkitdirectory` browse), 8 MB chunks, resume-from-server-offset. A lone `.zip` passes through untouched; the server extracts it on finalize (§7.1). |
| `src/components/App.tsx` | Canvas + shell + preview + hotspot projection. Owns the `dpr` cap — now tier-driven. |
| `src/components/Viewer.tsx` | Visitor experience, laid out as in §10.2's as-built note — hero enter gate (where the `AudioContext` resumes, §6.3), place name, top-right icons + sound toggle + Book now + Exit 3D, mode dial, layers spine, view filmstrip + tour bar (play ring, segmented progress), hotspots, joystick. Reused as the studio's Preview. |
| `src/components/TouchControls.tsx` | Floating mobile thumb-stick + Run/Jump. Writes `mobileInput.ts`. |
| `src/components/HotspotMarkers.tsx` + `hotspots.css` | Hotspot callouts (ring, leader line, card) in tour and studio, and the slide-up panel with Listen + transcript. |
| `src/components/EditorShell.tsx` + `editor.css` | Studio UI — top bar, left scene tree, right inspector, bottom filmstrip. Inter (`next/font/google`) is scoped here via `--sans` (§10.1) — the tour keeps its own theme font. |
| `src/components/Uploader.tsx` + `uploader.css` | New-space upload panel — high/medium/low slots, live progress, validation errors naming the missing file (§7.1). Opened from the Scenes group's ＋ in `EditorShell`. |
| `src/components/EnquiryPanel.tsx` | Persistent CTA + enquiry card over the scene (§6.4). Open state can be owned by the Viewer (one card at a time) or by itself (no-WebGL fallback). |
| `src/app/layout.tsx` | Root layout — Inter (`--font-inter`) and Instrument Serif (`--font-display`, marketing site only). |
| `src/app/page.tsx` + `src/components/site.css` | Marketing home (§12). `site.css` also styles `/login`; `.site` is its own scroll container because `globals.css` locks `body` for the 3D app. |
| `src/app/login/page.tsx` + `src/components/AuthPanel.tsx` | Sign in / create account. |
| `src/app/studio/page.tsx`, `src/app/tour/page.tsx` | Mount `App.tsx` via `next/dynamic({ ssr: false })`; the studio page gates on the session first. |
| `src/components/SplatField.tsx` | Hero illustration — a procedural lounge as LiDAR points turning into splats under a scan sweep. 2D canvas, no WebGL. Honours reduced motion (static final frame) and pauses off-screen. |
| `server/src/routes/scenes.js` | Scene list / get (public) / save (session only), plus publish / unpublish / revert (session) and the published read + `galleryRouter` (public), §7.5. |
| `server/src/routes/auth.js` | `/signup` (needs team access code), `/login` (email + password, or legacy shared password alone), `/logout`, `/session` (returns the user). Rate-limited per IP. |
| `server/src/usersStore.js` | Accounts — one JSON per user named by an email hash; scrypt + timingSafeEqual. |
| `server/src/routes/embed.js` | Issues + verifies signed short-lived embed tokens. |
| `server/src/routes/assets.js` | Upload create/init/chunk/finalize (session-only) + range-capable public read (§7.1, §9). Finalize extracts a single `.zip` upload in place via `yauzl` before validating. |
| `server/src/store.js` | File-backed scene storage — the seam to swap for Postgres. Drafts are `<id>.json`, published snapshots `<id>@<n>.json` (never listed as scenes). |
| `server/src/storage.js` | Asset driver seam (§9) — local disk today. `put`/`get`/`stat`/`url`/`remove`, exactly the interface below. |
| `server/src/migrate.js` | Schema migrations on read (§5.3). |

To add `[build]` (frontend additions are TypeScript — `.ts`/`.tsx` — same as
everything else in `src/`; backend additions stay plain JavaScript per §4):

| File | Job |
|---|---|
| `src/lib/propertyDoc.ts` | Property document load/save, space list, CTA + theme inheritance. |
| `src/lib/leads.ts` | Client-side submit, validation, retry, source-space/hotspot attribution. |
| `src/components/Hub.tsx` | Hub page (server-rendered shell + client bits). |
| `src/components/SoundToggle.tsx` | Quality control. (The mute toggle is built, inline in `Viewer.tsx`.) |
| `src/components/Timeline.tsx` | Shots, gaps, holds, cue chips, audio lane, scrub. |
| `server/src/routes/properties.js` | Property publish/unpublish (list, create, rename, delete are built). |
| `server/src/routes/leads.js` | Public lead intake + delivery. Rate-limited. |

## 14. Scale — `unitScale`

Everything (eye height, speeds, collision radius, gravity, near plane) is
multiplied by `unitScale × transform.scale`. `unitScale` comes from an explicit
value on the scene if set, else a bbox fallback in `useSceneManager` that assumes
metric (only scaling up for a clearly sub-metre scan).

**`bar-restro` is pinned to `1`** — its `meta.lcc2` bbox is inflated by stray
splats (~58-unit diagonal), so no bbox-based guess would be reliable. If a scan
spawns you in the ceiling or you sink through the floor, set `unitScale`
explicitly on that scene.

All three variants of one space must share a `unitScale`. If a medium or low
export measures differently, the export settings differed — fix the export, not
the scene.

## 15. First thing on a new space: place it, then fix the spawn

1. Upload the high variant → the scene opens with an identity transform.
2. **Drop to floor**, then rotate so the model faces the way a visitor should
   enter. Check the scale readout against something you know — a door is ~2.1 m.
3. Fly (`N`) to a good first view → **Set as start view**.
4. Walk it once. If you fall through the floor, see §17.
5. Upload the medium and low variants, then load each once at
   `?tier=medium` / `?tier=low` and confirm the spawn and viewpoints still land
   correctly.

## 16. Adding a space

1. Studio → **New space**, upload the export (§7.1). Do not hand-place folders
   in `public/assets/` any more — that path is legacy and does not survive the
   move to hosted storage.
2. Add it to the property's `spaces` list so it appears on the hub.
3. Author it, then publish.

## 17. SDK alignment (read this first)

Checked against `src/vendor/README.md` and `src/vendor/examples/three.html`:

- **Three.js is pinned to r164** (`three@0.164.0`) — the version the SDK bundle
  ships and tests against. The vendor README says a much newer Three is the most
  likely source of odd rendering.
- **Load options match the example** — `useEnv`, `useIndexDB`, `useLoadingEffect`
  only (`src/lib/lccConfig.js`). Speculative flags (`gpuAcceleration`, cache
  sizes, occlusion culling, …) are deliberately absent; several override an SDK
  default of `false`. §8.2 applies: if a flag isn't in the vendor docs, it
  doesn't exist.
- **Render order matches** — walker frame → `LCCRender.update()` → R3F's auto
  `gl.render()`.
- `modelMatrix`, `renderLib: THREE`, `renderer`, `canvas` all as documented.
  `modelMatrix` is only the fixed Z-up → Y-up base (`LCC_MODEL_MATRIX`).
- **Undocumented, used on purpose:** the renderer's `root` (a `THREE.Group`).
  The bundle's `createRenderer()` decomposes `modelMatrix` onto it, and
  `intersectsCapsule` reads its `matrixWorld`, so moving `root` moves render
  and collision together. The author transform (§7.2) is applied there, live —
  `modelMatrix` is load-time only. Verified 2026-09-17 on bar-restro: after a
  50 m move, a 90° turn and a ×2 scale, collision matched at the transformed
  positions (72/72 sample points for move and turn). **Re-run that check after
  any SDK upgrade** (`src/lib/transform.ts` has the details). Only
  `applyToRenderer()` should write `root`.
- `src/vendor/examples/three.html`, cited above and in §8.2, **is not in the
  repo**; the vendored README documents no load options. Vendor the examples
  folder with the next SDK drop.

## 18. Troubleshooting

### Streaky / spiky splats that rotate with the camera

Near-plane covariance explosion, visible in the SDK's own splat shader: a
Gaussian whose centre is just past the near plane projects with a Jacobian term
of `focal / viewZ` and `1 / viewZ²` — as `viewZ → 0` the 2D ellipse blows up into
a screen-spanning streak and its alpha drops, so you see through it.

- Raise **Near clip** in the World tab until the spikes stop.
- Raise **wall clearance (radius)** to keep the camera out of that band.
- Check the `unitScale≈…` console line; a mis-scaled scan puts the near plane in
  the wrong place.
- `dpr` is tier-capped (§8). Lower it on a weak GPU, raise it if soft.

### Falling through the floor

Bad spawn (§15), a non-metric scan (auto-handled), or a transform applied to the
render but not to collision (§7.2). `collision=false` in the console → that scan
has no collision mesh and the walker flies instead.

### Looks worse than it should

- Check the tier line in the console first — you may be on `low` after an
  automatic downgrade, or on a fallback variant because one is missing.
- LOD tiles stream over the first seconds — let the network panel settle.
- Tone mapping is `NoToneMapping` on purpose (matches LCC Studio) — don't add
  ACES.

### No sound

Expected on first load: audio starts muted by design (§6.3). If it stays silent
after unmuting, the `AudioContext` never resumed — it only resumes on the enter
gate tap. On iOS check that the gesture handler is synchronous; an `await`
before `context.resume()` loses the gesture.

## 19. Known rough edges

- Fast Refresh is unreliable for `useSceneManager.js` / loader options — the SDK
  renderer is a page singleton. Hard-reload after editing those.
- ESLint shows ref/mutation warnings from `eslint-plugin-react-hooks` — same
  patterns as the original demo; build and dev are unaffected.
- `no appKey` console warning from the SDK is expected for now.
- Accounts have no password reset, no email verification and no admin list —
  a forgotten password means deleting the user file by hand.
- The home page says quality adapts to the device; while the §8 max-graphics
  override is active, that is not true.
- Embed tokens are issued but not enforced by the viewer.
- Studio edits (tracks, hotspots, placement, start view, name) are unsaved until
  **Save space** in the top bar, which saves the open space only and shows what
  it wrote. Tracks and hotspots saved before 2026-09-17 were never read back on
  load — that is fixed; those tracks also lost their durations (now 4 s).
- `sceneDocFor()` used to write `splat.variants.high` as `local:<id>` on every
  save, which cut uploaded spaces off from their model (canteen was repaired
  by hand). It now keeps the saved `splat`. If another uploaded space shows
  `local:` in its JSON, find its `ast_*` folder and repoint it.
- The tour's place name shows the studio-wide brand from the Look tab, not a
  per-property one (the property document isn't built).
- `src/lib/viewpoints.js` holds tracks, not viewpoints (§13).
- Fly mode indoors is a view from just under the ceiling, not a roofless
  dollhouse: the SDK can't clip its splats (checked: no clipping in its
  shaders or docs). Revisit if an SDK drop adds it.
- A published snapshot keeps the `propertyId` it had when published. Spaces
  published before projects existed (computer-lab2) only join their
  project's tour after they are republished.
- A space whose model fails to load (missing files, network) shows "<name>
  didn't load" in the middle and keeps the chrome and layers rail up
  (`ViewerState.failed`). **computer-lab2 does this today:** its asset
  `ast_80be873a6555` is not in `server/src/data/assets/` — re-upload it.
- Floor1 and Floor4 have no tracks and the placeholder start view
  `[0, 1.7, 3]`. Fly copes (see §6.1), but set a start view and author a
  track on each.
- "360 camera video" in the New project dialog is a placeholder: nothing
  turns 360 footage into a splat.
- A space can only be moved into a project from the "Not in a project yet"
  list. There is no "move to another project" for a space that is already
  filed — today that takes a hand edit of the space's `propertyId`.
- Removing a hotspot's audio only unlinks it; the `.m4a` stays in asset
  storage, because a published snapshot may still point at it. Nothing
  garbage-collects unreferenced assets yet.
- Once a hotspot or track is selected in the studio, the only ways back to
  the Scene/Look panes (where Book now lives) are deleting it, switching
  space, or reloading. There is no deselect. (Found while testing; not new.)
- **Quality-tier detection is currently forced off — see the override note at
  the top of §8.** Every session loads at `high`, uncapped dpr. Revert before
  publishing anything.

## 20. Backlog — proposed, not approved `[ask]`

Do not build these. Recorded so they are not lost, and so nobody adds one
mid-task.

1. ~~Dollhouse / orbit overview of a whole space as a visitor mode.~~
   Approved and built as **Fly** (§6.1), 2026-09-21.
2. Floor-plan mini-map with the visitor's position and clickable rooms.
3. Measurement tool in the tour.
4. WhatsApp / Viber CTA alongside the form.
5. Booking-engine deep link with dates and room type prefilled.
6. Availability or price on the hotspot panel.
7. Tour analytics for the client: visits, dwell per space, CTA conversion.
8. Day / night variants of a space.
9. Multi-language labels and CTA copy (Nepali / English / Chinese).
10. VR / headset mode.
11. Furniture or layout variants for banquet and meeting spaces.
12. Side-by-side compare of two room types.
13. Watermark / usage expiry on embeds for unpaid clients.
14. Lead routing to a client CRM instead of email.

Approved out of this list in revision B: audio and narration (§6.3).
Approved 2026-09-21: #1, as Fly and Orbit. #5 in part — dates and guests
are passed to the hotel's own booking page through its link; there is still
no booking engine. #6 in part — a price the hotel types in, shown as text;
no live availability or pricing feed. #2 (floor plan) was explicitly
excluded.

---

## 21. Working with Claude Code

- **Read this file first, every session.** Nothing carries over between sessions
  except what is written here.
- **Ask for the numbers.** Tier, variant, bytes to first interactive frame,
  TTFF, resident splat count and median FPS on the reference device — for every
  feature that touches the renderer. Total scene size is not one of them. If you
  don't ask, you get "optimised for mobile" as a claim rather than a measurement.
- **"Tell me what you did not do"** at the end of each task is the single most
  useful line to ask for. It surfaces the stubs before a client finds them.
- When a task produces something wrong, don't ask for a patch on top. Revert and
  re-prompt with the constraint that was missing — patched-over
  misunderstandings compound badly in AI-assisted work.
- One task = one status marker from §0.1. If a task drifts into `[ask]`
  territory, stop and say so.
- If a fact in this file contradicts the code, the code wins as evidence — say
  which line of this file is now wrong instead of coding around it.

## 22. Working agreement

- Read this file before starting any task. If a task conflicts with a hard
  constraint in §3, say so before writing code.
- Small commits, one concern each.
- Every new scene- or property-schema field needs a migration path (§5.3).
- Ask before adding a dependency (§4 lists the ones we already expect to need).
- Never guess an SDK capability (§8.2). Check the vendored docs or say you
  can't.
- Anything marked `[ask]` in §20 is not approved. Do not start it, do not stub
  it, do not add a flag for it.
- When you finish, tell me what you did NOT do and what you are unsure about.
  Do not pad completion summaries.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
