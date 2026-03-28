/**
 * app.js
 * Main application — wires FaceTracker + ARRenderer + PDMeasurer + UI
 */

(function () {
    'use strict';

    // === Instances ===
    const faceTracker = new FaceTracker();
    const pdMeasurer = new PDMeasurer();
    const faceShapeDetector = new FaceShapeDetector();
    let arRenderer = null;
    let faceShapeActive = false;
    let currentModelId = 'aviator';
    let fpsFrames = 0;
    let fpsLastTime = performance.now();

    // === DOM refs ===
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
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

    // === Init ===
    async function init() {
        loadingText.textContent = 'Loading AR engine...';

        // Init renderer
        arRenderer = new ARRenderer(arCanvas);

        // Build frame selector
        buildFrameSelector();

        // Load default glasses
        arRenderer.setGlasses(currentModelId);

        loadingText.textContent = 'Starting camera...';

        // Init face tracker
        try {
            await faceTracker.init(webcam, onFaceResults);
        } catch (err) {
            loadingText.textContent = 'Camera access denied. Please allow camera.';
            console.error('FaceTracker init failed:', err);
            return;
        }

        loadingText.textContent = 'Ready!';

        // Fade out loading screen
        setTimeout(() => {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => loadingScreen.style.display = 'none', 500);
        }, 300);

        // Bind UI events
        bindEvents();
    }

    // === Face results callback ===
    let noFaceFrames = 0;
    const noFaceHint = document.getElementById('no-face-hint');

    function onFaceResults(faceData) {
        // Update AR overlay
        arRenderer.update(faceData);

        // No-face hint (show after 60 frames = ~2 seconds without face)
        if (!faceData) {
            noFaceFrames++;
            if (noFaceFrames > 60) {
                noFaceHint.classList.remove('hidden');
            }
        } else {
            noFaceFrames = 0;
            noFaceHint.classList.add('hidden');
        }

        // Update face shape analysis
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
                
                // Click recommended frame to try it
                recContainer.querySelectorAll('.rec-tag').forEach(tag => {
                    tag.addEventListener('click', () => selectFrame(tag.dataset.id));
                });
            }
        }

        // Update PD if measuring
        if (pdMeasurer.isActive && faceData) {
            const result = pdMeasurer.measure(faceData);
            if (result) {
                pdValue.textContent = `PD: ${result.pdMm}mm (${result.confidence}%)`;
            }
            // Draw PD overlay
            overlayCanvas.width = overlayCanvas.clientWidth;
            overlayCanvas.height = overlayCanvas.clientHeight;
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            pdMeasurer.drawOverlay(overlayCtx, faceData, overlayCanvas.width, overlayCanvas.height);
        } else {
            // Clear overlay when PD not active
            if (overlayCanvas.width > 0) {
                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            }
        }

        // FPS counter
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLastTime >= 1000) {
            fpsCounter.textContent = `${fpsFrames} FPS`;
            fpsFrames = 0;
            fpsLastTime = now;
        }
    }

    // === Build Frame Selector ===
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

        // Update active state
        document.querySelectorAll('.frame-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id === modelId);
        });

        // Update 3D glasses
        const spec = GlassesModels.catalog.find(m => m.id === modelId);
        arRenderer.setGlasses(modelId, arRenderer.currentColor || spec.defaultColor);

        // Close color picker if open
        colorPicker.classList.add('hidden');
    }

    // === Bind Events ===
    function bindEvents() {
        // Camera flip
        document.getElementById('btn-camera-flip').addEventListener('click', async () => {
            await faceTracker.flipCamera();
            // Un-mirror for rear camera
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

        // Face shape toggle
        const btnFaceShape = document.getElementById('btn-face-shape');
        const faceShapeResult = document.getElementById('face-shape-result');
        btnFaceShape.addEventListener('click', () => {
            faceShapeActive = !faceShapeActive;
            btnFaceShape.classList.toggle('active');
            if (faceShapeActive) {
                faceShapeDetector.reset();
                faceShapeResult.classList.remove('hidden');
                document.getElementById('shape-label').textContent = 'Analyzing...';
                document.getElementById('shape-tip').textContent = 'Hold still for a moment';
                document.getElementById('shape-recommended').innerHTML = '';
            } else {
                faceShapeResult.classList.add('hidden');
            }
        });

        // Lens picker toggle
        const btnLens = document.getElementById('btn-lens');
        const lensPicker = document.getElementById('lens-picker');
        btnLens.addEventListener('click', () => {
            lensPicker.classList.toggle('hidden');
            btnLens.classList.toggle('active');
            // Close color picker if open
            colorPicker.classList.add('hidden');
            document.getElementById('btn-color').classList.remove('active');
        });

        // Lens options
        document.querySelectorAll('.lens-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const lensId = opt.dataset.lens;
                arRenderer.setLensTint(lensId);
                document.querySelectorAll('.lens-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // Color picker toggle
        const btnColor = document.getElementById('btn-color');
        btnColor.addEventListener('click', () => {
            colorPicker.classList.toggle('hidden');
            btnColor.classList.toggle('active');
            // Close lens picker if open
            lensPicker.classList.add('hidden');
            btnLens.classList.remove('active');
        });

        // Color swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                arRenderer.setColor(color);

                // Update active swatch
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });

        // Close pickers on outside click
        document.addEventListener('click', (e) => {
            if (!colorPicker.contains(e.target) && !document.getElementById('btn-color').contains(e.target)) {
                colorPicker.classList.add('hidden');
                document.getElementById('btn-color').classList.remove('active');
            }
            if (!lensPicker.contains(e.target) && !btnLens.contains(e.target)) {
                lensPicker.classList.add('hidden');
                btnLens.classList.remove('active');
            }
        });

        // Handle resize
        window.addEventListener('resize', () => {
            arRenderer._resize();
        });

        // === Swipe gestures for frame switching ===
        const catalog = GlassesModels.catalog;
        
        function nextFrame() {
            const idx = catalog.findIndex(m => m.id === currentModelId);
            const next = catalog[(idx + 1) % catalog.length];
            selectFrame(next.id);
            scrollToActiveFrame();
        }

        function prevFrame() {
            const idx = catalog.findIndex(m => m.id === currentModelId);
            const prev = catalog[(idx - 1 + catalog.length) % catalog.length];
            selectFrame(prev.id);
            scrollToActiveFrame();
        }

        function scrollToActiveFrame() {
            const active = document.querySelector('.frame-card.active');
            if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        new GestureHandler(document.getElementById('ar-container'), {
            onSwipeLeft: nextFrame,
            onSwipeRight: prevFrame,
        });

        // Keyboard: arrow keys
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') prevFrame();
            if (e.key === 'ArrowRight') nextFrame();
        });
    }

    // === Start ===
    init().catch(console.error);
})();
