/**
 * pd-measurer.js
 * Pupillary Distance measurement using iris landmarks
 * Uses MediaPipe's refined iris tracking (landmarks 468-477) 
 * to estimate real-world PD in millimeters
 */

class PDMeasurer {
    constructor() {
        this.isActive = false;
        this.samples = [];
        this.maxSamples = 30; // Collect 30 frames for averaging
        this.currentPD = null;
        
        // Reference: average iris diameter is ~11.7mm
        // This is used to convert pixel distance to mm
        this.IRIS_DIAMETER_MM = 11.7;
    }

    start() {
        this.isActive = true;
        this.samples = [];
        this.currentPD = null;
    }

    stop() {
        this.isActive = false;
        this.samples = [];
    }

    /**
     * Process a face data frame and compute PD
     * @param {Object} faceData - from FaceTracker
     * @returns {Object|null} { pdMm, confidence, sampleCount }
     */
    measure(faceData) {
        if (!this.isActive || !faceData || !faceData.landmarks) return null;

        const landmarks = faceData.landmarks;
        
        // Get iris landmarks
        // Left iris: 468 (center), 469-472 (ring)
        // Right iris: 473 (center), 474-477 (ring)
        const leftIrisCenter = landmarks[468];
        const rightIrisCenter = landmarks[473];

        if (!leftIrisCenter || !rightIrisCenter) return null;

        // Measure iris diameter in normalized coords (for pixel-to-mm conversion)
        const leftIrisTop = landmarks[469];
        const leftIrisBottom = landmarks[471];
        const leftIrisDiameterNorm = leftIrisTop && leftIrisBottom ? 
            this._dist(leftIrisTop, leftIrisBottom) : null;

        const rightIrisTop = landmarks[474];
        const rightIrisBottom = landmarks[476];
        const rightIrisDiameterNorm = rightIrisTop && rightIrisBottom ?
            this._dist(rightIrisTop, rightIrisBottom) : null;

        if (!leftIrisDiameterNorm || !rightIrisDiameterNorm) return null;

        // Average iris diameter in normalized units
        const avgIrisDiameter = (leftIrisDiameterNorm + rightIrisDiameterNorm) / 2;

        // Distance between pupil centers in normalized units
        const pupilDistNorm = this._dist(leftIrisCenter, rightIrisCenter);

        // Convert to mm using iris as reference
        // PD (mm) = pupilDist / irisDiameter * 11.7mm
        const pdMm = (pupilDistNorm / avgIrisDiameter) * this.IRIS_DIAMETER_MM;

        // Only accept reasonable PD values (adult range: 50-75mm)
        if (pdMm < 45 || pdMm > 80) return null;

        // Add sample
        this.samples.push(pdMm);
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }

        // Compute average (remove outliers)
        const sorted = [...this.samples].sort((a, b) => a - b);
        const trimmed = sorted.slice(
            Math.floor(sorted.length * 0.1),
            Math.ceil(sorted.length * 0.9)
        );
        
        const avgPD = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
        
        // Confidence based on sample count and consistency
        const stdDev = Math.sqrt(
            trimmed.reduce((sum, v) => sum + (v - avgPD) ** 2, 0) / trimmed.length
        );
        const confidence = Math.min(
            (this.samples.length / this.maxSamples) * (1 - Math.min(stdDev / 5, 0.5)),
            1
        );

        this.currentPD = Math.round(avgPD * 10) / 10; // 1 decimal place

        return {
            pdMm: this.currentPD,
            confidence: Math.round(confidence * 100),
            sampleCount: this.samples.length,
        };
    }

    _dist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    getResult() {
        return this.currentPD ? {
            pdMm: this.currentPD,
            sampleCount: this.samples.length,
        } : null;
    }
}
