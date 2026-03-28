/**
 * gestures.js
 * Touch gesture handler — swipe left/right to switch frames
 * Also supports mouse drag on desktop
 */

class GestureHandler {
    constructor(element, callbacks = {}) {
        this.element = element;
        this.callbacks = callbacks; // { onSwipeLeft, onSwipeRight, onTap }

        this._startX = 0;
        this._startY = 0;
        this._startTime = 0;
        this._tracking = false;

        this.minSwipeDistance = 50; // px
        this.maxSwipeTime = 500; // ms
        this.maxTapDistance = 10; // px
        this.maxTapTime = 200; // ms

        this._bindEvents();
    }

    _bindEvents() {
        // Touch events
        this.element.addEventListener('touchstart', (e) => this._onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        this.element.addEventListener('touchend', (e) => this._onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY));

        // Mouse events (desktop)
        this.element.addEventListener('mousedown', (e) => this._onStart(e.clientX, e.clientY));
        this.element.addEventListener('mouseup', (e) => this._onEnd(e.clientX, e.clientY));
    }

    _onStart(x, y) {
        this._startX = x;
        this._startY = y;
        this._startTime = Date.now();
        this._tracking = true;
    }

    _onEnd(x, y) {
        if (!this._tracking) return;
        this._tracking = false;

        const dx = x - this._startX;
        const dy = y - this._startY;
        const dt = Date.now() - this._startTime;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Tap detection
        if (dist < this.maxTapDistance && dt < this.maxTapTime) {
            if (this.callbacks.onTap) this.callbacks.onTap(x, y);
            return;
        }

        // Swipe detection (horizontal only)
        if (Math.abs(dx) > this.minSwipeDistance && dt < this.maxSwipeTime && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0 && this.callbacks.onSwipeLeft) {
                this.callbacks.onSwipeLeft();
            } else if (dx > 0 && this.callbacks.onSwipeRight) {
                this.callbacks.onSwipeRight();
            }
        }
    }

    destroy() {
        // Could remove listeners here if needed
    }
}
