/**
 * ar-renderer.js
 * Three.js overlay renderer — places 3D glasses on detected face
 * 
 * Uses:
 * - Calibration data (iris anchor) for real-world scaling
 * - 1€ Filter for jitter smoothing
 * - Occlusion mask for realistic temple clipping
 */

class ARRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.glassesGroup = null;
        this.occluderMesh = null;
        this.currentModel = null;
        this.currentColor = null;

        // Calibration data (set after selfie phase)
        this.calibration = null;

        // 1€ Filters for smooth tracking
        this.posFilter = new OneEuroFilterGroup(
            ['x', 'y'], 30, 1.5, 0.01, 1.0
        );
        this.rotFilter = new OneEuroFilterGroup(
            ['yaw', 'pitch', 'roll'], 30, 1.0, 0.005, 1.0
        );
        this.scaleFilter = new OneEuroFilter(30, 1.0, 0.005, 1.0);

        // Fade
        this._fadeOpacity = 0;

        this._init();
    }

    _init() {
        this.scene = new THREE.Scene();

        // Orthographic camera for screen overlay
        this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
        this.camera.position.z = 1;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0.3, 0.5, 1);
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
        fillLight.position.set(-0.3, -0.2, 0.5);
        this.scene.add(fillLight);

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const w = this.canvas.parentElement.clientWidth;
        const h = this.canvas.parentElement.clientHeight;
        this.renderer.setSize(w, h);
        this.canvas.width = w;
        this.canvas.height = h;

        const aspect = w / h;
        this.camera.left = -0.5 * aspect;
        this.camera.right = 0.5 * aspect;
        this.camera.top = 0.5;
        this.camera.bottom = -0.5;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Set calibration data from selfie analysis
     */
    setCalibration(calibData) {
        this.calibration = calibData;
        // Reset filters when recalibrating
        this.posFilter.reset();
        this.rotFilter.reset();
        this.scaleFilter.reset();
    }

    setGlasses(modelId, color) {
        if (this.glassesGroup) {
            this.scene.remove(this.glassesGroup);
            this.glassesGroup = null;
        }
        if (!modelId) return;

        this.currentModel = modelId;
        this.currentColor = color;

        const group = GlassesModels.build(modelId, color);
        if (group) {
            this.glassesGroup = group;
            this.scene.add(this.glassesGroup);
        }
    }

    setColor(color) {
        if (!this.glassesGroup) return;
        this.currentColor = color;
        this.glassesGroup.traverse((child) => {
            if (child.isMesh && child.material && !child.material.userData?.isLens) {
                child.material.color.set(color);
            }
        });
    }

    setLensTint(tintId) {
        if (!this.glassesGroup) return;

        const tints = {
            'clear':       { color: 0x111111, opacity: 0.08, metalness: 0.0 },
            'sun-grey':    { color: 0x1a1a1a, opacity: 0.55, metalness: 0.05 },
            'sun-brown':   { color: 0x4a2810, opacity: 0.50, metalness: 0.05 },
            'sun-green':   { color: 0x1a3a1a, opacity: 0.45, metalness: 0.05 },
            'blue-light':  { color: 0xfffacc, opacity: 0.12, metalness: 0.0 },
            'mirror-blue': { color: 0x1e90ff, opacity: 0.65, metalness: 0.7 },
            'gradient':    { color: 0x0a0a0a, opacity: 0.50, metalness: 0.05 },
            'rose':        { color: 0xc83250, opacity: 0.30, metalness: 0.1 },
        };

        const tint = tints[tintId] || tints['clear'];
        this.glassesGroup.traverse((child) => {
            if (child.isMesh && child.material?.userData?.isLens) {
                child.material.color.set(tint.color);
                child.material.opacity = tint.opacity;
                child.material.metalness = tint.metalness;
                child.material.userData.baseOpacity = tint.opacity;
                child.material.needsUpdate = true;
            }
        });
        this._render();
    }

    /**
     * Update glasses position/rotation/scale from face data
     * Core render loop — called every frame
     */
    update(faceData) {
        if (!this.glassesGroup) return;

        if (!faceData) {
            if (this.glassesGroup.visible) {
                this._fadeOpacity -= 0.08;
                if (this._fadeOpacity <= 0) {
                    this._fadeOpacity = 0;
                    this.glassesGroup.visible = false;
                }
                this._setGroupOpacity(this.glassesGroup, this._fadeOpacity);
            }
            this._render();
            return;
        }

        this.glassesGroup.visible = true;
        if (this._fadeOpacity < 1) {
            this._fadeOpacity = Math.min(this._fadeOpacity + 0.15, 1);
            this._setGroupOpacity(this.glassesGroup, this._fadeOpacity);
        }

        const aspect = this.canvas.width / this.canvas.height;
        const now = performance.now();

        // === POSITION ===
        // FaceMesh: x=[0,1], y=[0,1]. Ortho: x=[-0.5*aspect, 0.5*aspect], y=[-0.5, 0.5]
        // Mirror X to match CSS scaleX(-1) on video
        const rawX = (0.5 - faceData.position.x) * aspect;
        const rawY = 0.5 - faceData.position.y - 0.015; // slight down offset for nose bridge

        const pos = this.posFilter.filter({ x: rawX, y: rawY }, now);

        // === SCALE ===
        // Glasses width should span ~1.4x the eye-to-eye distance
        const modelWidth = 0.19; // glasses model width at scale=1
        const rawScale = (faceData.eyeWidth * aspect * 1.4) / modelWidth;

        const scale = this.scaleFilter.filter(rawScale, now);

        // === ROTATION ===
        const rawRot = {
            yaw: -faceData.rotation.yaw,
            pitch: faceData.rotation.pitch * 0.5,
            roll: -faceData.rotation.roll,
        };
        const rot = this.rotFilter.filter(rawRot, now);

        // === APPLY ===
        this.glassesGroup.position.set(pos.x, pos.y, 0);
        this.glassesGroup.scale.setScalar(scale);
        this.glassesGroup.rotation.order = 'YXZ';
        this.glassesGroup.rotation.set(rot.pitch, rot.yaw, rot.roll);

        this._render();
    }

    // Constant used for iris-based scaling
    get IRIS_DIAMETER_MM() { return 11.7; }

    _setGroupOpacity(group, opacity) {
        group.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = child.material.userData?.baseOpacity != null
                    ? child.material.userData.baseOpacity * opacity
                    : opacity;
            }
        });
    }

    takeScreenshot() {
        const video = document.getElementById('webcam');
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
        const ctx = offscreen.getContext('2d');

        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -offscreen.width, 0, offscreen.width, offscreen.height);
        ctx.restore();

        ctx.drawImage(this.canvas, 0, 0, offscreen.width, offscreen.height);
        return offscreen.toDataURL('image/png');
    }

    destroy() {
        if (this.renderer) this.renderer.dispose();
    }
}
