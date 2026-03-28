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
            factor: 0.4, // 0 = no smoothing, 1 = max smoothing
        };

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

        // Update all frame materials
        this.glassesGroup.traverse((child) => {
            if (child.isMesh && child.material && !child.material.transparent) {
                child.material.color.set(color);
            }
        });
    }

    update(faceData) {
        if (!this.glassesGroup) return;

        if (!faceData) {
            // No face detected — hide glasses
            this.glassesGroup.visible = false;
            this._render();
            return;
        }

        this.glassesGroup.visible = true;

        const aspect = this.canvas.width / this.canvas.height;

        // === Position ===
        // FaceMesh: x=[0,1] left-to-right, y=[0,1] top-to-bottom, z=depth
        // Three.js ortho: x=[-0.5*aspect, 0.5*aspect], y=[-0.5, 0.5]
        // Webcam is CSS mirrored (scaleX(-1)), so we also mirror x in 3D
        
        // Use nose bridge for vertical position (more stable than eye center)
        const bridgeY = faceData.noseBridge.y;
        
        const targetX = (0.5 - faceData.position.x) * aspect;
        const targetY = -(bridgeY - 0.5);
        const targetZ = 0; // keep on screen plane

        // === Scale ===
        // eyeWidth = normalized distance between outer eye corners
        // Map to Three.js world units — tuned for accurate face fit
        const targetScale = faceData.eyeWidth * 6.0;

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
