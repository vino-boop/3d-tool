
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Generates a heightmap canvas based on the input text or image and parameters.
 * Returns the ImageData context to be used for displacement.
 */
export const generateHeightMap = (
  type: 'text' | 'image',
  content: string,
  width: number,
  height: number,
  options: {
    fontSize: number;
    spacingX: number;
    spacingY: number;
    tilt: number;
    imageScale: number;
  }
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) return canvas;

  // Background: Black (Height 0)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Foreground: White (Height 1)
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Save context for rotation
  ctx.save();

  // Draw pattern
  if (type === 'text') {
    ctx.font = `bold ${options.fontSize}px Arial`;
    const textMetrics = ctx.measureText(content);
    const textWidth = textMetrics.width;
    const textHeight = options.fontSize; // Approx

    // Calculate grid
    const cols = Math.ceil(width / (textWidth + options.spacingX)) + 2;
    const rows = Math.ceil(height / (textHeight + options.spacingY)) + 2;

    for (let i = -1; i < cols; i++) {
      for (let j = -1; j < rows; j++) {
        const x = i * (textWidth + options.spacingX);
        const y = j * (textHeight + options.spacingY);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((options.tilt * Math.PI) / 180);
        ctx.fillText(content, 0, 0);
        ctx.restore();
      }
    }
  } else if (type === 'image' && content) {
    const img = new Image();
    img.src = content;
    
    if (img.complete && img.naturalWidth > 0) {
       const aspect = img.naturalWidth / img.naturalHeight;
       const drawWidth = 50 * options.imageScale * aspect;
       const drawHeight = 50 * options.imageScale;
       
       const cols = Math.ceil(width / (drawWidth + options.spacingX)) + 2;
       const rows = Math.ceil(height / (drawHeight + options.spacingY)) + 2;

       for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * (drawWidth + options.spacingX);
          const y = j * (drawHeight + options.spacingY);
  
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((options.tilt * Math.PI) / 180);
          ctx.drawImage(img, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();
  return canvas;
};

/**
 * Modifies the BufferGeometry positions based on the heightmap data.
 * @param minRadiusThreshold Vertices closer to the center than this will NOT be displaced (protects inner holes).
 */
export const applyDisplacement = (
  geometry: BufferGeometry,
  heightMap: HTMLCanvasElement,
  displacementScale: number,
  minRadiusThreshold: number
) => {
  if (!geometry.attributes.uv || !geometry.attributes.normal) return;

  const posAttribute = geometry.attributes.position as BufferAttribute;
  const normalAttribute = geometry.attributes.normal as BufferAttribute;
  const uvAttribute = geometry.attributes.uv as BufferAttribute;

  const width = heightMap.width;
  const height = heightMap.height;
  const ctx = heightMap.getContext('2d');
  if (!ctx) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data; // RGBA

  const vector = new Vector3();
  const normal = new Vector3();

  // Iterate over all vertices
  for (let i = 0; i < posAttribute.count; i++) {
    const x = posAttribute.getX(i);
    const z = posAttribute.getZ(i);

    // 1. RADIUS CHECK (Crucial for Extruded Shapes)
    // Only apply displacement to the OUTER shell.
    // Skip vertices that form the inner square hole or are too close to center.
    const r = Math.sqrt(x * x + z * z);
    if (r < minRadiusThreshold) {
      continue;
    }

    // 2. SKIP CAPS (Keep cylinder solid and safe)
    // Cylinder side normals point roughly horizontally (y=0). 
    // Cap normals point up (1) or down (-1).
    const ny = normalAttribute.getY(i);
    if (Math.abs(ny) > 0.5) {
      continue; 
    }

    // Get UV coordinates
    const u = uvAttribute.getX(i);
    const v = uvAttribute.getY(i);

    // 3. FLAT EDGES "SAFE ZONE"
    // Force top 5% and bottom 5% of the side wall to be flat (0 displacement).
    if (v < 0.05 || v > 0.95) {
       continue;
    }

    // 4. FIX MIRRORING / REVERSED TEXT
    // Use u directly instead of (1-u) to fix reversed text.
    let px = Math.floor(u * width) % width;
    let py = Math.floor(v * height) % height;
    
    if (px < 0) px += width;
    if (py < 0) py += height;

    const index = (py * width + px) * 4;
    const rawHeight = data[index] / 255.0;

    // SHARPENING LOGIC:
    // Tight threshold range to create sharp, steep walls instead of sloped hills.
    // Adjusted to 0.4 - 0.6 to ensure better visibility if anti-aliasing is soft.
    let heightValue = 0;
    const minT = 0.40; 
    const maxT = 0.60; 
    
    if (rawHeight > minT) {
        heightValue = (rawHeight - minT) / (maxT - minT);
        if (heightValue > 1.0) heightValue = 1.0;
    }

    // Apply displacement
    if (heightValue > 0) {
      // Get Normal
      normal.set(
        normalAttribute.getX(i),
        normalAttribute.getY(i),
        normalAttribute.getZ(i)
      );

      // Get Position
      vector.set(
        posAttribute.getX(i),
        posAttribute.getY(i),
        posAttribute.getZ(i)
      );

      // Add displacement along normal
      vector.addScaledVector(normal, heightValue * displacementScale);
      posAttribute.setXYZ(i, vector.x, vector.y, vector.z);
    }
  }

  posAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
};
