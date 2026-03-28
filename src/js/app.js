/**
 * app.js
 * Main application — wires FaceTracker + ARRenderer + PDMeasurer + UI
 */

(function () {
    'use strict';

    // === Instances ===
    const faceTracker = new FaceTracker();
    const pdMeasurer = new PDMeasurer();
    let arRenderer = null;
    let currentModelId = 'aviator';
    let fpsFrames = 0;
    let fpsLastTime = performance.now();

    // === DOM refs ===
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const arCanvas = document.getElementById('ar-canvas');
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
    function onFaceResults(faceData) {
        // Update AR overlay
        arRenderer.update(faceData);

        // Update PD if measuring
        if (pdMeasurer.isActive && faceData) {
            const result = pdMeasurer.measure(faceData);
            if (result) {
                pdValue.textContent = `PD: ${result.pdMm}mm (${result.confidence}%)`;
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

        // Color picker toggle
        const btnColor = document.getElementById('btn-color');
        btnColor.addEventListener('click', () => {
            colorPicker.classList.toggle('hidden');
            btnColor.classList.toggle('active');
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

        // Close color picker on outside click
        document.addEventListener('click', (e) => {
            if (!colorPicker.contains(e.target) && !document.getElementById('btn-color').contains(e.target)) {
                colorPicker.classList.add('hidden');
                document.getElementById('btn-color').classList.remove('active');
            }
        });

        // Handle resize
        window.addEventListener('resize', () => {
            arRenderer._resize();
        });
    }

    // === Start ===
    init().catch(console.error);
})();
