
 <div align="center"><strong>Three-D-GS Platform</strong></div>
<div align="center">
 
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Three.js-3D-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Express-API-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express API" />

</div>

<p align="center">
  <strong>Immersive 3D digital-twin experiences, curated studio workflows, and public virtual tours built for modern property marketing and spatial storytelling.</strong>
</p>

<p align="center">
  <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80" alt="3D virtual tour showcase" width="100%" />
</p>

## ✨ Overview

Three-D-GS Platform is a full-stack solution for creating, managing, and publishing immersive 3D spaces from real-world locations. It blends a marketing website, a private studio/editor, and a scalable backend API to transform captured spaces into browser-based tours that visitors can explore on mobile or desktop without installing an app.

This platform is designed around a capture-to-publish workflow:

- Scan or capture a physical space using LiDAR / 3D workflows
- Import the scene into the studio
- Author metadata, hotspots, viewpoints, and structure
- Publish a public 3D tour and gallery experience
- Turn visitor interest into leads and enquiries

## 🚀 Why this platform matters

The product is built for spaces where people need to explore before they decide:

- hotels and hospitality
- colleges and campuses
- heritage and cultural spaces
- commercial offices and showrooms
- labs, facilities, and infrastructure

Instead of a passive image gallery, the platform creates a live spatial experience where visitors can walk through a property and enquire without leaving the room.

## 🌟 Core features

<div align="center">

| Feature | Description |
| --- | --- |
| 🧭 Virtual tours | Gaussian-splat tours in the browser: Viewpoints, Walk, Fly and Orbit, camera tracks, floor map with "you are here" |
| 📍 Hotspots | Text, image, video, audio, link, portal and table hotspots, shown always or when the visitor comes near |
| 🌗 Day / night | A night version of a space, switched in one tap without losing the view |
| 🌐 Languages | English, नेपाली and 中文 (picker or `?lang=`) |
| 🍽️ Table booking | Guests pick a table on the restaurant's own floor plan (GSAP animated); the studio confirms or declines in a reservations inbox |
| 🛎️ Book now & enquiries | A booking card per space and an enquiry panel inside the tour |
| 🖥️ Client websites | A full website per client at `/s/<project>`: live tour, rooms, menu, floor plan, booking, contact; draft, preview, publish |
| 🎨 Branding | Logo, brand colour suggested from the logo, heading font and brand info per project |
| 🧑‍💼 Studio | Scene editor, publish/unpublish/revert, version history, activity log, team roles |
| 📊 Reports & plans | Monthly visitor report and floor-plan sheets, printable as PDF; enquiries export as CSV |
| 🔐 Privacy | Projects are private to their owner and invited members |
| ☁️ Cloud storage | Scans can live in an S3-compatible bucket (Cloudflare R2) so every PC shows the same splats |

</div>

**Full feature book (PDF):** [docs/RCAAS-Feature-Book.pdf](docs/RCAAS-Feature-Book.pdf)

## 🧩 Product workflow

### 1. Capture
Walk the real site and collect spatial data using LiDAR or other 3D capture methods.

### 2. Import
Upload the spatial data into the studio so it can be transformed into a navigable scene.

### 3. Author
Set the tour structure, metadata, viewpoints, and the client/project organization.

### 4. Publish
Push the space to the public gallery and virtual tour experience.

### 5. Convert interest
Visitors explore the space and submit enquiries from inside the tour.

## 🏗️ Architecture

### Frontend
The app uses Next.js and React to power:

- public marketing pages
- the main gallery and tour experiences
- the secure studio workspace
- responsive viewer and editor UI

### Backend API
The server layer uses Express to manage:

- scene and gallery APIs
- project and property organization
- upload and asset services
- lead submission and retrieval
- auth/session controls
- embed-related functionality

### 3D engine
Built around Three.js and React Three Fiber for real-time spatial rendering and immersive interactions.

## 🧱 Repository structure

```text
.
├── docs/                      # Feature book (PDF)
├── public/                     # Static media, sample assets, and site files
├── scripts/dev.mjs            # `npm run dev`: starts the site and the API together
├── server/                    # Express API and file-backed storage layer
│   ├── src/                   # routes/, storage.js (local) and storage-s3.js (S3/R2)
│   ├── scripts/               # push-assets.js (`npm run assets:push`)
│   ├── test/
│   └── package.json
├── src/
│   ├── app/                   # Next.js app routes and pages
│   ├── components/            # UI, editor, viewer, and site components
│   ├── lib/                   # Scene, API, upload, and game/navigation helpers
│   └── @types/                # TypeScript definitions
├── test/                      # Frontend test coverage
├── package.json               # Root app dependencies and scripts
├── next.config.mts            # Next.js config
├── tsconfig.json              # TypeScript settings
├── eslint.config.js           # Lint configuration
├── README.md                  # Project documentation
└── .env*                      # Local environment configuration
```

## 🗂️ Main platform modules

- `/` — public landing page
- `/gallery` — published 3D tours and projects
- `/tour` — public tour entry
- `/t/<project>` and `/t/<project>/<space>` — a client's tour hub and short links to each space
- `/s/<project>` — the client's website
- `/studio` — studio dashboard for project management
- `/studio/<project>/site`, `/reservations`, `/report` — website editor, reservations inbox, monthly report
- `/login` — studio authentication flow
- `/contact` — how to book a capture

## 🔌 API highlights

The backend exposes key routes such as:

- `/api/health` — health check
- `/api/scenes` — scene management
- `/api/gallery` — published public scene data
- `/api/properties` — project and client grouping
- `/api/auth` — signer / session flow
- `/api/leads` — enquiries and lead storage
- `/api/assets` — uploads and asset resources
- `/api/embed` — embedded experience support
- `/api/sites` — client websites, table availability and reservations
- `/api/team` — accounts and roles
- `/api/stats` — tour visit stats

## 🛠️ Tech stack

<div align="center">

  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-164-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />

</div>

## 🧪 Local development

### Install dependencies

```bash
npm install
cd server && npm install
```

### Configure

```bash
cp server/.env.example server/.env
```

Fill in the values in `server/.env` (it is gitignored; never commit it). Set `RESEND_API_KEY` to send enquiry and reservation emails.

### Start the app

One command starts the site and the API together:

```bash
npm run dev
```

It stops servers left over from an earlier session (for example after VS Code closed) and picks free ports if 3000/4000 are taken. To run only one side: `npm run dev:web` for the site, `cd server && npm run dev` for the API.

### Share scans across PCs (optional)

By default uploads are stored on the PC that made them. To keep them in a Cloudflare R2 (or any S3-compatible) bucket instead, set `ASSET_DRIVER=s3` and the `S3_*` values in `server/.env` (see `server/.env.example`), then copy existing uploads up once from each PC that has them:

```bash
cd server
npm run assets:push -- --dry-run   # list what would be sent
npm run assets:push
```

### Tests

```bash
npm test
```

Runs the frontend tests and the API tests (the API suite runs twice: local disk and a simulated bucket).

### Production build

```bash
npm run build
npm start
```

```bash
cd server
npm start
```

Hosting on a VPS (pm2 + nginx + HTTPS, auto-deploy from `main`): see [deploy/README.md](deploy/README.md).

## 📍 Typical use cases

This platform is ideal for:

- luxury property showcases
- commercial venue walkthroughs
- campus digital tours
- heritage and conservation projects
- facility marketing and visitor engagement
- 3D digital documentation with a public web layer

## 🏁 Summary

Three-D-GS Platform is more than a 3D viewer — it is a complete capture-to-publish workflow for creating immersive digital spaces and converting online interest into real business enquiries.

It combines the power of modern web technologies with the clarity of a polished customer-facing experience, making it a strong fit for any brand that wants to showcase physical spaces with depth, interactivity, and conversion in mind.

---

<p align="center">
  <sub>Built for immersive spatial storytelling and digital-twin experiences.</sub>
</p>

