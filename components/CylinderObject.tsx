
import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
import { AppState, PatternType } from '../types';
import { applyDisplacement, generateHeightMap } from '../utils/geometryUtils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Props {
  config: AppState;
  setExportFunction: (fn: () => void) => void;
}

const CylinderObject: React.FC<Props> = ({ config, setExportFunction }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // INCREASE RESOLUTION to 4096 for cleaner text and less aliasing
  const TEXTURE_WIDTH = 4096;
  const TEXTURE_HEIGHT = 4096;

  // Use ExtrudeGeometry logic
  const bevelSize = 1; // Chamfer width
  const bevelThickness = 1; // Chamfer depth
  
  // Helper to build the extruded cylinder with square hole and plug
  const buildCylinderGeometry = (radius: number, height: number, depthOffset: number) => {
    // 1. Define Shape: Circle with Square Hole
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    const holePath = new THREE.Path();
    // 15x15 Square Hole -> Half width is 7.5
    const halfHole = 7.5; 
    holePath.moveTo(-halfHole, -halfHole);
    holePath.lineTo(halfHole, -halfHole);
    holePath.lineTo(halfHole, halfHole);
    holePath.lineTo(-halfHole, halfHole);
    shape.holes.push(holePath);

    // 2. Extrude
    // Effective height calculation: We want total height = 'height'.
    // Bevel adds to depth. Total Z = depth + 2*bevelThickness.
    const extrudeDepth = height - (2 * bevelThickness);
    
    // CRITICAL FIX: Increase 'steps' to ensure enough vertices for displacement along the height.
    // 4 segments per mm for VERY high fidelity and smooth edges.
    const steps = Math.floor(height * 4);

    const extrudeSettings = {
      depth: extrudeDepth,
      bevelEnabled: true,
      bevelThickness: bevelThickness,
      bevelSize: bevelSize,
      bevelSegments: 2,
      curveSegments: 400, // Very high resolution for smoothness around the circle
      steps: steps 
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // 3. Center the geometry
    geometry.center();

    // 4. Rotate to stand upright (Extrude is along Z by default)
    geometry.rotateX(Math.PI / 2);

    // 5. Fix UVs for the Outer Shell to allow wrapping
    // We iterate vertices. If radius is close to outer radius, we apply cylindrical mapping.
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const count = pos.count;
    const rThreshold = radius * 0.8; // Radius check to distinguish outer shell from inner hole

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const r = Math.sqrt(x * x + z * z);
      if (r > rThreshold) {
        // Cylindrical Mapping for outer shell
        const angle = Math.atan2(x, z); // -PI to PI
        let u = (angle / (2 * Math.PI)) + 0.5;
        // Map Y from -height/2 to height/2 -> 0 to 1
        let v = (y + height / 2) / height;
        uv.setXY(i, u, v);
      }
      // Inner hole and caps keep their default planar/projected UVs which is fine as we don't displace them.
    }

    // 6. Create the Plug (Solid core in the middle)
    // Sockets are 10mm deep at top and bottom.
    // Plug height = height - 20 (10mm top + 10mm bottom).
    const plugHeight = Math.max(0.1, height - 20);
    // Plug must fill the 15x15 hole.
    const plugGeo = new THREE.BoxGeometry(15, plugHeight, 15);
    // Plug is already centered at 0,0,0
    
    // 7. Merge them into one solid geometry for easier export/handling
    // FIX: Convert both to non-indexed to ensure compatibility for mergeGeometries.
    // This avoids errors if one is indexed and the other is not, or if attribute counts mismatch.
    const geometryNonIndexed = geometry.toNonIndexed();
    const plugGeoNonIndexed = plugGeo.toNonIndexed();

    // Clean up original geometries
    geometry.dispose();
    plugGeo.dispose();

    const merged = mergeGeometries([geometryNonIndexed, plugGeoNonIndexed]);
    
    return merged;
  };

  const [displayGeoPositive, setDisplayGeoPositive] = useState<THREE.BufferGeometry | null>(null);
  const [displayGeoNegative, setDisplayGeoNegative] = useState<THREE.BufferGeometry | null>(null);

  // Handle Export
  useEffect(() => {
    setExportFunction(() => {
      if (!groupRef.current) return;
      const exporter = new STLExporter();
      const str = exporter.parse(groupRef.current, { binary: true });
      const blob = new Blob([str], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `embossed_cylinder_set_${Date.now()}.stl`;
      link.click();
    });
  }, [setExportFunction]);

  // Update Geometry Effect
  useEffect(() => {
    let isCancelled = false;

    const updateGeometry = async () => {
      // 1. Generate Height Map (Async now)
      const canvas = await generateHeightMap(
        config.patternType === PatternType.TEXT ? 'text' : 'image',
        config.patternType === PatternType.TEXT ? config.text : (config.imageSrc || ''),
        TEXTURE_WIDTH,
        TEXTURE_HEIGHT,
        {
          fontSize: config.fontSize,
          fontFamily: config.fontFamily,
          letterSpacing: config.letterSpacing,
          spacingX: config.spacingX,
          spacingY: config.spacingY,
          tilt: config.tilt,
          imageScale: config.imageScale
        }
      );

      if (isCancelled) return;

      // 2. Positive Cylinder (Left) - Emboss OUT
      // Radius = config.cylinderRadius. Base surface is at R. Emboss goes to R + depth.
      const posGeo = buildCylinderGeometry(config.cylinderRadius, config.cylinderHeight, 0);
      if (posGeo) {
        applyDisplacement(posGeo, canvas, config.embossDepth, config.cylinderRadius * 0.9);
        if (!isCancelled) setDisplayGeoPositive(posGeo);
      }

      // 3. Negative Cylinder (Right) - Engrave IN
      // Radius = config.cylinderRadius + config.embossDepth. 
      // This allows the "Positive" cylinder (R + Depth) to fit inside this one (Base R + Depth - Depth = R).
      const outerRadius = config.cylinderRadius + config.embossDepth;
      const negGeo = buildCylinderGeometry(outerRadius, config.cylinderHeight, 0);
      if (negGeo) {
        // Apply negative displacement
        applyDisplacement(negGeo, canvas, -config.embossDepth, outerRadius * 0.9);
        if (!isCancelled) setDisplayGeoNegative(negGeo);
      }
    };

    updateGeometry();

    return () => {
      isCancelled = true;
    };
  }, [
    config.patternType,
    config.text,
    config.imageSrc,
    config.fontSize,
    config.fontFamily,
    config.letterSpacing,
    config.spacingX,
    config.spacingY,
    config.tilt,
    config.embossDepth,
    config.imageScale,
    config.cylinderRadius,
    config.cylinderHeight
  ]);

  const offset = config.cylinderRadius * 2.5 + 20;

  if (!displayGeoPositive || !displayGeoNegative) return null;

  return (
    <group ref={groupRef}>
      {/* Positive */}
      <mesh geometry={displayGeoPositive} position={[-offset/2, 0, 0]}>
        <meshStandardMaterial color="#3b82f6" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Negative */}
      <mesh geometry={displayGeoNegative} position={[offset/2, 0, 0]}>
        <meshStandardMaterial color="#ef4444" roughness={0.5} metalness={0.1} />
      </mesh>
    </group>
  );
};

export default CylinderObject;
