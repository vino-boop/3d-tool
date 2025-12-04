import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
import { AppState, PatternType } from '../types';
import { applyDisplacement, generateHeightMap } from '../utils/geometryUtils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Props {
  config: AppState;
  setExportFunction: (fn: () => void) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

const CylinderObject: React.FC<Props> = ({ config, setExportFunction, onProcessingChange }) => {
  const groupRef = useRef<THREE.Group>(null);
  
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
    
    // OPTIMIZATION: Reduce steps to improve performance while maintaining smoothness
    // 2.5 segments per mm is sufficient for high quality displacement on this scale
    const steps = Math.floor(height * 2.5);

    const extrudeSettings = {
      depth: extrudeDepth,
      bevelEnabled: true,
      bevelThickness: bevelThickness,
      bevelSize: bevelSize,
      bevelSegments: 2,
      curveSegments: 150, // Reduced from 400 to 150 for significant performance gain
      steps: steps 
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // 3. Center the geometry
    geometry.center();

    // 4. Rotate to stand upright (Extrude is along Z by default)
    geometry.rotateX(Math.PI / 2);

    // 5. Fix UVs for the Outer Shell
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const count = pos.count;
    const rThreshold = radius * 0.8;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const r = Math.sqrt(x * x + z * z);
      if (r > rThreshold) {
        // Cylindrical Mapping for outer shell
        const angle = Math.atan2(x, z);
        let u = (angle / (2 * Math.PI)) + 0.5;
        let v = (y + height / 2) / height;
        uv.setXY(i, u, v);
      }
    }

    // 6. Create the Plug (Solid core in the middle)
    // Sockets are 15mm deep at top and bottom.
    // Plug height = height - (TopDepth + BottomDepth) = height - 30.
    const plugHeight = Math.max(0.1, height - 30);
    const plugGeo = new THREE.BoxGeometry(15, plugHeight, 15);
    
    // 7. Merge them
    const geometryNonIndexed = geometry.toNonIndexed();
    const plugGeoNonIndexed = plugGeo.toNonIndexed();

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

  // Update Geometry Effect with Debounce
  useEffect(() => {
    let isCancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const updateGeometry = async () => {
      if (isCancelled) return;

      // 1. Generate Height Map (Async)
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

      // 2. Positive Cylinder
      const posGeo = buildCylinderGeometry(config.cylinderRadius, config.cylinderHeight, 0);
      if (posGeo) {
        applyDisplacement(posGeo, canvas, config.embossDepth, config.cylinderRadius * 0.9);
        if (!isCancelled) setDisplayGeoPositive(posGeo);
      }

      // 3. Negative Cylinder
      const outerRadius = config.cylinderRadius + config.embossDepth;
      const negGeo = buildCylinderGeometry(outerRadius, config.cylinderHeight, 0);
      if (negGeo) {
        applyDisplacement(negGeo, canvas, -config.embossDepth, outerRadius * 0.9);
        if (!isCancelled) setDisplayGeoNegative(negGeo);
      }

      // Done
      if (!isCancelled) onProcessingChange(false);
    };

    // Start loading state immediately
    onProcessingChange(true);

    // Debounce: Wait 500ms after last change before processing
    debounceTimer = setTimeout(() => {
      updateGeometry();
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(debounceTimer);
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
    config.cylinderHeight,
    onProcessingChange
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