# 🕶️ The-AR — Virtual Glasses Try-On

Real-time AR glasses try-on using your webcam. Try different frame styles, colors, and measure your PD — all in your browser.

## Tech Stack
- **MediaPipe FaceMesh** — 468+ face landmarks with iris tracking
- **Three.js** — 3D glasses rendering
- **Vanilla JS** — zero build step, zero dependencies

## Features
- 🎯 Real-time face tracking with head rotation support
- 🕶️ 6 glasses styles: Aviator, Wayfarer, Round, Cat Eye, Rectangle, Clubmaster
- 🎨 12 frame colors with live preview
- 📏 PD (Pupillary Distance) measurement via iris tracking
- 📸 Screenshot capture & download
- 📱 Mobile-friendly (front/rear camera flip)
- ⚡ 30+ FPS on modern devices

## Quick Start

```bash
# Option 1: Python
python3 -m http.server 8080

# Option 2: Node.js
npx serve .

# Then open: http://localhost:8080/public/
```

> Camera requires HTTPS in production. localhost works for development.

## Architecture

```
src/
├── js/
│   ├── face-tracker.js    — MediaPipe FaceMesh wrapper
│   ├── ar-renderer.js     — Three.js overlay engine
│   ├── glasses-models.js  — Procedural 3D frame generation
│   ├── pd-measurer.js     — Pupillary distance measurement
│   └── app.js             — Main app, UI wiring
├── css/
│   └── style.css          — Full responsive UI
└── models/                — (future) glTF frame models

public/
└── index.html             — Demo page
```

## Roadmap
- [ ] Import real 3D frame models (glTF/GLB)
- [ ] Face shape detection & frame recommendations
- [ ] Lens tint/gradient preview
- [ ] Multi-face support
- [ ] Share to social media
- [ ] Integration API for e-commerce platforms
