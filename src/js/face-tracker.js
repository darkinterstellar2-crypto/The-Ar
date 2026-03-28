/**
 * face-tracker.js
 * MediaPipe FaceMesh wrapper — detects 468 face landmarks
 * Extracts key points for glasses placement: eyes, nose bridge, ears, face rotation
 */

class FaceTracker {
    constructor() {
        this.faceMesh = null;
        this.camera = null;
        this.onResults = null;
        this.isReady = false;
        this.currentFacing = 'user'; // 'user' or 'environment'
        
        // Key landmark indices for glasses placement
        // https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
        this.LANDMARKS = {
            // Nose bridge (top) — where glasses sit
            noseBridgeTop: 6,
            noseBridgeBottom: 4,
            noseTip: 1,

            // Between eyes
            leftEyeInner: 133,
            rightEyeInner: 362,
            
            // Eye centers (approx)
            leftEyeCenter: 468, // iris center (if available) or computed
            rightEyeCenter: 473,
            
            // Outer eye corners — for temple width
            leftEyeOuter: 33,
            rightEyeOuter: 263,
            
            // Pupil landmarks (iris)
            leftIris: [468, 469, 470, 471, 472],
            rightIris: [473, 474, 475, 476, 477],

            // Ear attachment points (where temples rest)
            leftEar: 234,
            rightEar: 454,

            // Face oval for rotation estimation
            chin: 152,
            forehead: 10,
            leftCheek: 234,
            rightCheek: 454,

            // For PD measurement — pupil centers
            leftPupil: 468,
            rightPupil: 473,
        };
    }

    async init(videoElement, onResultsCallback) {
        this.onResults = onResultsCallback;

        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
            }
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Enables iris tracking (landmarks 468-477)
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        this.faceMesh.onResults((results) => this._processResults(results));

        // Start camera
        this.camera = new Camera(videoElement, {
            onFrame: async () => {
                if (this.faceMesh) {
                    await this.faceMesh.send({ image: videoElement });
                }
            },
            width: 1280,
            height: 720,
            facingMode: this.currentFacing,
        });

        await this.camera.start();
        this.isReady = true;
    }

    _processResults(results) {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            if (this.onResults) this.onResults(null);
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];
        const L = this.LANDMARKS;

        // Extract key positions (normalized 0-1 coords)
        const noseBridge = landmarks[L.noseBridgeTop];
        const leftEyeInner = landmarks[L.leftEyeInner];
        const rightEyeInner = landmarks[L.rightEyeInner];
        const leftEyeOuter = landmarks[L.leftEyeOuter];
        const rightEyeOuter = landmarks[L.rightEyeOuter];
        const chin = landmarks[L.chin];
        const forehead = landmarks[L.forehead];
        const leftEar = landmarks[L.leftEar];
        const rightEar = landmarks[L.rightEar];

        // Pupil centers (with iris refinement)
        const leftPupil = landmarks[L.leftPupil] || this._midpoint(landmarks[L.leftEyeInner], landmarks[L.leftEyeOuter]);
        const rightPupil = landmarks[L.rightPupil] || this._midpoint(landmarks[L.rightEyeInner], landmarks[L.rightEyeOuter]);

        // === Compute glasses placement ===
        
        // Position: center between inner eye corners, slightly above
        const centerX = (leftEyeInner.x + rightEyeInner.x) / 2;
        const centerY = (leftEyeInner.y + rightEyeInner.y) / 2;
        const centerZ = (leftEyeInner.z + rightEyeInner.z) / 2;

        // Width: distance between outer eye corners (for scaling)
        const eyeWidth = this._distance3D(leftEyeOuter, rightEyeOuter);

        // Face rotation
        const rotation = this._computeRotation(landmarks, L);

        // PD (pupillary distance) in pixels
        const pdNormalized = this._distance2D(leftPupil, rightPupil);

        const faceData = {
            // Glasses center position (normalized)
            position: { x: centerX, y: centerY, z: centerZ },
            
            // Face dimensions for scaling
            eyeWidth,
            faceHeight: this._distance2D(forehead, chin),
            
            // Rotation (radians)
            rotation,
            
            // Individual eye positions
            leftPupil: { x: leftPupil.x, y: leftPupil.y, z: leftPupil.z },
            rightPupil: { x: rightPupil.x, y: rightPupil.y, z: rightPupil.z },
            
            // PD
            pdNormalized,
            
            // Ear positions (for temple rendering)
            leftEar: { x: leftEar.x, y: leftEar.y, z: leftEar.z },
            rightEar: { x: rightEar.x, y: rightEar.y, z: rightEar.z },

            // Nose bridge
            noseBridge: { x: noseBridge.x, y: noseBridge.y, z: noseBridge.z },

            // Raw landmarks for advanced use
            landmarks,
            
            // Image dimensions
            imageWidth: results.image.width,
            imageHeight: results.image.height,
        };

        if (this.onResults) this.onResults(faceData);
    }

    _computeRotation(landmarks, L) {
        const noseBridge = landmarks[L.noseBridgeTop];
        const chin = landmarks[L.chin];
        const forehead = landmarks[L.forehead];
        const leftEar = landmarks[L.leftEar];
        const rightEar = landmarks[L.rightEar];
        const noseTip = landmarks[L.noseTip];

        // Yaw (left-right turn): asymmetry of ear distances to nose
        const leftDist = Math.abs(leftEar.x - noseBridge.x);
        const rightDist = Math.abs(rightEar.x - noseBridge.x);
        const yaw = Math.atan2(rightDist - leftDist, (rightDist + leftDist) / 2) * 1.5;

        // Pitch (up-down tilt): nose tip vs nose bridge vertical
        const pitch = Math.atan2(noseTip.y - noseBridge.y, Math.abs(noseTip.z - noseBridge.z)) - 0.5;

        // Roll (head tilt): angle of eye line
        const leftEyeOuter = landmarks[L.leftEyeOuter];
        const rightEyeOuter = landmarks[L.rightEyeOuter];
        const roll = Math.atan2(
            rightEyeOuter.y - leftEyeOuter.y,
            rightEyeOuter.x - leftEyeOuter.x
        );

        return { yaw, pitch, roll };
    }

    _distance2D(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    _distance3D(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    }

    _midpoint(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    }

    async flipCamera() {
        this.currentFacing = this.currentFacing === 'user' ? 'environment' : 'user';
        if (this.camera) {
            await this.camera.stop();
            // Recreate with new facing mode
            const video = document.getElementById('webcam');
            this.camera = new Camera(video, {
                onFrame: async () => {
                    if (this.faceMesh) {
                        await this.faceMesh.send({ image: video });
                    }
                },
                width: 1280,
                height: 720,
                facingMode: this.currentFacing,
            });
            await this.camera.start();
        }
    }

    destroy() {
        if (this.camera) this.camera.stop();
        if (this.faceMesh) this.faceMesh.close();
    }
}
