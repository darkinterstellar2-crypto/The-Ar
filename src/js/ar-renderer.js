/**
 * ar-renderer.js
 * Three.js overlay renderer — places 3D glasses on detected face
 * 
 * Coordinate system:
 * - MediaPipe: x=[0,1] left-to-right, y=[0,1] top-to-bottom
 * - Three.js NDC: x=[-1,1] left-to-right, y=[-1,1] bottom-to-top
 * - Conversion: x_ndc = (mp.x * 2) - 1, y_ndc = -(mp.y * 2) + 1
 * - CSS scaleX(-1) applied to BOTH video and canvas for mirror
 */

class ARRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.glassesGroup = null;
        this.currentModel = null;
        this.currentColor = null;

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

        // Video crop info (for object-fit: cover alignment)
        this._cropOffsetX = 0;
        this._cropOffsetY = 0;
        this._cropScaleX = 1;
        this._cropScaleY = 1;

        this._init();
    }

    _init() {
        this.scene = new THREE.Scene();

        // Camera in NDC space: x=[-1,1], y=[-1,1]
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
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
        const container = this.canvas.parentElement;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.renderer.setSize(w, h);

        // Camera stays at NDC [-1,1] range — no aspect adjustment needed
        // because we handle aspect in the position/scale mapping
        const aspect = w / h;
        this.camera.left = -1;
        this.camera.right = 1;
        this.camera.top = 1;
        this.camera.bottom = -1;
        this.camera.updateProjectionMatrix();

        // Compute object-fit: cover crop offset
        this._updateCropInfo();
    }

    _updateCropInfo() {
        const video = document.getElementById('webcam');
        if (!video || !video.videoWidth) return;

        const container = this.canvas.parentElement;
        const containerAspect = container.clientWidth / container.clientHeight;
        const videoAspect = video.videoWidth / video.videoHeight;

        if (videoAspect > containerAspect) {
            // Video wider than container — sides cropped
            this._cropScaleX = containerAspect / videoAspect;
            this._cropOffsetX = (1 - this._cropScaleX) / 2;
            this._cropScaleY = 1;
            this._cropOffsetY = 0;
        } else {
            // Video taller than container — top/bottom cropped
            this._cropScaleX = 1;
            this._cropOffsetX = 0;
            this._cropScaleY = videoAspect / containerAspect;
            this._cropOffsetY = (1 - this._cropScaleY) / 2;
        }
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
            'clear':       { color: 0x222222, opacity: 0.12, metalness: 0.0 },
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
     * Update glasses from face data — core render loop
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

        // Update crop info (video dimensions may not be available on first frame)
        this._updateCropInfo();

        const now = performance.now();

        // === POSITION ===
        // Use nose bridge as anchor (landmark #6)
        const lmX = faceData.noseBridge ? faceData.noseBridge.x : faceData.position.x;
        const lmY = faceData.noseBridge ? faceData.noseBridge.y : faceData.position.y;

        // Adjust for object-fit: cover cropping
        const visX = (lmX - this._cropOffsetX) / this._cropScaleX;
        const visY = (lmY - this._cropOffsetY) / this._cropScaleY;

        // Convert to NDC: x_ndc = (x * 2) - 1, y_ndc = -(y * 2) + 1
        const rawX = (visX * 2) - 1;
        const rawY = -(visY * 2) + 1;

        const pos = this.posFilter.filter({ x: rawX, y: rawY }, now);

        // === DYNAMIC SCALING from eye landmarks 33 & 263 ===
        // Calculate eye distance in NDC space — this scales with camera distance
        const leftEye = faceData.leftEyeOuter || { x: faceData.position.x - faceData.eyeWidth / 2, y: faceData.position.y };
        const rightEye = faceData.rightEyeOuter || { x: faceData.position.x + faceData.eyeWidth / 2, y: faceData.position.y };

        const dx = (rightEye.x - leftEye.x) / this._cropScaleX;
        const dy = (rightEye.y - leftEye.y) / this._cropScaleY;
        const eyeDistance = Math.sqrt(dx * dx + dy * dy);

        // Scale in NDC (multiply by 2 for [0,1]→[-1,1] range)
        // Magic multiplier: tweak until glasses width matches face
        const scaleMultiplier = 5.0;
        const rawScale = eyeDistance * 2 * scaleMultiplier;

        const scale = this.scaleFilter.filter(rawScale, now);

        // === Z-AXIS ROLL from eye landmarks ===
        // atan2(dy, dx) gives the tilt angle directly
        const rollAngle = Math.atan2(dy, dx);

        // Yaw and pitch from face tracker
        const rawRot = {
            yaw: -faceData.rotation.yaw,
            pitch: faceData.rotation.pitch * 0.5,
            roll: rollAngle, // Direct from eye landmarks — no negation, CSS mirror handles it
        };
        const rot = this.rotFilter.filter(rawRot, now);

        // === APPLY ===
        this.glassesGroup.position.set(pos.x, pos.y, 0);
        this.glassesGroup.scale.set(scale, scale, scale);
        this.glassesGroup.rotation.order = 'YXZ';
        this.glassesGroup.rotation.set(rot.pitch, rot.yaw, rot.roll);

        this._render();
    }

    _render() {
        this.renderer.render(this.scene, this.camera);
    }

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
