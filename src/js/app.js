/**
 * app.js
 * Main application with calibration-first flow
 * 
 * Flow:
 * 1. Loading → camera init
 * 2. Calibration → face guide circle → capture selfie → analyze
 * 3. AR Session → live glasses try-on with calibrated data
 */

(function () {
    'use strict';

    // === Instances ===
    const faceTracker = new FaceTracker();
    const calibration = new Calibration();
    const pdMeasurer = new PDMeasurer();
    const faceShapeDetector = new FaceShapeDetector();
    let arRenderer = null;
    let currentModelId = 'aviator';
    let faceShapeActive = false;

    // State
    let appState = 'loading'; // loading → calibrating → ar
    let fpsFrames = 0;
    let fpsLastTime = performance.now();
    let lastFaceData = null;

    // === DOM refs ===
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const calibScreen = document.getElementById('calibration-screen');
    const arCanvas = document.getElementById('ar-canvas');
    const overlayCanvas = document.getElementById('overlay-canvas');
    const overlayCtx = overlayCanvas.getContext('2d');
    const webcam = document.getElementById('webcam');
    const frameList = document.getElementById('frame-list');
    const fpsCounter = document.getElementById('fps-counter');
    const pdDisplay = document.getElementById('pd-display');
    const pdValue = document.getElementById('pd-value');
    const colorPicker = document.getElementById('color-picker');
    const screenshotPreview = document.getElementById('screenshot-preview');
    const screenshotImg = document.getElementById('screenshot-img');
    const noFaceHint = document.getElementById('no-face-hint');

    // === Init ===
    async function init() {
        loadingText.textContent = 'Loading AR engine...';

        arRenderer = new ARRenderer(arCanvas);
        buildFrameSelector();
        arRenderer.setGlasses(currentModelId);

        loadingText.textContent = 'Starting camera...';

        try {
            await faceTracker.init(webcam, onFaceResults);
        } catch (err) {
            console.error('FaceTracker init failed:', err);
            if (err.name === 'NotAllowedError') {
                loadingText.innerHTML = '<strong>Camera access denied</strong><br><span style="font-size:12px;opacity:0.7;">Allow camera access and reload.</span>';
            } else if (err.name === 'NotFoundError') {
                loadingText.innerHTML = '<strong>No camera found</strong><br><span style="font-size:12px;opacity:0.7;">Connect a webcam or use a device with a camera.</span>';
            } else {
                loadingText.innerHTML = `<strong>Error</strong><br><span style="font-size:12px;opacity:0.7;">${err.message || 'Unknown error'}</span>`;
            }
            return;
        }

        // Transition to calibration
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            startCalibration();
        }, 400);

        bindEvents();
    }

    // === CALIBRATION PHASE ===
    function startCalibration() {
        appState = 'calibrating';
        calibScreen.classList.remove('hidden');
        document.getElementById('ar-controls-wrap').classList.add('hidden');
    }

    function onCaptureCalibration() {
        if (!lastFaceData || !lastFaceData.landmarks) {
            document.getElementById('calib-status').textContent = '⚠ No face detected. Look at the camera.';
            return;
        }

        const result = calibration.analyze(
            lastFaceData.landmarks,
            lastFaceData.imageWidth,
            lastFaceData.imageHeight
        );

        console.log('Calibration result:', result);

        // Always proceed — quality check is advisory, not blocking
        arRenderer.setCalibration(result);

        // Show results briefly
        const qualityNote = result.qualityPassed ? '✓' : '⚠ (try better lighting next time)';
        document.getElementById('calib-status').textContent = 
            `PD: ${result.pdMm}mm · Face: ${result.faceShape} · ${qualityNote}`;
        document.getElementById('calib-capture-btn').textContent = 'Starting...';

        setTimeout(() => {
            startARSession();
        }, 800);
    }

    function skipCalibration() {
        // Skip calibration — AR uses fallback eye-width scaling
        console.log('Calibration skipped');
        startARSession();
    }

    function startARSession() {
        appState = 'ar';
        
        // Hide calibration screen
        calibScreen.classList.add('hidden');
        
        // Clear the overlay canvas (remove calibration guide drawing)
        overlayCanvas.width = overlayCanvas.clientWidth;
        overlayCanvas.height = overlayCanvas.clientHeight;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Show AR controls
        document.getElementById('ar-controls-wrap').classList.remove('hidden');
        
        // Make sure glasses are loaded
        if (!arRenderer.glassesGroup) {
            arRenderer.setGlasses(currentModelId);
        }
        
        console.log('AR session started. Calibration:', calibration.getResult());
    }

    // === FACE RESULTS CALLBACK (runs every frame) ===
    let noFaceFrames = 0;

    function onFaceResults(faceData) {
        lastFaceData = faceData;

        // FPS counter (always runs)
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLastTime >= 1000) {
            fpsCounter.textContent = `${fpsFrames} FPS`;
            fpsFrames = 0;
            fpsLastTime = now;
        }

        if (appState === 'calibrating') {
            drawCalibrationGuide(faceData);
            return;
        }

        if (appState !== 'ar') return;

        // AR mode: update glasses
        arRenderer.update(faceData);

        // No-face hint
        if (!faceData) {
            noFaceFrames++;
            if (noFaceFrames > 60) noFaceHint.classList.remove('hidden');
        } else {
            noFaceFrames = 0;
            noFaceHint.classList.add('hidden');
        }

        // Face shape analysis
        if (faceShapeActive && faceData) {
            const result = faceShapeDetector.analyze(faceData);
            if (result && result.sampleCount >= 15) {
                document.getElementById('shape-label').textContent = result.label;
                document.getElementById('shape-confidence').textContent = `${result.confidence}%`;
                document.getElementById('shape-tip').textContent = result.tip;
                const recContainer = document.getElementById('shape-recommended');
                recContainer.innerHTML = result.bestFrames.map(id => {
                    const model = GlassesModels.catalog.find(m => m.id === id);
                    return model ? `<span class="rec-tag" data-id="${id}">✓ ${model.name}</span>` : '';
                }).join('');
                recContainer.querySelectorAll('.rec-tag').forEach(tag => {
                    tag.addEventListener('click', () => selectFrame(tag.dataset.id));
                });
            }
        }

        // PD measurement
        if (pdMeasurer.isActive && faceData) {
            const result = pdMeasurer.measure(faceData);
            if (result) {
                pdValue.textContent = `PD: ${result.pdMm}mm (${result.confidence}%)`;
            }
            overlayCanvas.width = overlayCanvas.clientWidth;
            overlayCanvas.height = overlayCanvas.clientHeight;
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            pdMeasurer.drawOverlay(overlayCtx, faceData, overlayCanvas.width, overlayCanvas.height);
        } else if (appState === 'ar') {
            if (overlayCanvas.width > 0) {
                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            }
        }

    }

    // === CALIBRATION GUIDE DRAWING ===
    function drawCalibrationGuide(faceData) {
        overlayCanvas.width = overlayCanvas.clientWidth;
        overlayCanvas.height = overlayCanvas.clientHeight;
        const ctx = overlayCtx;
        const cw = overlayCanvas.width;
        const ch = overlayCanvas.height;
        ctx.clearRect(0, 0, cw, ch);

        // Draw face guide OVAL (taller than wide, like a face)
        const cx = cw / 2;
        const cy = ch * 0.40;
        const rx = Math.min(cw, ch) * 0.22; // horizontal radius
        const ry = rx * 1.35; // vertical radius — oval shaped like a face

        // Dim outside the oval
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, cw, ch);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Oval border
        const faceInCircle = faceData && isFaceInOval(faceData, cx, cy, rx, ry, cw, ch);
        ctx.strokeStyle = faceInCircle ? '#00ff88' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Status text
        const statusEl = document.getElementById('calib-status');
        if (!faceData) {
            statusEl.textContent = 'Position your face in the circle';
        } else if (!faceInCircle) {
            statusEl.textContent = 'Move your face into the circle';
        } else {
            statusEl.textContent = 'Perfect! Tap capture when ready';
            document.getElementById('calib-capture-btn').disabled = false;
        }
    }

    function isFaceInOval(faceData, cx, cy, rx, ry, cw, ch) {
        const fx = (1 - faceData.position.x) * cw;
        const fy = faceData.position.y * ch;
        // Point inside ellipse: (x-cx)²/rx² + (y-cy)²/ry² < 1
        return ((fx - cx) ** 2 / (rx * rx) + (fy - cy) ** 2 / (ry * ry)) < 0.6;
    }

    // === BUILD FRAME SELECTOR ===
    function buildFrameSelector() {
        frameList.innerHTML = '';
        GlassesModels.catalog.forEach((model) => {
            const card = document.createElement('div');
            card.className = 'frame-card' + (model.id === currentModelId ? ' active' : '');
            card.dataset.id = model.id;
            card.innerHTML = `
                <svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path d="${model.icon}"/>
                </svg>
                <span>${model.name}</span>
            `;
            card.addEventListener('click', () => selectFrame(model.id));
            frameList.appendChild(card);
        });
    }

    function selectFrame(modelId) {
        currentModelId = modelId;
        document.querySelectorAll('.frame-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id === modelId);
        });
        const spec = GlassesModels.catalog.find(m => m.id === modelId);
        arRenderer.setGlasses(modelId, arRenderer.currentColor || spec.defaultColor);
        colorPicker.classList.add('hidden');
    }

    // === BIND EVENTS ===
    function bindEvents() {
        // Calibration
        document.getElementById('calib-capture-btn').addEventListener('click', onCaptureCalibration);
        document.getElementById('calib-skip-btn').addEventListener('click', skipCalibration);

        // Camera flip
        document.getElementById('btn-camera-flip').addEventListener('click', async () => {
            await faceTracker.flipCamera();
            webcam.style.transform = faceTracker.currentFacing === 'user' ? 'scaleX(-1)' : 'none';
        });

        // Screenshot
        document.getElementById('btn-screenshot').addEventListener('click', () => {
            const dataUrl = arRenderer.takeScreenshot();
            screenshotImg.src = dataUrl;
            document.getElementById('screenshot-download').href = dataUrl;
            screenshotPreview.classList.remove('hidden');
        });
        document.getElementById('screenshot-close').addEventListener('click', () => {
            screenshotPreview.classList.add('hidden');
        });

        // PD Measurement
        const btnPD = document.getElementById('btn-pd');
        btnPD.addEventListener('click', () => {
            if (pdMeasurer.isActive) {
                pdMeasurer.stop();
                btnPD.classList.remove('active');
                pdDisplay.classList.add('hidden');
            } else {
                pdMeasurer.start();
                btnPD.classList.add('active');
                pdDisplay.classList.remove('hidden');
                pdValue.textContent = 'PD: Measuring...';
            }
        });

        // PD Copy
        document.getElementById('pd-copy').addEventListener('click', () => {
            const result = pdMeasurer.getResult();
            if (result) {
                const text = `PD: ${result.pdMm}mm`;
                navigator.clipboard.writeText(text).then(() => {
                    const btn = document.getElementById('pd-copy');
                    btn.textContent = '✓';
                    btn.classList.add('copied');
                    setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied'); }, 2000);
                }).catch(() => prompt('Copy your PD:', text));
            }
        });

        // Face shape
        const btnFaceShape = document.getElementById('btn-face-shape');
        const faceShapeResult = document.getElementById('face-shape-result');
        btnFaceShape.addEventListener('click', () => {
            faceShapeActive = !faceShapeActive;
            btnFaceShape.classList.toggle('active');
            if (faceShapeActive) {
                faceShapeDetector.reset();
                faceShapeResult.classList.remove('hidden');
                document.getElementById('shape-label').textContent = 'Analyzing...';
                document.getElementById('shape-tip').textContent = 'Hold still';
                document.getElementById('shape-recommended').innerHTML = '';
            } else {
                faceShapeResult.classList.add('hidden');
            }
        });

        // Compare mode
        const btnCompare = document.getElementById('btn-compare');
        const comparePanel = document.getElementById('compare-panel');
        let compareFilling = 0;

        btnCompare.addEventListener('click', () => {
            const dataUrl = arRenderer.takeScreenshot();
            const leftCanvas = document.getElementById('compare-canvas-left');
            const leftCtx = leftCanvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                leftCanvas.width = img.width; leftCanvas.height = img.height;
                leftCtx.drawImage(img, 0, 0);
                document.getElementById('compare-label-left').textContent =
                    GlassesModels.catalog.find(m => m.id === currentModelId)?.name || currentModelId;
            };
            img.src = dataUrl;
            compareFilling = 1;
            comparePanel.classList.remove('hidden');
            document.getElementById('compare-label-right').textContent = 'Pick another frame ↓';
        });

        document.getElementById('compare-close').addEventListener('click', () => {
            comparePanel.classList.add('hidden');
            compareFilling = 0;
        });

        // Override selectFrame for compare
        const origSelect = selectFrame;
        selectFrame = function(modelId) {
            origSelect(modelId);
            if (compareFilling === 1 && !comparePanel.classList.contains('hidden')) {
                setTimeout(() => {
                    const dataUrl = arRenderer.takeScreenshot();
                    const rightCanvas = document.getElementById('compare-canvas-right');
                    const rightCtx = rightCanvas.getContext('2d');
                    const img = new Image();
                    img.onload = () => {
                        rightCanvas.width = img.width; rightCanvas.height = img.height;
                        rightCtx.drawImage(img, 0, 0);
                        document.getElementById('compare-label-right').textContent =
                            GlassesModels.catalog.find(m => m.id === modelId)?.name || modelId;
                    };
                    img.src = dataUrl;
                    compareFilling = 0;
                }, 500);
            }
        };

        // Lens picker
        const btnLens = document.getElementById('btn-lens');
        const lensPicker = document.getElementById('lens-picker');
        btnLens.addEventListener('click', () => {
            lensPicker.classList.toggle('hidden');
            btnLens.classList.toggle('active');
            colorPicker.classList.add('hidden');
        });
        document.querySelectorAll('.lens-option').forEach(opt => {
            opt.addEventListener('click', () => {
                arRenderer.setLensTint(opt.dataset.lens);
                document.querySelectorAll('.lens-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // Color picker
        const btnColor = document.getElementById('btn-color');
        btnColor.addEventListener('click', () => {
            colorPicker.classList.toggle('hidden');
            btnColor.classList.toggle('active');
            lensPicker.classList.add('hidden');
        });
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                arRenderer.setColor(swatch.dataset.color);
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });

        // Close pickers on outside click
        document.addEventListener('click', (e) => {
            if (!colorPicker.contains(e.target) && !document.getElementById('btn-color').contains(e.target))
                { colorPicker.classList.add('hidden'); document.getElementById('btn-color').classList.remove('active'); }
            if (lensPicker && !lensPicker.contains(e.target) && !btnLens.contains(e.target))
                { lensPicker.classList.add('hidden'); btnLens.classList.remove('active'); }
        });

        // Swipe gestures
        const catalog = GlassesModels.catalog;
        function nextFrame() {
            const idx = catalog.findIndex(m => m.id === currentModelId);
            selectFrame(catalog[(idx + 1) % catalog.length].id);
            const active = document.querySelector('.frame-card.active');
            if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        function prevFrame() {
            const idx = catalog.findIndex(m => m.id === currentModelId);
            selectFrame(catalog[(idx - 1 + catalog.length) % catalog.length].id);
            const active = document.querySelector('.frame-card.active');
            if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        new GestureHandler(document.getElementById('ar-container'), { onSwipeLeft: nextFrame, onSwipeRight: prevFrame });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') prevFrame();
            if (e.key === 'ArrowRight') nextFrame();
        });

        window.addEventListener('resize', () => arRenderer._resize());
    }

    // === Start ===
    init().catch(console.error);
})();
