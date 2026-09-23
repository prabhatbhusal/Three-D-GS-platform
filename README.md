# Three-D-GS Platform

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
| 🧭 Virtual tours | Interactive browser-based walkthroughs with 3D spatial navigation |
| 🏢 Project management | Group spaces under client projects and properties |
| 🧑‍💼 Studio editor | Author, preview, and organize scenes in a private workspace |
| 📦 Asset handling | Upload models, scene data, and media assets through the API |
| 📸 Gallery publishing | Showcase live spaces in a polished public gallery |
| 💬 Lead capture | Collect visitor enquiries directly from inside the tour |
| 🔐 Session auth | Protect studio and editing workflows with secure access |
| 📱 Mobile-first UX | Designed to work beautifully on phones and tablets |

</div>

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
├── public/                     # Static media, sample assets, and site files
├── server/                    # Express API and file-backed storage layer
│   ├── src/
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
- `/studio` — studio dashboard for project management
- `/login` — studio authentication flow
- `/contact` — lead capture and service enquiry pages

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

### Start the app

Run the frontend and server in separate terminals:

```bash
# root project
npm run dev
```

```bash
# server
cd server
npm run dev
```

### Production build

```bash
npm run build
npm start
```

```bash
cd server
npm start
```

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

