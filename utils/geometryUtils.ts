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
    
    // Ensure fonts are loaded before drawing
    await document.fonts.ready;
    
    try {
      (ctx as any).letterSpacing = `${scaledLetterSpacing}px`;
    } catch (e) {
      // Ignore
    }
    
    ctx.font = `bold ${scaledFontSize}px "${font}", sans-serif`;
    
    const textMetrics = ctx.measureText(content);
    const textWidth = textMetrics.width;
    const textHeight = scaledFontSize; 

    const cols = Math.ceil(width / (textWidth + scaledSpacingX)) + 2;
    const rows = Math.ceil(height / (textHeight + scaledSpacingY)) + 2;

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
    const img = new Image();
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = content;
    });

    if (img.naturalWidth > 0) {
       const aspect = img.naturalWidth / img.naturalHeight;
       const baseDrawSize = 100 * scaleFactor;
       const drawWidth = baseDrawSize * options.imageScale * aspect;
       const drawHeight = baseDrawSize * options.imageScale;
       
       const cols = Math.ceil(width / (drawWidth + scaledSpacingX)) + 2;
       const rows = Math.ceil(height / (drawHeight + scaledSpacingY)) + 2;
       
       const stamp = document.createElement('canvas');
       stamp.width = Math.ceil(drawWidth * 1.5); 
       stamp.height = Math.ceil(drawHeight * 1.5);
       const sCtx = stamp.getContext('2d');
       
       if (sCtx) {
           sCtx.translate(stamp.width/2, stamp.height/2);
           sCtx.drawImage(img, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
           
           sCtx.globalCompositeOperation = 'source-in';
           sCtx.fillStyle = '#FFFFFF';
           sCtx.fillRect(-stamp.width/2, -stamp.height/2, stamp.width, stamp.height);
       }

       ctx.filter = `blur(${1 * (scaleFactor * 0.5)}px)`;

       for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * (drawWidth + scaledSpacingX);
          const y = j * (drawHeight + scaledSpacingY);
  
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((options.tilt * Math.PI) / 180);
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
  const data = imgData.data;

  const vector = new Vector3();
  const normal = new Vector3();

  for (let i = 0; i < posAttribute.count; i++) {
    const x = posAttribute.getX(i);
    const z = posAttribute.getZ(i);

    const r = Math.sqrt(x * x + z * z);
    if (r < minRadiusThreshold) {
      continue;
    }

    const ny = normalAttribute.getY(i);
    if (Math.abs(ny) > 0.5) {
      continue; 
    }

    const u = uvAttribute.getX(i);
    const v = uvAttribute.getY(i);

    if (v < 0.05 || v > 0.95) {
       continue;
    }

    let px = Math.floor(u * width) % width;
    let py = Math.floor(v * height) % height;
    
    if (px < 0) px += width;
    if (py < 0) py += height;

    const index = (py * width + px) * 4;
    const rawHeight = data[index] / 255.0;

    let heightValue = 0;
    const edgeStart = 0.40;
    const edgeEnd = 0.60;
    
    if (rawHeight > edgeStart) {
        const t = Math.min(Math.max((rawHeight - edgeStart) / (edgeEnd - edgeStart), 0), 1);
        heightValue = t * t * (3 - 2 * t);
    }

    if (heightValue > 0) {
      normal.set(
        normalAttribute.getX(i),
        normalAttribute.getY(i),
        normalAttribute.getZ(i)
      );

      vector.set(
        posAttribute.getX(i),
        posAttribute.getY(i),
        posAttribute.getZ(i)
      );

      vector.addScaledVector(normal, heightValue * displacementScale);
      posAttribute.setXYZ(i, vector.x, vector.y, vector.z);
    }
  }

  posAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
};