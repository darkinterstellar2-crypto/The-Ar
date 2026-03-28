# AR Try-On Roadmap

## Phase 1: Foundation (Day 1) ✅
- [x] Project structure & repo setup
- [x] MediaPipe FaceMesh integration (468 landmarks + iris)
- [x] Three.js renderer with orthographic camera
- [x] Procedural 3D glasses models (6 styles)
- [x] Basic face tracking → glasses placement
- [x] UI shell (frame selector, color picker, controls)

## Phase 2: Core Quality (Day 1-2)
- [ ] Test & fix glasses positioning accuracy
- [ ] Calibrate scale to match real face proportions
- [ ] Fix nose bridge alignment (glasses should sit ON the nose)
- [ ] Tune smoothing factor for jitter vs responsiveness
- [ ] Fix mirroring consistency (webcam mirror + 3D mirror)
- [ ] Test on mobile browser (iOS Safari, Android Chrome)
- [ ] Handle edge cases: partial face, side profile, multiple faces

## Phase 3: Visual Polish (Day 2-3)
- [ ] Add shadows under glasses (drop shadow on face)
- [ ] Lens tint/gradient options (clear, sun, blue-light)
- [ ] Improve frame geometry (rounded corners, realistic thickness)
- [ ] Add nose pads detail
- [ ] Temple arms follow ear position from landmarks
- [ ] Better lighting that matches webcam lighting conditions
- [ ] Anti-aliasing & rendering quality pass

## Phase 4: UX & Interaction (Day 3-4)
- [ ] Swipe gesture for frame switching
- [ ] Size adjustment slider (narrow/wide face)
- [ ] Comparison mode (side-by-side two styles)
- [ ] "Looks good on you" — face shape detection + recommendation
- [ ] Loading states & error handling polish
- [ ] Haptic feedback on mobile

## Phase 5: PD Measurement Polish (Day 4-5)
- [ ] Calibration guide (hold phone at arm's length)
- [ ] Visual overlay showing measurement lines
- [ ] Accuracy validation against known PD values
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
