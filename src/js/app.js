/**
 * app.js — STRIPPED BACK TO BASICS
 * Just: camera → face tracking → glasses on face
 * No calibration, no overlays, no fancy stuff
 */

(function () {
    'use strict';

    const faceTracker = new FaceTracker();
    let arRenderer = null;
    let currentModelId = 'aviator';

    // DOM
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const arCanvas = document.getElementById('ar-canvas');
    const webcam = document.getElementById('webcam');
    const frameList = document.getElementById('frame-list');
    const fpsCounter = document.getElementById('fps-counter');

    let fpsFrames = 0;
    let fpsLastTime = performance.now();

    async function init() {
        try {
            loadingText.textContent = 'Loading AR engine...';

            // Init renderer
            arRenderer = new ARRenderer(arCanvas);

            // Build frame selector
            buildFrameSelector();

            // Load default glasses
            arRenderer.setGlasses(currentModelId);

            loadingText.textContent = 'Starting camera...';

            // Init face tracker — this starts the camera
            await faceTracker.init(webcam, onFaceResults);

            loadingText.textContent = 'Ready!';

            // Hide loading screen — GO STRAIGHT TO AR
            setTimeout(() => {
                loadingScreen.classList.add('fade-out');
                setTimeout(() => loadingScreen.style.display = 'none', 500);
            }, 300);

            // Hide calibration screen if it exists
            const calibScreen = document.getElementById('calibration-screen');
            if (calibScreen) calibScreen.style.display = 'none';

            // Show AR controls
            const controlsWrap = document.getElementById('ar-controls-wrap');
            if (controlsWrap) controlsWrap.classList.remove('hidden');

            bindEvents();

            console.log('✅ AR initialized successfully');

        } catch (err) {
            console.error('Init failed:', err);
            loadingText.textContent = 'Error: ' + (err.message || 'Camera access failed. Allow camera and reload.');
        }
    }

    // === FACE TRACKING CALLBACK — runs every frame ===
    function onFaceResults(faceData) {
        // Update glasses
        arRenderer.update(faceData);

        // FPS
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLastTime >= 1000) {
            fpsCounter.textContent = `${fpsFrames} FPS`;
            fpsFrames = 0;
            fpsLastTime = now;
        }
    }

    // === Frame selector ===
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
    }

    // === Events ===
    function bindEvents() {
        // Camera flip
        const flipBtn = document.getElementById('btn-camera-flip');
        if (flipBtn) flipBtn.addEventListener('click', async () => {
            await faceTracker.flipCamera();
            webcam.style.transform = faceTracker.currentFacing === 'user' ? 'scaleX(-1)' : 'none';
        });

        // Screenshot
        const ssBtn = document.getElementById('btn-screenshot');
        if (ssBtn) ssBtn.addEventListener('click', () => {
            const dataUrl = arRenderer.takeScreenshot();
            const screenshotImg = document.getElementById('screenshot-img');
            if (screenshotImg) {
                screenshotImg.src = dataUrl;
                document.getElementById('screenshot-download').href = dataUrl;
                document.getElementById('screenshot-preview').classList.remove('hidden');
            }
        });
        const ssClose = document.getElementById('screenshot-close');
        if (ssClose) ssClose.addEventListener('click', () => {
            document.getElementById('screenshot-preview').classList.add('hidden');
        });

        // Color swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                arRenderer.setColor(swatch.dataset.color);
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });

        // Lens options
        document.querySelectorAll('.lens-option').forEach(opt => {
            opt.addEventListener('click', () => {
                arRenderer.setLensTint(opt.dataset.lens);
                document.querySelectorAll('.lens-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // Toggle buttons
        const btnColor = document.getElementById('btn-color');
        const colorPicker = document.getElementById('color-picker');
        const btnLens = document.getElementById('btn-lens');
        const lensPicker = document.getElementById('lens-picker');

        if (btnColor && colorPicker) {
            btnColor.addEventListener('click', () => {
                colorPicker.classList.toggle('hidden');
                if (lensPicker) lensPicker.classList.add('hidden');
            });
        }
        if (btnLens && lensPicker) {
            btnLens.addEventListener('click', () => {
                lensPicker.classList.toggle('hidden');
                if (colorPicker) colorPicker.classList.add('hidden');
            });
        }

        // Swipe
        const catalog = GlassesModels.catalog;
        new GestureHandler(document.getElementById('ar-container'), {
            onSwipeLeft: () => {
                const idx = catalog.findIndex(m => m.id === currentModelId);
                selectFrame(catalog[(idx + 1) % catalog.length].id);
            },
            onSwipeRight: () => {
                const idx = catalog.findIndex(m => m.id === currentModelId);
                selectFrame(catalog[(idx - 1 + catalog.length) % catalog.length].id);
            },
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const idx = catalog.findIndex(m => m.id === currentModelId);
                const next = e.key === 'ArrowRight' ? (idx + 1) % catalog.length : (idx - 1 + catalog.length) % catalog.length;
                selectFrame(catalog[next].id);
            }
        });

        // Close pickers on outside click
        document.addEventListener('click', (e) => {
            if (colorPicker && !colorPicker.contains(e.target) && btnColor && !btnColor.contains(e.target)) {
                colorPicker.classList.add('hidden');
            }
            if (lensPicker && !lensPicker.contains(e.target) && btnLens && !btnLens.contains(e.target)) {
                lensPicker.classList.add('hidden');
            }
        });

        window.addEventListener('resize', () => arRenderer._resize());
    }

    init();
})();
