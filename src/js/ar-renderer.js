/**
 * ar-renderer.js
 * Three.js overlay renderer — places 3D glasses on detected face
 * Uses face landmarks to position, scale, and rotate glasses in real-time
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

        // Smoothing buffers (reduces jitter)
        this.smoothing = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { yaw: 0, pitch: 0, roll: 0 },
            scale: 1,
            factor: 0.35, // 0 = no smoothing, 1 = max smoothing
        };

        // Fade in/out opacity
        this._fadeOpacity = 0;

        this._init();
    }

    _init() {
        // Scene
        this.scene = new THREE.Scene();

        // Camera (orthographic for screen overlay)
        this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
        this.camera.position.z = 1;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setClearColor(0x000000, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0.5, 0.5, 1);
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-0.5, -0.2, 0.5);
        this.scene.add(fillLight);

        // Handle resize
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const w = this.canvas.parentElement.clientWidth;
        const h = this.canvas.parentElement.clientHeight;
        this.renderer.setSize(w, h);
        this.canvas.width = w;
        this.canvas.height = h;

        // Keep orthographic camera proportional
        const aspect = w / h;
        this.camera.left = -0.5 * aspect;
        this.camera.right = 0.5 * aspect;
        this.camera.top = 0.5;
        this.camera.bottom = -0.5;
        this.camera.updateProjectionMatrix();
    }

    setGlasses(modelId, color) {
        // Remove existing
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

    update(faceData) {
        if (!this.glassesGroup) return;

        if (!faceData) {
            // No face detected — fade out glasses smoothly
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

        // Face detected — fade in
        this.glassesGroup.visible = true;
        if (this._fadeOpacity < 1) {
            this._fadeOpacity = Math.min(this._fadeOpacity + 0.15, 1);
            this._setGroupOpacity(this.glassesGroup, this._fadeOpacity);
        }

        const aspect = this.canvas.width / this.canvas.height;

        // === COORDINATE MAPPING ===
        // FaceMesh: x=[0,1] left→right, y=[0,1] top→bottom (in original video)
        // Three.js ortho camera: x=[-0.5*aspect, +0.5*aspect], y=[-0.5, +0.5]
        // Webcam video is CSS mirrored via scaleX(-1), so we also mirror X
        
        const faceX = faceData.position.x; // 0-1 normalized
        const faceY = faceData.position.y; // 0-1 normalized

        // Map to ortho coords (mirror X to match CSS mirror)
        const targetX = (0.5 - faceX) * aspect;
        // Offset Y down — glasses sit slightly below eye center (on nose bridge)
        const targetY = 0.5 - faceY - 0.02;
        const targetZ = 0;

        // === SCALE ===
        // Goal: glasses width should match ~1.3x the eye-to-eye distance on screen
        //
        // eyeWidth is 2D normalized distance between outer eye corners
        // In ortho space, horizontal distances scale by `aspect`
        // Model width at scale=1 with S=0.18:
        //   total ≈ 2 * (lensWidth*S/2 + bridgeWidth*S/2 + lensWidth*S/2) ≈ 0.19
        //
        // Target width in ortho = eyeWidth * aspect * 1.3 (glasses wider than eyes)
        // Scale = targetWidth / modelWidth
        
        const modelWidth = 0.19; // approx width of glasses group at scale=1
        const targetWidth = faceData.eyeWidth * aspect * 1.4;
        const targetScale = targetWidth / modelWidth;

        // === Rotation ===
        const targetYaw = -faceData.rotation.yaw;
        const targetPitch = faceData.rotation.pitch * 0.6; // dampen pitch — too sensitive
        const targetRoll = -faceData.rotation.roll;

        // === Apply smoothing (exponential moving average) ===
        const f = 1 - this.smoothing.factor;
        
        this.smoothing.position.x += (targetX - this.smoothing.position.x) * f;
        this.smoothing.position.y += (targetY - this.smoothing.position.y) * f;
        this.smoothing.position.z += (targetZ - this.smoothing.position.z) * f;
        this.smoothing.scale += (targetScale - this.smoothing.scale) * f;
        this.smoothing.rotation.yaw += (targetYaw - this.smoothing.rotation.yaw) * f;
        this.smoothing.rotation.pitch += (targetPitch - this.smoothing.rotation.pitch) * f;
        this.smoothing.rotation.roll += (targetRoll - this.smoothing.rotation.roll) * f;

        // Apply transforms
        this.glassesGroup.position.set(
            this.smoothing.position.x,
            this.smoothing.position.y,
            this.smoothing.position.z
        );

        this.glassesGroup.scale.setScalar(this.smoothing.scale);

        // Apply rotation using Euler (pitch, yaw, roll) — YXZ order for natural head movement
        this.glassesGroup.rotation.order = 'YXZ';
        this.glassesGroup.rotation.set(
            this.smoothing.rotation.pitch,
            this.smoothing.rotation.yaw,
            this.smoothing.rotation.roll
        );

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
        // Draw video + AR overlay to offscreen canvas
        const video = document.getElementById('webcam');
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
        const ctx = offscreen.getContext('2d');

        // Draw mirrored video
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -offscreen.width, 0, offscreen.width, offscreen.height);
        ctx.restore();

        // Draw AR overlay
        ctx.drawImage(this.canvas, 0, 0, offscreen.width, offscreen.height);

        return offscreen.toDataURL('image/png');
    }

    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}
