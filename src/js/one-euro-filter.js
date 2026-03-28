/**
 * one-euro-filter.js
 * Implementation of the 1€ (One Euro) Filter for jitter smoothing
 * 
 * Paper: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 * by Géry Casiez, Nicolas Roussel, Daniel Vogel
 * 
 * Adapts smoothing dynamically:
 * - High smoothing when still (removes jitter)
 * - Low smoothing when moving fast (reduces lag)
 */

class LowPassFilter {
    constructor(alpha) {
        this.alpha = alpha;
        this.initialized = false;
        this.hatxPrev = 0;
    }

    filter(value) {
        if (!this.initialized) {
            this.initialized = true;
            this.hatxPrev = value;
            return value;
        }
        const hatx = this.alpha * value + (1 - this.alpha) * this.hatxPrev;
        this.hatxPrev = hatx;
        return hatx;
    }

    setAlpha(alpha) {
        this.alpha = Math.max(0, Math.min(1, alpha));
    }

    reset() {
        this.initialized = false;
    }
}

class OneEuroFilter {
    /**
     * @param {number} freq - Estimated signal frequency (Hz), e.g., 30 for 30fps
     * @param {number} minCutoff - Minimum cutoff frequency (lower = more smoothing when still)
     * @param {number} beta - Speed coefficient (higher = less lag when moving)
     * @param {number} dCutoff - Derivative cutoff frequency
     */
    constructor(freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;

        this.xFilter = new LowPassFilter(this._alpha(this.minCutoff));
        this.dxFilter = new LowPassFilter(this._alpha(this.dCutoff));
        this.lastTime = null;
    }

    _alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    filter(value, timestamp) {
        // Update frequency from timestamps
        if (this.lastTime !== null && timestamp !== undefined) {
            const dt = (timestamp - this.lastTime) / 1000; // ms to seconds
            if (dt > 0) this.freq = 1.0 / dt;
        }
        this.lastTime = timestamp;

        // Estimate derivative
        const prevX = this.xFilter.hatxPrev;
        const dx = this.xFilter.initialized ? (value - prevX) * this.freq : 0;
        const edx = this.dxFilter.filter(dx);

        // Adjust cutoff based on speed
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        this.xFilter.setAlpha(this._alpha(cutoff));

        return this.xFilter.filter(value);
    }

    reset() {
        this.xFilter.reset();
        this.dxFilter.reset();
        this.lastTime = null;
    }
}

/**
 * Convenience: filter a group of values (x, y, z, etc.) with separate filters
 */
class OneEuroFilterGroup {
    constructor(keys, freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.filters = {};
        keys.forEach(key => {
            this.filters[key] = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        });
    }

    filter(values, timestamp) {
        const result = {};
        Object.keys(this.filters).forEach(key => {
            if (values[key] !== undefined) {
                result[key] = this.filters[key].filter(values[key], timestamp);
            }
        });
        return result;
    }

    reset() {
        Object.values(this.filters).forEach(f => f.reset());
    }
}
