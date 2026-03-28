/**
 * calibration.js
 * Selfie-based calibration phase before AR session
 * 
 * Flow:
 * 1. Show circle guide overlay on live video
 * 2. User aligns face → quality checks run continuously
 * 3. User taps "Capture" (or auto-capture when quality passes)
 * 4. Freeze frame → run heavy analysis:
 *    - Iris-based PD measurement (mm)
 *    - Face shape classification
 *    - Iris diameter in pixels (for real-world scaling anchor)
 *    - Quality gate (lighting, occlusion, pose)
 * 5. Store calibration data → hand off to AR session
 */

class Calibration {
    constructor() {
        this.IRIS_DIAMETER_MM = 11.7; // average human iris

        this.result = null; // filled after calibration
        this.isActive = false;
    }

    /**
     * Run calibration on a single FaceMesh result from a static frame
     * @param {Object} landmarks - 478 landmarks from FaceMesh
     * @param {number} imageWidth - video/canvas width in pixels
     * @param {number} imageHeight - video/canvas height in pixels
     * @returns {Object} calibration data
     */
    analyze(landmarks, imageWidth, imageHeight) {
        // === 1. IRIS MEASUREMENTS ===
        // Left iris: 468 (center), 469 (top), 470 (right), 471 (bottom), 472 (left)
        // Right iris: 473 (center), 474 (top), 475 (right), 476 (bottom), 477 (left)

        const leftIrisCenter = landmarks[468];
        const rightIrisCenter = landmarks[473];

        // Iris diameter in pixels (average of horizontal and vertical for each eye)
        const leftIrisHoriz = this._pixelDist(landmarks[472], landmarks[470], imageWidth, imageHeight);
        const leftIrisVert = this._pixelDist(landmarks[469], landmarks[471], imageWidth, imageHeight);
        const rightIrisHoriz = this._pixelDist(landmarks[477], landmarks[475], imageWidth, imageHeight);
        const rightIrisVert = this._pixelDist(landmarks[474], landmarks[476], imageWidth, imageHeight);

        const leftIrisDiameterPx = (leftIrisHoriz + leftIrisVert) / 2;
        const rightIrisDiameterPx = (rightIrisHoriz + rightIrisVert) / 2;
        const avgIrisDiameterPx = (leftIrisDiameterPx + rightIrisDiameterPx) / 2;

        // Pixels per millimeter (the key scaling anchor)
        const pxPerMm = avgIrisDiameterPx / this.IRIS_DIAMETER_MM;

        // === 2. PD (Pupillary Distance) in mm ===
        const pdPixels = this._pixelDist(leftIrisCenter, rightIrisCenter, imageWidth, imageHeight);
        const pdMm = pdPixels / pxPerMm;

        // === 3. FACE MEASUREMENTS (all in mm) ===
        const leftEyeOuter = landmarks[33];
        const rightEyeOuter = landmarks[263];
        const eyeWidthPx = this._pixelDist(leftEyeOuter, rightEyeOuter, imageWidth, imageHeight);
        const eyeWidthMm = eyeWidthPx / pxPerMm;

        const chin = landmarks[152];
        const forehead = landmarks[10];
        const faceHeightPx = this._pixelDist(forehead, chin, imageWidth, imageHeight);
        const faceHeightMm = faceHeightPx / pxPerMm;

        // Face width at cheeks
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const faceWidthPx = this._pixelDist(leftCheek, rightCheek, imageWidth, imageHeight);
        const faceWidthMm = faceWidthPx / pxPerMm;

        // === 4. FACE SHAPE ===
        const foreheadLeft = landmarks[71];
        const foreheadRight = landmarks[301];
        const foreheadWidthPx = this._pixelDist(foreheadLeft, foreheadRight, imageWidth, imageHeight);
        const jawLeft = landmarks[132];
        const jawRight = landmarks[361];
        const jawWidthPx = this._pixelDist(jawLeft, jawRight, imageWidth, imageHeight);

        const foreheadWidth = foreheadWidthPx / pxPerMm;
        const jawWidth = jawWidthPx / pxPerMm;

        const faceShape = this._classifyFaceShape(
            foreheadWidth, faceWidthMm, jawWidth, faceHeightMm
        );

        // === 5. QUALITY CHECKS ===
        const noseBridge = landmarks[6];
        const noseTip = landmarks[1];

        // Pose check: is user looking straight ahead?
        const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
        const yawOffset = Math.abs(noseTip.x - faceCenterX) / (rightCheek.x - leftCheek.x + 0.001);
        const isLookingStraight = yawOffset < 0.08;

        // Eye openness check (are eyes visible, not occluded by hair?)
        const leftEyeTop = landmarks[159];
        const leftEyeBot = landmarks[145];
        const eyeOpenness = this._pixelDist(leftEyeTop, leftEyeBot, imageWidth, imageHeight);
        const eyesVisible = eyeOpenness > 3; // pixels

        // === 6. NORMALIZED IRIS SIZE (for live scaling) ===
        // This tells the AR renderer what 11.7mm looks like in normalized coords
        const leftIrisDiameterNorm = this._normDist(landmarks[469], landmarks[471]);
        const rightIrisDiameterNorm = this._normDist(landmarks[474], landmarks[476]);
        const irisNormDiameter = (leftIrisDiameterNorm + rightIrisDiameterNorm) / 2;

        this.result = {
            // Core measurements (mm)
            pdMm: Math.round(pdMm * 10) / 10,
            eyeWidthMm: Math.round(eyeWidthMm * 10) / 10,
            faceWidthMm: Math.round(faceWidthMm * 10) / 10,
            faceHeightMm: Math.round(faceHeightMm * 10) / 10,

            // Scaling anchors
            pxPerMm,
            irisNormDiameter, // used in live AR to compute scale from distance

            // Face shape
            faceShape,

            // Quality
            isLookingStraight,
            eyesVisible,
            qualityPassed: isLookingStraight && eyesVisible,

            // Raw (for debugging)
            avgIrisDiameterPx,
            pdPixels,
        };

        return this.result;
    }

    _classifyFaceShape(foreheadW, cheekW, jawW, faceH) {
        const widthToHeight = cheekW / (faceH + 0.001);
        const foreheadToJaw = foreheadW / (jawW + 0.001);
        const cheekToJaw = cheekW / (jawW + 0.001);

        if (widthToHeight > 0.85) {
            return cheekToJaw < 1.1 ? 'square' : 'round';
        }
        if (widthToHeight < 0.72) return 'oblong';
        if (foreheadToJaw > 1.15) return 'heart';
        if (cheekToJaw > 1.2 && foreheadToJaw < 0.95) return 'diamond';
        return 'oval';
    }

    _pixelDist(a, b, w, h) {
        return Math.sqrt(((a.x - b.x) * w) ** 2 + ((a.y - b.y) * h) ** 2);
    }

    _normDist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    getResult() {
        return this.result;
    }
}
