
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Generates a heightmap canvas based on the input text or image and parameters.
 * Returns the ImageData context to be used for displacement.
 */
export const generateHeightMap = async (
  type: 'text' | 'image',
  content: string,
  width: number,
  height: number,
  options: {
    fontSize: number;
    fontFamily?: string;
    letterSpacing?: number;
    spacingX: number;
    spacingY: number;
    tilt: number;
    imageScale: number;
  }
): Promise<HTMLCanvasElement> => {
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
  
  // SCALING FACTOR
  // The UI parameters are calibrated for a standard 1024px texture.
  // Since we use 4096px for high quality, we must scale up the drawing operations.
  const BASE_RESOLUTION = 1024;
  const scaleFactor = width / BASE_RESOLUTION;

  const scaledFontSize = options.fontSize * scaleFactor;
  const scaledSpacingX = options.spacingX * scaleFactor;
  const scaledSpacingY = options.spacingY * scaleFactor;
  const scaledLetterSpacing = (options.letterSpacing || 0) * scaleFactor;

  // Save context for rotation
  ctx.save();

  // Draw pattern
  if (type === 'text') {
    const font = options.fontFamily || 'Inter';
    
    // Apply letter spacing if supported (Modern Browsers)
    // Cast to any because TS types might be outdated for canvas letterSpacing
    try {
      (ctx as any).letterSpacing = `${scaledLetterSpacing}px`;
    } catch (e) {
      // Ignore if not supported
    }
    
    ctx.font = `bold ${scaledFontSize}px "${font}", sans-serif`;
    
    // Add text metrics measurement
    const textMetrics = ctx.measureText(content);
    // Rough width estimation including spacing
    const textWidth = textMetrics.width;
    const textHeight = scaledFontSize; 

    // Calculate grid
    // Use the scaled dimensions to determine columns/rows
    const cols = Math.ceil(width / (textWidth + scaledSpacingX)) + 2;
    const rows = Math.ceil(height / (textHeight + scaledSpacingY)) + 2;

    // Apply a slight blur for better normal map / displacement smoothness (Anti-aliasing)
    // Scale blur radius slightly with resolution, but keep it tight for sharpness.
    ctx.filter = `blur(${1 * (scaleFactor * 0.5)}px)`;

    for (let i = -1; i < cols; i++) {
      for (let j = -1; j < rows; j++) {
        const x = i * (textWidth + scaledSpacingX);
        const y = j * (textHeight + scaledSpacingY);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((options.tilt * Math.PI) / 180);
        ctx.fillText(content, 0, 0);
        ctx.restore();
      }
    }
  } else if (type === 'image' && content) {
    // Determine file type handling
    // For SVG or Images, we load them into an Image object
    const img = new Image();
    
    // Wrap image loading in a promise to handle sync/async nature
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = content;
    });

    if (img.naturalWidth > 0) {
       const aspect = img.naturalWidth / img.naturalHeight;
       // Base size 100px * scale * resolutionFactor
       const baseDrawSize = 100 * scaleFactor;
       const drawWidth = baseDrawSize * options.imageScale * aspect;
       const drawHeight = baseDrawSize * options.imageScale;
       
       const cols = Math.ceil(width / (drawWidth + scaledSpacingX)) + 2;
       const rows = Math.ceil(height / (drawHeight + scaledSpacingY)) + 2;
       
       // Prepare a single instance of the image as a "White Silhouette"
       // This ensures "Internal Filled Full" behavior for logos/shapes
       const stamp = document.createElement('canvas');
       // Make stamp large enough for high quality
       stamp.width = Math.ceil(drawWidth * 1.5); 
       stamp.height = Math.ceil(drawHeight * 1.5);
       const sCtx = stamp.getContext('2d');
       
       if (sCtx) {
           sCtx.translate(stamp.width/2, stamp.height/2);
           // Draw original image
           sCtx.drawImage(img, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
           
           // Force non-transparent pixels to be white (fill inside)
           // This uses the alpha channel of the image to define the shape,
           // but fills the color with pure white.
           sCtx.globalCompositeOperation = 'source-in';
           sCtx.fillStyle = '#FFFFFF';
           sCtx.fillRect(-stamp.width/2, -stamp.height/2, stamp.width, stamp.height);
       }

       // Apply blur for smoother edges on SVGs/Images too
       ctx.filter = `blur(${1 * (scaleFactor * 0.5)}px)`;

       for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * (drawWidth + scaledSpacingX);
          const y = j * (drawHeight + scaledSpacingY);
  
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((options.tilt * Math.PI) / 180);
          // Draw the prepared white silhouette stamp
          ctx.drawImage(stamp, -stamp.width/2, -stamp.height/2);
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
    // Use u directly.
    let px = Math.floor(u * width) % width;
    let py = Math.floor(v * height) % height;
    
    if (px < 0) px += width;
    if (py < 0) py += height;

    const index = (py * width + px) * 4;
    // Normalized height 0..1
    const rawHeight = data[index] / 255.0;

    // SHARPENING LOGIC with SMOOTHSTEP
    // Instead of a hard cliff, we use a smoothstep for a slightly more organic but still distinct edge.
    // This reduces "tearing" and jagged pixels.
    // Range 0.45 -> 0.55 gives a relatively sharp edge with a small transition zone.
    
    let heightValue = 0;
    const edgeStart = 0.40;
    const edgeEnd = 0.60;
    
    if (rawHeight > edgeStart) {
        // Hermite interpolation
        const t = Math.min(Math.max((rawHeight - edgeStart) / (edgeEnd - edgeStart), 0), 1);
        heightValue = t * t * (3 - 2 * t); // Smoothstep formula
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
