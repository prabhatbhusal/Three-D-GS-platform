<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0B0F2A,50:5B21B6,100:22D3EE&height=220&section=header&text=Three-D-GS%20Platform&fontSize=52&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=Capture.%20Author.%20Publish.%20Convert.&descAlignY=56&descSize=18" alt="Three-D-GS Platform banner" width="100%" />

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=20&duration=3000&pause=800&color=22D3EE&center=true&vCenter=true&width=680&lines=Gaussian-splat+virtual+tours+in+the+browser+%F0%9F%8C%90;Walk%2C+Fly+and+Orbit+through+real+spaces+%F0%9F%A7%AD;Day+%2F+Night+mode+in+one+tap+%F0%9F%8C%97;No+app+install+%E2%80%94+mobile+or+desktop+%F0%9F%93%B1;From+LiDAR+scan+to+live+tour+%F0%9F%9A%80" alt="Typing animation" />

<br/>

<img src="https://skillicons.dev/icons?i=nextjs,react,ts,threejs,nodejs,express,cloudflare,aws&theme=dark" alt="Tech stack" />

<br/><br/>

<b>Immersive 3D digital-twin experiences, curated studio workflows, and public virtual tours built for modern property marketing and spatial storytelling.</b>

<br/><br/>

<a href="#-overview">Overview</a> •
<a href="#-core-features">Features</a> •
<a href="#%EF%B8%8F-architecture">Architecture</a> •
<a href="#-repository-structure">Structure</a>

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:5B21B6,100:22D3EE&height=3" width="100%" alt="divider" />

## ✨ Overview

**Three-D-GS Platform** is a full-stack solution for creating, managing, and publishing immersive 3D spaces from real-world locations. It blends a marketing website, a private studio/editor, and a scalable backend API to transform captured spaces into browser-based tours.

> [!TIP]
> **No app installations required** — visitors explore directly on mobile or desktop browsers.

<!-- 🎬 Tip: record a short walkthrough of a live tour (ScreenToGif / Kap / OBS → GIF),
     save it as docs/demo.gif, then uncomment the block below. -->
<!--
<div align="center">
  <img src="docs/demo.gif" alt="Virtual tour demo" width="90%" />
</div>
-->

### 🔄 The Capture-to-Publish Workflow

```mermaid
flowchart LR
    A["📡 Scan & Capture<br/><small>LiDAR / 3D workflows</small>"] --> B["📥 Import<br/><small>Generate navigable scene</small>"]
    B --> C["✍️ Author<br/><small>Structure, hotspots, branding</small>"]
    C --> D["🚀 Publish<br/><small>Gallery & public tour</small>"]
    D --> E["🤝 Convert<br/><small>In-tour enquiries</small>"]

    style A fill:#1E1B4B,stroke:#22D3EE,color:#fff
    style B fill:#312E81,stroke:#22D3EE,color:#fff
    style C fill:#4C1D95,stroke:#22D3EE,color:#fff
    style D fill:#5B21B6,stroke:#22D3EE,color:#fff
    style E fill:#0E7490,stroke:#22D3EE,color:#fff
```

1. 📡 **Scan & Capture:** Walk the real site and collect spatial data using LiDAR or 3D workflows.
2. 📥 **Import:** Upload the spatial data into the studio to generate a navigable scene.
3. ✍️ **Author:** Set the tour structure, metadata, interactive viewpoints, and branding.
4. 🚀 **Publish:** Push the space to the public gallery and virtual tour experience.
5. 🤝 **Convert:** Visitors explore the space and submit enquiries from inside the tour.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:5B21B6,100:22D3EE&height=3" width="100%" alt="divider" />

## 🎯 Why This Platform Matters

Passive image galleries don't convert like they used to. This platform is built for spaces where people need to **explore before they decide**:

<div align="center">

| 🏨<br/>**Hospitality & Hotels** | 🎓<br/>**Colleges & Campuses** | 🏛️<br/>**Heritage Spaces** | 🏢<br/>**Commercial Offices** | 🔬<br/>**Labs & Facilities** |
|:---:|:---:|:---:|:---:|:---:|

</div>

*Instead of looking at photos, visitors can walk through a property and send enquiries without ever leaving the room.*

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:5B21B6,100:22D3EE&height=3" width="100%" alt="divider" />

## 🌟 Core Features

| Feature | Description |
| :--- | :--- |
| 🧭 **Virtual Tours** | Gaussian-splat tours in the browser. Features include Walk, Fly, Orbit, camera tracks, and a live floor map with a "you are here" indicator. |
| 📍 **Smart Hotspots** | Embed text, images, video, audio, links, portals, and tables. Set them to always show, or reveal dynamically as visitors approach. |
| 🌗 **Day / Night Mode** | Toggle a night version of a space in one tap without losing the current view. |
| 🌐 **Multilingual** | Native support for English, नेपाली, and 中文 (via picker or `?lang=`). |
| 🍽️ **Table Booking** | Interactive floor plans with GSAP animations. Guests pick tables; the studio manages approvals via the reservations inbox. |
| 🛎️ **Lead Generation** | Built-in booking cards per space and in-tour enquiry panels to capture visitor intent. |
| 🖥️ **Client Websites** | Full dedicated sites at `/s/<project>`. Includes live tours, menus, bookings, contact forms, and draft/publish controls. |
| 🎨 **Auto-Branding** | Upload a logo and the system suggests brand colors. Custom fonts and branding info per project. |
| 🧑‍💼 **Studio Workspace** | Powerful scene editor, version history, activity logging, and granular team roles. |
| 📊 **Analytics** | Monthly visitor reports, exportable floor-plan PDF sheets, and CSV enquiry exports. |
| ☁️ **Cloud Storage** | Native integration for S3-compatible buckets (Cloudflare R2) to synchronize splat data across machines. |

> [!NOTE]
> 📚 **Full Feature Book:** Check out the detailed guide in [`docs/RCAAS-Feature-Book.pdf`](docs/RCAAS-Feature-Book.pdf).

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:5B21B6,100:22D3EE&height=3" width="100%" alt="divider" />

## 🏗️ Architecture

```mermaid
flowchart TB
    V([👥 Visitors<br/>mobile & desktop]) --> PUB
    T([🧑‍💼 Studio Team]) --> STU

    subgraph FE["⚛️ Frontend — Next.js + React 19"]
        PUB[🌐 Marketing & Gallery]
        STU[🔐 Studio Workspace]
        VIEW[🧭 Viewer & Editor UI]
    end

    subgraph R3D["🎮 3D Engine — Three.js + React Three Fiber"]
        GS[✨ Gaussian Splat Rendering]
    end

    subgraph BE["🟢 Backend — Node.js + Express"]
        API[📦 Scene / Gallery / Asset APIs]
        UP[⬆️ Upload Service]
        LEAD[🛎️ Leads, Sessions & Embeds]
    end

    subgraph ST["☁️ Storage"]
        LOC[(💾 Local Files)]
        R2[(🪣 S3 / Cloudflare R2)]
    end

    PUB --> VIEW
    STU --> VIEW
    VIEW <--> GS
    FE <--> API
    FE --> LEAD
    API --> UP
    UP --> LOC
    UP --> R2
```

### Frontend Layer
Powered by **Next.js** and **React 19** to deliver:
* Public marketing pages & Gallery experiences.
* The secure, authenticated Studio workspace.
* A highly responsive viewer and editor UI.

### Backend & API Layer
Built on **Node.js** and **Express.js** to manage:
* Scene, gallery, and asset APIs.
* Upload services (Local or S3/Cloudflare R2).
* Lead submission, session controls, and embed support.

### 3D Rendering Engine
Built around **Three.js** and **React Three Fiber** for hyper-smooth real-time spatial rendering, Gaussian splatting, and immersive web interactions.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:5B21B6,100:22D3EE&height=3" width="100%" alt="divider" />

## 🧱 Repository Structure

<details>
<summary><b>Click to expand</b></summary>

```text
.
├── docs/                      # Feature book (PDF)
├── public/                    # Static media, sample assets, and site files
├── scripts/dev.mjs            # Starts the site and the API together
├── server/                    # Express API and file-backed storage layer
│   ├── src/                   # Routes, storage.js (local), storage-s3.js (S3/R2)
│   └── scripts/               # push-assets.js (`npm run assets:push`)
├── src/
│   ├── app/                   # Next.js App Router pages
│   ├── components/            # UI, editor, viewer, and 3D scene components
│   └── lib/                   # 3D game/navigation logic, API, and upload helpers
├── test/                      # Frontend test coverage
└── package.json               # Root dependencies and workspace scripts
```

</details>

<div align="center">

<br/>

**Explore before you decide. 🌐**

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:22D3EE,50:5B21B6,100:0B0F2A&height=120&section=footer" alt="footer" width="100%" />

</div>
