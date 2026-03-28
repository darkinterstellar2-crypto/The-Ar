/**
 * glasses-models.js
 * Procedural 3D glasses geometry generation using Three.js
 * Each model defines frame shape, bridge, temples, and lens properties
 */

const GlassesModels = {
    catalog: [
        {
            id: 'aviator',
            name: 'Aviator',
            icon: 'M5,10 Q12,4 19,10 Q12,16 5,10 M7,10 Q12,6 17,10 Q12,14 7,10',
            lensShape: 'teardrop',
            frameWidth: 1.0,
            lensWidth: 0.48,
            lensHeight: 0.38,
            bridgeWidth: 0.08,
            bridgeStyle: 'double',
            templeStyle: 'thin',
            defaultColor: '#C0C0C0',
            metallic: true
        },
        {
            id: 'wayfarer',
            name: 'Wayfarer',
            icon: 'M3,8 L3,14 L10,15 L11,8 Z M13,8 L14,15 L21,14 L21,8 Z',
            lensShape: 'trapezoid',
            frameWidth: 1.0,
            lensWidth: 0.44,
            lensHeight: 0.36,
            bridgeWidth: 0.06,
            bridgeStyle: 'keyhole',
            templeStyle: 'thick',
            defaultColor: '#1a1a1a',
            metallic: false
        },
        {
            id: 'round',
            name: 'Round',
            icon: 'M3,10 a5,5 0 1,0 8,0 a5,5 0 1,0 -8,0 M13,10 a5,5 0 1,0 8,0 a5,5 0 1,0 -8,0',
            lensShape: 'circle',
            frameWidth: 0.9,
            lensWidth: 0.38,
            lensHeight: 0.38,
            bridgeWidth: 0.07,
            bridgeStyle: 'saddle',
            templeStyle: 'thin',
            defaultColor: '#FFD700',
            metallic: true
        },
        {
            id: 'cat-eye',
            name: 'Cat Eye',
            icon: 'M3,11 L4,8 L10,7 L11,11 L10,14 L3,14 Z M13,11 L14,14 L21,14 L21,7 L14,8 Z',
            lensShape: 'cateye',
            frameWidth: 1.05,
            lensWidth: 0.46,
            lensHeight: 0.34,
            bridgeWidth: 0.05,
            bridgeStyle: 'keyhole',
            templeStyle: 'thick',
            defaultColor: '#8B0000',
            metallic: false
        },
        {
            id: 'rectangle',
            name: 'Rectangle',
            icon: 'M2,9 L10,9 L10,15 L2,15 Z M14,9 L22,9 L22,15 L14,15 Z',
            lensShape: 'rectangle',
            frameWidth: 1.05,
            lensWidth: 0.48,
            lensHeight: 0.28,
            bridgeWidth: 0.06,
            bridgeStyle: 'saddle',
            templeStyle: 'medium',
            defaultColor: '#1a1a1a',
            metallic: false
        },
        {
            id: 'clubmaster',
            name: 'Clubmaster',
            icon: 'M2,9 L10,8 L10,14 L2,14 Z M14,8 L22,9 L22,14 L14,14 Z',
            lensShape: 'browline',
            frameWidth: 1.0,
            lensWidth: 0.44,
            lensHeight: 0.34,
            bridgeWidth: 0.06,
            bridgeStyle: 'keyhole',
            templeStyle: 'thin',
            defaultColor: '#8B4513',
            metallic: false,
            browAccent: true
        }
    ],

    /**
     * Build a Three.js Group for a glasses model
     */
    build(modelId, color) {
        const spec = this.catalog.find(m => m.id === modelId);
        if (!spec) return null;

        const group = new THREE.Group();
        const frameColor = color || spec.defaultColor;
        
        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor,
            metalness: spec.metallic ? 0.8 : 0.1,
            roughness: spec.metallic ? 0.2 : 0.7,
        });

        const lensMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.1,
            roughness: 0.0,
            transparent: true,
            opacity: 0.3,
        });

        // Scale factor for face-relative sizing
        const S = 0.065;

        // === Left Lens + Frame ===
        const leftLens = this._createLens(spec, S);
        leftLens.position.x = -(spec.lensWidth * S) / 2 - (spec.bridgeWidth * S) / 2;
        
        const leftFrame = this._createFrame(spec, S, frameMat);
        leftFrame.position.copy(leftLens.position);

        const leftLensMesh = new THREE.Mesh(leftLens.geometry, lensMat);
        leftLensMesh.position.copy(leftLens.position);

        // === Right Lens + Frame ===
        const rightLens = this._createLens(spec, S);
        rightLens.position.x = (spec.lensWidth * S) / 2 + (spec.bridgeWidth * S) / 2;

        const rightFrame = this._createFrame(spec, S, frameMat);
        rightFrame.position.copy(rightLens.position);

        const rightLensMesh = new THREE.Mesh(rightLens.geometry, lensMat);
        rightLensMesh.position.copy(rightLens.position);

        // === Bridge ===
        const bridge = this._createBridge(spec, S, frameMat);

        // === Temples (arms) ===
        const { left: leftTemple, right: rightTemple } = this._createTemples(spec, S, frameMat);

        // === Browline accent (for clubmaster) ===
        if (spec.browAccent) {
            const browMat = new THREE.MeshStandardMaterial({
                color: frameColor,
                metalness: 0.05,
                roughness: 0.8,
            });
            const browLeft = this._createBrowline(spec, S, browMat, -1);
            const browRight = this._createBrowline(spec, S, browMat, 1);
            group.add(browLeft, browRight);
        }

        group.add(leftFrame, rightFrame, leftLensMesh, rightLensMesh, bridge, leftTemple, rightTemple);

        // Store spec reference for adjustments
        group.userData = { spec, color: frameColor };

        return group;
    },

    _createLens(spec, S) {
        const w = spec.lensWidth * S;
        const h = spec.lensHeight * S;
        let geometry;

        switch (spec.lensShape) {
            case 'circle':
                geometry = new THREE.CircleGeometry(w / 2, 32);
                break;
            case 'teardrop':
                geometry = this._teardropGeometry(w, h);
                break;
            case 'cateye':
                geometry = this._cateyeGeometry(w, h);
                break;
            case 'rectangle':
                geometry = new THREE.PlaneGeometry(w, h);
                break;
            case 'trapezoid':
                geometry = this._trapezoidGeometry(w, h);
                break;
            case 'browline':
                geometry = new THREE.PlaneGeometry(w, h, 1, 1);
                break;
            default:
                geometry = new THREE.PlaneGeometry(w, h);
        }

        return { geometry, position: new THREE.Vector3() };
    },

    _createFrame(spec, S, material) {
        const w = spec.lensWidth * S;
        const h = spec.lensHeight * S;
        const thickness = 0.0015;

        // Frame ring using a torus-like shape (simplified as a ring)
        const outerShape = new THREE.Shape();
        const r = spec.lensShape === 'circle' ? w / 2 : Math.max(w, h) / 2;

        if (spec.lensShape === 'circle') {
            outerShape.absarc(0, 0, r + thickness, 0, Math.PI * 2, false);
            const hole = new THREE.Path();
            hole.absarc(0, 0, r, 0, Math.PI * 2, true);
            outerShape.holes.push(hole);
        } else {
            // Rectangular-ish frame
            const hw = w / 2 + thickness;
            const hh = h / 2 + thickness;
            const ihw = w / 2;
            const ihh = h / 2;
            const cr = thickness * 2;

            outerShape.moveTo(-hw + cr, -hh);
            outerShape.lineTo(hw - cr, -hh);
            outerShape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
            outerShape.lineTo(hw, hh - cr);
            outerShape.quadraticCurveTo(hw, hh, hw - cr, hh);
            outerShape.lineTo(-hw + cr, hh);
            outerShape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
            outerShape.lineTo(-hw, -hh + cr);
            outerShape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);

            const hole = new THREE.Path();
            hole.moveTo(-ihw, -ihh);
            hole.lineTo(ihw, -ihh);
            hole.lineTo(ihw, ihh);
            hole.lineTo(-ihw, ihh);
            hole.lineTo(-ihw, -ihh);
            outerShape.holes.push(hole);
        }

        const extrudeSettings = { depth: 0.003, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = -0.0015;
        return mesh;
    },

    _createBridge(spec, S, material) {
        const bw = spec.bridgeWidth * S + spec.lensWidth * S * 0.1;
        const bh = 0.003;
        const geometry = new THREE.BoxGeometry(bw, bh, 0.003);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = spec.lensShape === 'circle' ? 0 : spec.lensHeight * S * 0.15;
        return mesh;
    },

    _createTemples(spec, S, material) {
        const templeLength = 0.08;
        const templeThickness = spec.templeStyle === 'thick' ? 0.004 : 
                                spec.templeStyle === 'medium' ? 0.003 : 0.002;
        const templeHeight = spec.templeStyle === 'thick' ? 0.005 : 0.003;

        const lensOuter = spec.lensWidth * S / 2 + spec.bridgeWidth * S / 2 + spec.lensWidth * S / 2;

        const geo = new THREE.BoxGeometry(templeLength, templeHeight, templeThickness);

        const left = new THREE.Mesh(geo, material);
        left.position.set(-lensOuter - templeLength / 2, spec.lensHeight * S * 0.15, -0.001);
        left.rotation.y = 0.15; // slight angle back

        const right = new THREE.Mesh(geo, material);
        right.position.set(lensOuter + templeLength / 2, spec.lensHeight * S * 0.15, -0.001);
        right.rotation.y = -0.15;

        return { left, right };
    },

    _createBrowline(spec, S, material, side) {
        const w = spec.lensWidth * S;
        const h = spec.lensHeight * S * 0.25;
        const geometry = new THREE.BoxGeometry(w + 0.004, h, 0.005);
        const mesh = new THREE.Mesh(geometry, material);
        const xOffset = (spec.lensWidth * S / 2 + spec.bridgeWidth * S / 2) * side;
        mesh.position.set(xOffset, spec.lensHeight * S * 0.3, -0.001);
        return mesh;
    },

    _teardropGeometry(w, h) {
        const shape = new THREE.Shape();
        shape.moveTo(0, h * 0.4);
        shape.bezierCurveTo(w * 0.5, h * 0.5, w * 0.55, 0, w * 0.3, -h * 0.5);
        shape.bezierCurveTo(0, -h * 0.45, -w * 0.3, -h * 0.5, -w * 0.3, -h * 0.5);
        shape.bezierCurveTo(-w * 0.55, 0, -w * 0.5, h * 0.5, 0, h * 0.4);
        return new THREE.ShapeGeometry(shape);
    },

    _cateyeGeometry(w, h) {
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        shape.bezierCurveTo(-w / 2, -h / 2, w / 2, -h / 2, w / 2, 0);
        shape.bezierCurveTo(w / 2 + w * 0.08, h * 0.6, -w / 2 - w * 0.08, h * 0.6, -w / 2, 0);
        return new THREE.ShapeGeometry(shape);
    },

    _trapezoidGeometry(w, h) {
        const shape = new THREE.Shape();
        const topW = w * 0.45;
        const botW = w * 0.5;
        shape.moveTo(-topW, h / 2);
        shape.lineTo(topW, h / 2);
        shape.lineTo(botW, -h / 2);
        shape.lineTo(-botW, -h / 2);
        shape.lineTo(-topW, h / 2);
        return new THREE.ShapeGeometry(shape);
    }
};
