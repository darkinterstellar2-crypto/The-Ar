/**
 * face-shape.js
 * Detects face shape from landmarks and recommends frame styles
 * Face shapes: oval, round, square, heart, oblong, diamond
 */

class FaceShapeDetector {
    constructor() {
        this.samples = [];
        this.maxSamples = 45; // ~1.5 seconds of data
        this.currentShape = null;
        this.confidence = 0;

        // Landmark indices for face measurements
        this.POINTS = {
            foreheadLeft: 71,
            foreheadRight: 301,
            foreheadCenter: 10,
            templeLeft: 234,
            templeRight: 454,
            cheekLeft: 123,
            cheekRight: 352,
            jawLeft: 132,
            jawRight: 361,
            chin: 152,
            jawlineLeft: 172,
            jawlineRight: 397,
        };

        // Frame recommendations per face shape
        this.recommendations = {
            oval: {
                label: 'Oval',
                description: 'Balanced proportions — most frame styles work',
                best: ['wayfarer', 'aviator', 'cat-eye', 'clubmaster'],
                avoid: [],
                tip: 'Lucky you! Almost any frame suits an oval face.',
            },
            round: {
                label: 'Round',
                description: 'Soft, curved features with similar width and height',
                best: ['rectangle', 'wayfarer', 'clubmaster'],
                avoid: ['round'],
                tip: 'Angular frames add definition. Avoid circular shapes.',
            },
            square: {
                label: 'Square',
                description: 'Strong jawline, broad forehead, angular features',
                best: ['round', 'aviator', 'cat-eye'],
                avoid: ['rectangle'],
                tip: 'Round or curved frames soften strong angles.',
            },
            heart: {
                label: 'Heart',
                description: 'Wide forehead, narrow chin, high cheekbones',
                best: ['aviator', 'round', 'clubmaster'],
                avoid: ['cat-eye'],
                tip: 'Bottom-heavy frames balance a wide forehead.',
            },
            oblong: {
                label: 'Oblong',
                description: 'Longer than wide, straight cheek line',
                best: ['wayfarer', 'aviator', 'round'],
                avoid: ['rectangle'],
                tip: 'Wider frames and decorative temples add width.',
            },
            diamond: {
                label: 'Diamond',
                description: 'Narrow forehead and jawline, wide cheekbones',
                best: ['cat-eye', 'round', 'clubmaster'],
                avoid: [],
                tip: 'Cat-eye and browline frames complement cheekbones.',
            },
        };
    }

    /**
     * Analyze face data and return shape detection
     * @param {Object} faceData - from FaceTracker (must have .landmarks)
     * @returns {Object|null} { shape, label, confidence, recommendations }
     */
    analyze(faceData) {
        if (!faceData || !faceData.landmarks) return null;

        const lm = faceData.landmarks;
        const P = this.POINTS;

        // === Measure face ratios ===
        
        // Face width at different levels
        const foreheadWidth = this._dist(lm[P.foreheadLeft], lm[P.foreheadRight]);
        const cheekWidth = this._dist(lm[P.cheekLeft], lm[P.cheekRight]);
        const jawWidth = this._dist(lm[P.jawLeft], lm[P.jawRight]);
        
        // Face height
        const faceHeight = this._dist(lm[P.foreheadCenter], lm[P.chin]);
        
        // Jawline angle (how angular the jaw is)
        const jawAngle = this._angle(lm[P.jawlineLeft], lm[P.chin], lm[P.jawlineRight]);

        // Key ratios
        const widthToHeight = cheekWidth / (faceHeight + 0.001);
        const foreheadToJaw = foreheadWidth / (jawWidth + 0.001);
        const cheekToJaw = cheekWidth / (jawWidth + 0.001);
        const foreheadToCheek = foreheadWidth / (cheekWidth + 0.001);

        // === Classify ===
        const scores = {
            oval: 0,
            round: 0,
            square: 0,
            heart: 0,
            oblong: 0,
            diamond: 0,
        };

        // Width/height ratio
        if (widthToHeight > 0.75 && widthToHeight < 0.85) scores.oval += 3;
        if (widthToHeight >= 0.85) scores.round += 3;
        if (widthToHeight >= 0.80 && widthToHeight < 0.90) scores.square += 2;
        if (widthToHeight < 0.72) scores.oblong += 3;

        // Forehead to jaw ratio
        if (foreheadToJaw > 1.15) scores.heart += 3;
        if (foreheadToJaw > 1.0 && foreheadToJaw < 1.1) scores.oval += 2;
        if (Math.abs(foreheadToJaw - 1.0) < 0.08) scores.square += 2;
        if (foreheadToJaw < 0.95) scores.diamond += 2;

        // Cheek to jaw ratio (diamonds have wide cheeks, narrow jaw)
        if (cheekToJaw > 1.2) scores.diamond += 3;
        if (cheekToJaw > 1.1) scores.heart += 1;
        if (Math.abs(cheekToJaw - 1.0) < 0.1) scores.square += 2;

        // Forehead to cheek (heart = wider forehead)
        if (foreheadToCheek > 1.05) scores.heart += 2;
        if (foreheadToCheek < 0.9) scores.diamond += 2;

        // Jaw angle (sharper = more square)
        if (jawAngle < 125) scores.square += 2;
        if (jawAngle > 140) scores.oval += 1;
        if (jawAngle > 140) scores.round += 1;
        if (jawAngle > 150) scores.heart += 1;

        // Add sample
        this.samples.push(scores);
        if (this.samples.length > this.maxSamples) this.samples.shift();

        // Average scores across samples
        const avgScores = {};
        Object.keys(scores).forEach(shape => {
            avgScores[shape] = this.samples.reduce((sum, s) => sum + s[shape], 0) / this.samples.length;
        });

        // Find winner
        const sorted = Object.entries(avgScores).sort((a, b) => b[1] - a[1]);
        const bestShape = sorted[0][0];
        const bestScore = sorted[0][1];
        const totalScore = sorted.reduce((sum, [, v]) => sum + v, 0);

        this.currentShape = bestShape;
        this.confidence = Math.round((bestScore / (totalScore + 0.001)) * 100);

        const rec = this.recommendations[bestShape];

        return {
            shape: bestShape,
            label: rec.label,
            confidence: this.confidence,
            description: rec.description,
            bestFrames: rec.best,
            avoidFrames: rec.avoid,
            tip: rec.tip,
            sampleCount: this.samples.length,
        };
    }

    _dist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    _angle(a, vertex, b) {
        const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
        const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
        const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
        return Math.acos(dot / (mag1 * mag2 + 0.001)) * (180 / Math.PI);
    }

    reset() {
        this.samples = [];
        this.currentShape = null;
        this.confidence = 0;
    }
}
