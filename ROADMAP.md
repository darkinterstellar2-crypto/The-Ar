# AR Try-On Roadmap

## Phase 1: Foundation (Day 1) ✅
- [x] Project structure & repo setup
- [x] MediaPipe FaceMesh integration (468 landmarks + iris)
- [x] Three.js renderer with orthographic camera
- [x] Procedural 3D glasses models (6 styles)
- [x] Basic face tracking → glasses placement
- [x] UI shell (frame selector, color picker, controls)

## Phase 2: Core Quality (Day 1-2) ✅
- [x] Improved glasses positioning (nose bridge Y alignment)
- [x] Calibrated scale factor (eyeWidth * 6.0)
- [x] Better rotation: Z-depth yaw, forehead-chin pitch, eye-line roll
- [x] Tuned smoothing (0.35), dampened pitch
- [x] YXZ rotation order for natural movement
- [x] Smooth fade in/out on face detect/loss
- [x] No-face hint after 2 seconds

## Phase 3: Visual Polish (Day 2-3) ✅
- [x] Lens tint system (8 options: clear, grey, brown, green, blue-light, mirror, gradient, rosé)
- [x] Improved frame geometry (rounded corners, proper inner/outer radii)
- [x] Nose pads with pad arms for metal frames
- [x] Smoother circle geometry (48 segments)
- [x] Double bridge for aviator
- [ ] Add shadows under glasses (drop shadow on face)
- [ ] Better lighting that matches webcam conditions
- [ ] Anti-aliasing & rendering quality pass

## Phase 4: UX & Interaction (Day 3-4) ✅
- [x] Swipe gesture for frame switching (touch + mouse)
- [x] Keyboard arrow keys navigation
- [x] Comparison mode (side-by-side snapshots)
- [x] Face shape detection + frame recommendations (6 shapes)
- [x] Swipe hint on first load
- [ ] Size adjustment slider (narrow/wide face)
- [ ] Loading states & error handling polish
- [ ] Haptic feedback on mobile

## Phase 5: PD Measurement Polish (Day 4-5) ✅
- [x] Visual overlay with crosshairs + measurement line + mm label
- [x] Iris-based measurement (11.7mm reference)
- [x] Trimmed-mean averaging for stability
- [ ] Calibration guide (hold phone at arm's length)
- [ ] Export PD to clipboard / prescription card

## Phase 6: Real Frame Models (Day 5-7)
- [ ] glTF/GLB import pipeline
- [ ] Create 3-5 realistic frame models in Blender
- [ ] Texture mapping (acetate, metal, tortoiseshell)
- [ ] Frame dimension metadata (real mm sizes)

## Phase 7: Integration Ready (Week 2)
- [ ] Embeddable widget mode (iframe / web component)
- [ ] API: loadFrame(modelUrl), getScreenshot(), getPD()
- [ ] E-commerce integration hooks (add-to-cart callback)
- [ ] Analytics events (frame viewed, screenshot taken, PD measured)

## Phase 8: Performance & Production (Week 2-3)
- [ ] Lazy-load MediaPipe (reduce initial bundle)
- [ ] WebWorker for face detection (off main thread)
- [ ] FPS optimization pass (<16ms frame budget)
- [ ] CDN deployment
- [ ] HTTPS setup for camera access
