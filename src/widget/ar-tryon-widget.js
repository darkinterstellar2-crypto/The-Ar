/**
 * ar-tryon-widget.js
 * Self-contained embeddable AR Glasses Try-On Widget
 * 
 * Dependencies loaded dynamically:
 *   - @mediapipe/face_mesh
 *   - @mediapipe/camera_utils
 *   - three.js r128
 *   - one-euro-filter.js
 *   - gestures.js
 *   - glasses-models.js
 *   - face-tracker.js
 *   - ar-renderer.js
 * 
 * Usage:
 *   const widget = new ARTryOnWidget(containerEl, { theme: { primary: '#D4A373' } });
 *   await widget.init();
 */

(function (global) {
  'use strict';

  // ─── Script path detection (resolve relative JS/CSS paths) ──────────────────
  const _scriptEl = document.currentScript;
  const _scriptSrc = _scriptEl ? _scriptEl.src : '';
  const _widgetDir = _scriptSrc ? _scriptSrc.replace(/\/[^/]+$/, '/') : '';

  function _resolveAsset(path) {
    if (path.startsWith('http') || path.startsWith('//')) return path;
    return _widgetDir + path;
  }

  // CDN base for MediaPipe / Three
  const MEDIAPIPE_VERSION = '0.4.1633559619';
  const CAMERA_UTILS_VERSION = '0.3.1640029074';
  const THREE_VERSION = 'r128';

  const EXTERNAL_DEPS = [
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}/face_mesh.js`,
    `https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@${CAMERA_UTILS_VERSION}/camera_utils.js`,
    `https://cdnjs.cloudflare.com/ajax/libs/three.js/${THREE_VERSION}/three.min.js`,
  ];

  // Local AR source files — resolved relative to widget directory
  // In The-Ar project: ../js/*.js
  // In OptoNam/ar/widget/: ../js/*.js
  const LOCAL_DEPS = [
    '../js/one-euro-filter.js',
    '../js/gestures.js',
    '../js/glasses-models.js',
    '../js/face-tracker.js',
    '../js/ar-renderer.js',
  ];

  // ─── Dependency Loader ──────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if already loaded (by class name checks)
      if (src.includes('three.min') && global.THREE) return resolve();
      if (src.includes('face_mesh') && global.FaceMesh) return resolve();
      if (src.includes('camera_utils') && global.Camera) return resolve();
      if (src.includes('one-euro-filter') && global.OneEuroFilter) return resolve();
      if (src.includes('gestures') && global.GestureHandler) return resolve();
      if (src.includes('glasses-models') && global.GlassesModels) return resolve();
      if (src.includes('face-tracker') && global.FaceTracker) return resolve();
      if (src.includes('ar-renderer') && global.ARRenderer) return resolve();

      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadAllDeps(baseDir) {
    // Load external deps first (in parallel)
    await Promise.all(EXTERNAL_DEPS.map(loadScript));
    // Then load local deps in order (sequential, they depend on each other)
    for (const dep of LOCAL_DEPS) {
      await loadScript(baseDir + dep);
    }
  }

  // ─── Widget CSS injection ───────────────────────────────────────────────────
  function injectCSS(cssHref) {
    if (document.querySelector(`link[href="${cssHref}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.appendChild(link);
  }

  // ─── ARTryOnWidget ──────────────────────────────────────────────────────────
  class ARTryOnWidget {
    /**
     * @param {HTMLElement} containerElement
     * @param {Object} options
     * @param {number}  [options.width]
     * @param {number}  [options.height]
     * @param {boolean} [options.showControls=true]
     * @param {boolean} [options.showPD=true]
     * @param {string}  [options.defaultFrame='aviator']
     * @param {string}  [options.defaultColor]
     * @param {Object}  [options.theme]  { primary, secondary }
     * @param {string}  [options.baseDir]  Override base directory for local deps
     */
    constructor(containerElement, options = {}) {
      if (!containerElement) throw new Error('ARTryOnWidget: containerElement is required');

      this.container = containerElement;
      this.options = Object.assign({
        showControls: true,
        showPD: true,
        defaultFrame: 'aviator',
        defaultColor: null,
        theme: { primary: '#D4A373', secondary: '#0A2540' },
        baseDir: _widgetDir,
      }, options);

      // ── Internal state ──
      this._initialized = false;
      this._destroyed = false;
      this._currentFrame = this.options.defaultFrame;
      this._currentColor = this.options.defaultColor || null;
      this._currentLens = 'clear';
      this._faceDetected = false;
      this._pdMeasuring = false;
      this._pdResult = null;
      this._fpsFrames = 0;
      this._fpsLastTime = 0;
      this._noFaceTimer = null;

      // ── Instances ──
      this._faceTracker = null;
      this._arRenderer = null;
      this._pdMeasurer = null;
      this._gestureHandler = null;

      // ── DOM refs ──
      this._dom = {};

      // ── Event callbacks ──
      this._callbacks = {
        ready: [],
        frameChange: [],
        screenshot: [],
        pdMeasured: [],
        error: [],
        addToCart: [],
      };
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /**
     * Initialize: inject CSS, load deps, build UI, start camera
     */
    async init() {
      if (this._initialized) return;

      try {
        // Inject widget CSS
        const cssHref = _resolveAsset('ar-tryon-widget.css');
        injectCSS(cssHref);

        // Apply theme CSS vars
        const t = this.options.theme || {};
        if (t.primary) this.container.style.setProperty('--artw-primary', t.primary);
        if (t.secondary) this.container.style.setProperty('--artw-secondary', t.secondary);

        // Build UI scaffold
        this._buildUI();
        this._showLoading('Lade AR Engine…');

        // Load dependencies
        await loadAllDeps(this.options.baseDir);

        this._showLoading('Starte Kamera…');

        // Create AR instances
        this._pdMeasurer = new PDMeasurer();
        this._arRenderer = new ARRenderer(this._dom.canvas);

        // Patch ARRenderer to use our video element (not document.getElementById)
        this._patchARRenderer();

        // Build frame selector
        this._buildFrameSelector();

        // Set default frame
        const spec = GlassesModels.catalog.find(m => m.id === this._currentFrame);
        const color = this._currentColor || (spec && spec.defaultColor);
        this._arRenderer.setGlasses(this._currentFrame, color);
        this._currentColor = color;

        // Init face tracker
        this._faceTracker = new FaceTracker();
        await this._faceTracker.init(this._dom.video, (faceData) => this._onFaceResults(faceData));

        // Patch FaceTracker.flipCamera to use our video
        this._patchFaceTracker();

        // Gesture support
        this._gestureHandler = new GestureHandler(this._dom.arArea, {
          onSwipeLeft: () => this._cycleFrame(1),
          onSwipeRight: () => this._cycleFrame(-1),
        });

        this._hideLoading();
        this._initialized = true;
        this._emit('ready', { frameId: this._currentFrame, color: this._currentColor });

      } catch (err) {
        this._showError(err.message || 'Kamera konnte nicht gestartet werden.');
        this._emit('error', { message: err.message, error: err });
        throw err;
      }
    }

    /**
     * Switch glasses frame
     * @param {string} modelId
     * @param {string} [color]
     * @param {string} [lensType]
     */
    loadFrame(modelId, color, lensType) {
      if (!this._arRenderer) return;
      this._currentFrame = modelId;
      if (color) this._currentColor = color;
      const spec = GlassesModels.catalog.find(m => m.id === modelId);
      const resolvedColor = this._currentColor || (spec && spec.defaultColor);
      this._arRenderer.setGlasses(modelId, resolvedColor);
      this._currentColor = resolvedColor;
      if (lensType) {
        this._arRenderer.setLensTint(lensType);
        this._currentLens = lensType;
      }
      this._updateFrameSelector();
      this._emit('frameChange', { frameId: modelId, color: resolvedColor, lensType: this._currentLens });
    }

    /**
     * Capture screenshot
     * @returns {Promise<string>} base64 data URL
     */
    getScreenshot() {
      return new Promise((resolve, reject) => {
        if (!this._arRenderer) return reject(new Error('Widget not initialized'));
        try {
          const dataUrl = this._arRenderer.takeScreenshot();
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      });
    }

    /**
     * Get current PD measurement
     * @returns {{ left: number|null, right: number|null, total: number|null } | null}
     */
    getPD() {
      if (!this._pdResult) return null;
      const total = this._pdResult.pdMm;
      return {
        total,
        left: Math.round(total / 2 * 10) / 10,
        right: Math.round(total / 2 * 10) / 10,
      };
    }

    /**
     * Clean up everything
     */
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      if (this._faceTracker) this._faceTracker.destroy();
      if (this._arRenderer) this._arRenderer.destroy();
      if (this._gestureHandler) this._gestureHandler.destroy();
      if (this.container) this.container.innerHTML = '';
    }

    // ─── Events ─────────────────────────────────────────────────────────────

    onReady(cb) { this._callbacks.ready.push(cb); return this; }
    onFrameChange(cb) { this._callbacks.frameChange.push(cb); return this; }
    onScreenshot(cb) { this._callbacks.screenshot.push(cb); return this; }
    onPDMeasured(cb) { this._callbacks.pdMeasured.push(cb); return this; }
    onError(cb) { this._callbacks.error.push(cb); return this; }
    onAddToCart(cb) { this._callbacks.addToCart.push(cb); return this; }

    // ─── Private: UI Building ───────────────────────────────────────────────

    _buildUI() {
      this.container.innerHTML = '';
      this.container.style.position = 'relative';

      const wrap = document.createElement('div');
      wrap.className = 'artw-container';
      if (this.options.width) wrap.style.width = this.options.width + 'px';
      if (this.options.height) wrap.style.height = this.options.height + 'px';
      else wrap.style.height = '100%';

      // Apply theme
      const t = this.options.theme || {};
      if (t.primary) wrap.style.setProperty('--artw-primary', t.primary);
      if (t.secondary) wrap.style.setProperty('--artw-secondary', t.secondary);

      // ── Video
      const video = document.createElement('video');
      video.className = 'artw-video';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      this._dom.video = video;

      // ── AR Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'artw-canvas';
      this._dom.canvas = canvas;

      // ── PD Canvas
      const pdCanvas = document.createElement('canvas');
      pdCanvas.className = 'artw-pd-canvas';
      this._dom.pdCanvas = pdCanvas;

      // ── AR area (video + canvases grouped)
      const arArea = document.createElement('div');
      arArea.style.cssText = 'position:absolute;inset:0;';
      arArea.appendChild(video);
      arArea.appendChild(canvas);
      arArea.appendChild(pdCanvas);
      this._dom.arArea = arArea;

      // ── No face indicator
      const noFace = document.createElement('div');
      noFace.className = 'artw-no-face';
      noFace.textContent = 'Bitte in die Kamera schauen';
      this._dom.noFace = noFace;

      // ── Loading screen
      const loading = document.createElement('div');
      loading.className = 'artw-loading';
      loading.innerHTML = `<div class="artw-spinner"></div><p class="artw-loading-text">Lade AR Engine…</p>`;
      this._dom.loading = loading;
      this._dom.loadingText = loading.querySelector('.artw-loading-text');

      // ── Error screen
      const errorScreen = document.createElement('div');
      errorScreen.className = 'artw-error';
      errorScreen.style.display = 'none';
      errorScreen.innerHTML = `
        <div class="artw-error-icon">📷</div>
        <div class="artw-error-title">Kamera nicht verfügbar</div>
        <div class="artw-error-msg artw-err-msg-text"></div>
        <button class="artw-retry-btn">Erneut versuchen</button>
      `;
      errorScreen.querySelector('.artw-retry-btn').addEventListener('click', () => {
        errorScreen.style.display = 'none';
        this.init();
      });
      this._dom.errorScreen = errorScreen;
      this._dom.errorMsgText = errorScreen.querySelector('.artw-err-msg-text');

      // ── Top bar
      const topBar = document.createElement('div');
      topBar.className = 'artw-top-bar';

      const flipBtn = this._makeIconBtn(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-4-4m4 4l-4 4m4-4H10a7 7 0 00-7 7v1m4 4l4 4m-4-4l4-4m-4 4h10a7 7 0 007-7v-1"/></svg>`,
        'Kamera wechseln'
      );
      flipBtn.addEventListener('click', async () => {
        if (this._faceTracker) await this._faceTracker.flipCamera();
      });

      const fpsEl = document.createElement('span');
      fpsEl.className = 'artw-fps';
      fpsEl.textContent = '-- FPS';
      this._dom.fps = fpsEl;

      // Color picker toggle
      const colorBtn = this._makeIconBtn(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20"/></svg>`,
        'Farbe'
      );
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._togglePicker('color');
      });

      topBar.appendChild(flipBtn);
      topBar.appendChild(fpsEl);
      topBar.appendChild(colorBtn);
      this._dom.topBar = topBar;

      // ── Color Picker
      const colorPicker = document.createElement('div');
      colorPicker.className = 'artw-picker';
      colorPicker.id = 'artw-color-picker';
      colorPicker.innerHTML = `<div class="artw-picker-title">Rahmenfarbe</div><div class="artw-color-grid"></div>`;
      this._dom.colorPicker = colorPicker;
      this._dom.colorGrid = colorPicker.querySelector('.artw-color-grid');

      const colors = ['#1a1a1a','#8B4513','#C0C0C0','#FFD700','#1E3A5F','#8B0000','#2F4F4F','#FF69B4','#4169E1','#D4A373','#FF4500','#800080'];
      colors.forEach(c => {
        const sw = document.createElement('button');
        sw.className = 'artw-color-swatch';
        sw.style.background = c;
        sw.dataset.color = c;
        sw.addEventListener('click', () => {
          this._arRenderer.setColor(c);
          this._currentColor = c;
          this._dom.colorGrid.querySelectorAll('.artw-color-swatch').forEach(s => s.classList.remove('active'));
          sw.classList.add('active');
        });
        this._dom.colorGrid.appendChild(sw);
      });

      // ── Lens Picker
      const lensPicker = document.createElement('div');
      lensPicker.className = 'artw-picker';
      lensPicker.style.left = 'auto';
      lensPicker.style.right = '12px';
      lensPicker.innerHTML = `<div class="artw-picker-title">Gläser</div><div class="artw-lens-grid"></div>`;
      this._dom.lensPicker = lensPicker;

      const lensOptions = [
        { id: 'clear',      label: 'Klar',     style: 'background:transparent;border:2px solid rgba(255,255,255,0.3);' },
        { id: 'sun-grey',   label: 'Grau',     style: 'background:rgba(30,30,30,0.6);' },
        { id: 'sun-brown',  label: 'Braun',    style: 'background:rgba(80,40,10,0.5);' },
        { id: 'sun-green',  label: 'Grün',     style: 'background:rgba(20,60,20,0.5);' },
        { id: 'blue-light', label: 'Blaulicht',style: 'background:rgba(255,250,200,0.15);' },
        { id: 'mirror-blue',label: 'Spiegel',  style: 'background:linear-gradient(135deg,#1e90ff,#00bfff);' },
        { id: 'gradient',   label: 'Verlauf',  style: 'background:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent);' },
        { id: 'rose',       label: 'Rosé',     style: 'background:rgba(200,50,80,0.35);' },
      ];
      const lensGrid = lensPicker.querySelector('.artw-lens-grid');
      lensOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'artw-lens-opt' + (opt.id === 'clear' ? ' active' : '');
        btn.dataset.lens = opt.id;
        btn.innerHTML = `<div class="artw-lens-preview" style="${opt.style}"></div><span>${opt.label}</span>`;
        btn.addEventListener('click', () => {
          this._arRenderer.setLensTint(opt.id);
          this._currentLens = opt.id;
          lensGrid.querySelectorAll('.artw-lens-opt').forEach(o => o.classList.remove('active'));
          btn.classList.add('active');
          this._closePickers();
        });
        lensGrid.appendChild(btn);
      });

      // Lens button in top bar (rightmost area) — add to top bar
      const lensBtn = this._makeIconBtn(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.4"/></svg>`,
        'Gläser'
      );
      lensBtn.style.marginLeft = '6px';
      lensBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._togglePicker('lens');
      });
      topBar.appendChild(lensBtn);

      // ── Frame strip
      const frameStrip = document.createElement('div');
      frameStrip.className = 'artw-frame-strip';
      this._dom.frameStrip = frameStrip;

      // ── PD Badge
      const pdBadge = document.createElement('div');
      pdBadge.className = 'artw-pd-badge';
      this._dom.pdBadge = pdBadge;

      // ── Action bar (bottom)
      const actionBar = document.createElement('div');
      actionBar.className = 'artw-action-bar';

      const ssBtn = document.createElement('button');
      ssBtn.className = 'artw-action-btn artw-btn-screenshot';
      ssBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5V3h8v2"/></svg> Foto`;
      ssBtn.addEventListener('click', () => this._doScreenshot());

      const pdBtn = document.createElement('button');
      pdBtn.className = 'artw-action-btn artw-btn-pd';
      pdBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M12 4v16"/></svg> PD messen`;
      pdBtn.addEventListener('click', () => this._togglePDMeasure(pdBtn));
      this._dom.pdBtn = pdBtn;

      const cartBtn = document.createElement('button');
      cartBtn.className = 'artw-action-btn artw-btn-cart';
      cartBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> In den Warenkorb`;
      cartBtn.addEventListener('click', async () => {
        const screenshot = await this.getScreenshot().catch(() => null);
        this._emit('addToCart', {
          frameId: this._currentFrame,
          color: this._currentColor,
          lensType: this._currentLens,
          pd: this.getPD(),
          screenshot,
        });
      });

      actionBar.appendChild(ssBtn);
      if (this.options.showPD !== false) actionBar.appendChild(pdBtn);
      actionBar.appendChild(cartBtn);

      // ── Screenshot preview overlay
      const ssOverlay = document.createElement('div');
      ssOverlay.className = 'artw-screenshot-overlay';
      ssOverlay.innerHTML = `
        <img class="artw-screenshot-img" alt="Screenshot" />
        <div class="artw-screenshot-actions">
          <a class="artw-ss-btn artw-ss-download" download="optonam-tryon.png">⬇ Herunterladen</a>
          <button class="artw-ss-btn artw-ss-close">Schließen</button>
        </div>
      `;
      ssOverlay.querySelector('.artw-ss-close').addEventListener('click', () => {
        ssOverlay.classList.remove('visible');
      });
      this._dom.ssOverlay = ssOverlay;
      this._dom.ssImg = ssOverlay.querySelector('.artw-screenshot-img');
      this._dom.ssDownload = ssOverlay.querySelector('.artw-ss-download');

      // ── Assemble
      wrap.appendChild(arArea);
      wrap.appendChild(noFace);
      wrap.appendChild(topBar);
      wrap.appendChild(colorPicker);
      wrap.appendChild(lensPicker);
      wrap.appendChild(pdBadge);
      wrap.appendChild(frameStrip);
      wrap.appendChild(actionBar);
      wrap.appendChild(ssOverlay);
      wrap.appendChild(loading);
      wrap.appendChild(errorScreen);

      this.container.appendChild(wrap);
      this._dom.wrap = wrap;

      // Close pickers on outside click
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) this._closePickers();
      });

      // Resize handler
      const resizeObs = new ResizeObserver(() => {
        if (this._arRenderer) this._arRenderer._resize();
        this._syncPDCanvasSize();
      });
      resizeObs.observe(wrap);
      this._resizeObs = resizeObs;
    }

    _buildFrameSelector() {
      this._dom.frameStrip.innerHTML = '';
      GlassesModels.catalog.forEach(model => {
        const card = document.createElement('div');
        card.className = 'artw-frame-card' + (model.id === this._currentFrame ? ' active' : '');
        card.dataset.id = model.id;
        card.innerHTML = `
          <svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="${model.icon}"/>
          </svg>
          <span>${model.name}</span>
        `;
        card.addEventListener('click', () => this.loadFrame(model.id));
        this._dom.frameStrip.appendChild(card);
      });
    }

    _updateFrameSelector() {
      this._dom.frameStrip.querySelectorAll('.artw-frame-card').forEach(card => {
        card.classList.toggle('active', card.dataset.id === this._currentFrame);
      });
    }

    // ─── Private: Face Results Loop ─────────────────────────────────────────

    _onFaceResults(faceData) {
      if (!this._arRenderer) return;

      // FPS
      this._fpsFrames++;
      const now = performance.now();
      if (now - this._fpsLastTime >= 1000) {
        this._dom.fps.textContent = `${this._fpsFrames} FPS`;
        this._fpsFrames = 0;
        this._fpsLastTime = now;
      }

      // No-face indicator
      const hadFace = this._faceDetected;
      this._faceDetected = !!faceData;
      if (!faceData && hadFace) {
        clearTimeout(this._noFaceTimer);
        this._noFaceTimer = setTimeout(() => {
          if (!this._faceDetected) this._dom.noFace.classList.add('visible');
        }, 1200);
      } else if (faceData) {
        clearTimeout(this._noFaceTimer);
        this._dom.noFace.classList.remove('visible');
      }

      // Update AR renderer
      this._arRenderer.update(faceData);

      // PD measurement
      if (this._pdMeasuring && faceData) {
        const result = this._pdMeasurer.measure(faceData);
        if (result) {
          this._pdResult = result;
          this._dom.pdBadge.textContent = `PD: ${result.pdMm} mm (${result.confidence}%)`;
          this._dom.pdBadge.classList.add('visible');

          if (result.sampleCount >= this._pdMeasurer.maxSamples) {
            this._stopPDMeasure();
            this._emit('pdMeasured', this.getPD());
          }
        }

        // Draw PD overlay
        this._drawPDOverlay(faceData);
      } else {
        this._clearPDCanvas();
      }
    }

    // ─── Private: PD Measurement ────────────────────────────────────────────

    _togglePDMeasure(btn) {
      if (this._pdMeasuring) {
        this._stopPDMeasure();
      } else {
        this._startPDMeasure(btn);
      }
    }

    _startPDMeasure(btn) {
      this._pdMeasuring = true;
      this._pdMeasurer.start();
      btn.classList.add('active');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Stop`;
    }

    _stopPDMeasure() {
      this._pdMeasuring = false;
      this._pdMeasurer.stop();
      const btn = this._dom.pdBtn;
      if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M12 4v16"/></svg> PD messen`;
      }
      this._clearPDCanvas();
    }

    _syncPDCanvasSize() {
      const pdCanvas = this._dom.pdCanvas;
      if (!pdCanvas) return;
      pdCanvas.width = pdCanvas.offsetWidth;
      pdCanvas.height = pdCanvas.offsetHeight;
    }

    _drawPDOverlay(faceData) {
      const pdCanvas = this._dom.pdCanvas;
      if (!pdCanvas) return;
      if (pdCanvas.width !== pdCanvas.offsetWidth) this._syncPDCanvasSize();
      const ctx = pdCanvas.getContext('2d');
      ctx.clearRect(0, 0, pdCanvas.width, pdCanvas.height);
      this._pdMeasurer.drawOverlay(ctx, faceData, pdCanvas.width, pdCanvas.height);
    }

    _clearPDCanvas() {
      const pdCanvas = this._dom.pdCanvas;
      if (!pdCanvas) return;
      const ctx = pdCanvas.getContext('2d');
      ctx.clearRect(0, 0, pdCanvas.width, pdCanvas.height);
    }

    // ─── Private: Screenshot ────────────────────────────────────────────────

    async _doScreenshot() {
      try {
        const dataUrl = await this.getScreenshot();
        this._dom.ssImg.src = dataUrl;
        this._dom.ssDownload.href = dataUrl;
        this._dom.ssOverlay.classList.add('visible');
        this._emit('screenshot', { dataUrl });
      } catch (e) {
        console.warn('ARTryOnWidget screenshot failed:', e);
      }
    }

    // ─── Private: Frame cycling ─────────────────────────────────────────────

    _cycleFrame(dir) {
      const catalog = GlassesModels.catalog;
      const idx = catalog.findIndex(m => m.id === this._currentFrame);
      const next = catalog[(idx + dir + catalog.length) % catalog.length];
      this.loadFrame(next.id);
    }

    // ─── Private: Picker toggles ────────────────────────────────────────────

    _togglePicker(which) {
      const colorPicker = this._dom.colorPicker;
      const lensPicker = this._dom.lensPicker;
      if (which === 'color') {
        const open = colorPicker.classList.contains('visible');
        this._closePickers();
        if (!open) colorPicker.classList.add('visible');
      } else {
        const open = lensPicker.classList.contains('visible');
        this._closePickers();
        if (!open) lensPicker.classList.add('visible');
      }
    }

    _closePickers() {
      this._dom.colorPicker && this._dom.colorPicker.classList.remove('visible');
      this._dom.lensPicker && this._dom.lensPicker.classList.remove('visible');
    }

    // ─── Private: Loading / Error ───────────────────────────────────────────

    _showLoading(msg) {
      this._dom.loading.style.display = 'flex';
      this._dom.loading.classList.remove('artw-fade-out');
      this._dom.loadingText.textContent = msg;
    }

    _hideLoading() {
      this._dom.loading.classList.add('artw-fade-out');
      setTimeout(() => { this._dom.loading.style.display = 'none'; }, 450);
    }

    _showError(msg) {
      this._dom.loading.style.display = 'none';
      this._dom.errorScreen.style.display = 'flex';
      this._dom.errorMsgText.textContent = msg || 'Ein Fehler ist aufgetreten.';
    }

    // ─── Private: ARRenderer patch ──────────────────────────────────────────

    _patchARRenderer() {
      const video = this._dom.video;
      const renderer = this._arRenderer;

      // Override _updateCropInfo to use our video element
      renderer._updateCropInfo = function () {
        if (!video || !video.videoWidth) return;
        const container = this.canvas.parentElement;
        const containerAspect = container.clientWidth / container.clientHeight;
        const videoAspect = video.videoWidth / video.videoHeight;
        if (videoAspect > containerAspect) {
          this._cropScaleX = containerAspect / videoAspect;
          this._cropOffsetX = (1 - this._cropScaleX) / 2;
          this._cropScaleY = 1;
          this._cropOffsetY = 0;
        } else {
          this._cropScaleX = 1;
          this._cropOffsetX = 0;
          this._cropScaleY = videoAspect / containerAspect;
          this._cropOffsetY = (1 - this._cropScaleY) / 2;
        }
      };

      // Override takeScreenshot to use our video element
      renderer.takeScreenshot = function () {
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth || 1280;
        offscreen.height = video.videoHeight || 720;
        const ctx = offscreen.getContext('2d');
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -offscreen.width, 0, offscreen.width, offscreen.height);
        ctx.restore();
        ctx.drawImage(this.canvas, 0, 0, offscreen.width, offscreen.height);
        return offscreen.toDataURL('image/png');
      };
    }

    // ─── Private: FaceTracker patch ─────────────────────────────────────────

    _patchFaceTracker() {
      const video = this._dom.video;
      const tracker = this._faceTracker;

      tracker.flipCamera = async function () {
        this.currentFacing = this.currentFacing === 'user' ? 'environment' : 'user';
        if (this.camera) {
          await this.camera.stop();
          this.camera = new Camera(video, {
            onFrame: async () => {
              if (this.faceMesh) await this.faceMesh.send({ image: video });
            },
            width: 1280,
            height: 720,
            facingMode: this.currentFacing,
          });
          await this.camera.start();
        }
      };
    }

    // ─── Private: Helpers ───────────────────────────────────────────────────

    _makeIconBtn(svgHtml, title) {
      const btn = document.createElement('button');
      btn.className = 'artw-icon-btn';
      btn.title = title;
      btn.innerHTML = svgHtml;
      return btn;
    }

    _emit(event, data) {
      (this._callbacks[event] || []).forEach(cb => {
        try { cb(data); } catch (e) { console.warn('ARTryOnWidget event error:', e); }
      });
    }
  }

  // ─── Expose ─────────────────────────────────────────────────────────────────
  global.ARTryOnWidget = ARTryOnWidget;

})(typeof window !== 'undefined' ? window : this);
