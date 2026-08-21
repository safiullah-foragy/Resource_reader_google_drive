/**
 * Snapseed-Style Photo Processing Engine
 * High-performance, pixel-level color grading, tone mapping, ambiance, and effects
 */

export interface PhotoAdjustments {
  brightness: number;   // -100 to 100 (default 0)
  contrast: number;     // -100 to 100 (default 0)
  saturation: number;   // -100 to 100 (default 0)
  ambiance: number;     // -100 to 100 (default 0)
  highlights: number;   // -100 to 100 (default 0)
  shadows: number;      // -100 to 100 (default 0)
  warmth: number;       // -100 to 100 (default 0)
  tint: number;         // -100 to 100 (default 0)
  sharpness: number;    // 0 to 100 (default 0)
  vignette: number;     // 0 to 100 (default 0)
  grain: number;        // 0 to 100 (default 0)
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  ambiance: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  tint: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
};

export interface PhotoPreset {
  id: string;
  name: string;
  icon?: string;
  adjustments: Partial<PhotoAdjustments>;
}

export const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: 'original',
    name: 'Original',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: 'pop',
    name: 'Pop',
    adjustments: {
      brightness: 5,
      contrast: 22,
      saturation: 25,
      ambiance: 18,
      highlights: -10,
      shadows: 15,
      sharpness: 20,
    },
  },
  {
    id: 'hdr_scape',
    name: 'HDR Scape',
    adjustments: {
      brightness: 4,
      contrast: 15,
      saturation: 20,
      ambiance: 45,
      highlights: -35,
      shadows: 40,
      sharpness: 35,
      warmth: 5,
    },
  },
  {
    id: 'portrait',
    name: 'Portrait',
    adjustments: {
      brightness: 8,
      contrast: -5,
      saturation: 10,
      ambiance: 15,
      highlights: 5,
      shadows: 20,
      warmth: 12,
      vignette: 15,
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    adjustments: {
      brightness: -4,
      contrast: 28,
      saturation: -10,
      ambiance: 20,
      highlights: -20,
      shadows: 10,
      warmth: 15,
      tint: -12,
      vignette: 35,
    },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    adjustments: {
      brightness: 6,
      contrast: 12,
      saturation: 18,
      ambiance: 22,
      highlights: -12,
      shadows: 20,
      warmth: 42,
      tint: 8,
      vignette: 20,
    },
  },
  {
    id: 'drama',
    name: 'Drama',
    adjustments: {
      brightness: -8,
      contrast: 35,
      saturation: -25,
      ambiance: 35,
      highlights: -30,
      shadows: 25,
      sharpness: 30,
      vignette: 30,
    },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    adjustments: {
      brightness: 4,
      contrast: -12,
      saturation: -18,
      ambiance: 10,
      shadows: 35,
      warmth: 25,
      tint: 10,
      vignette: 40,
      grain: 25,
    },
  },
  {
    id: 'bw_fine_art',
    name: 'B&W Fine Art',
    adjustments: {
      brightness: 0,
      contrast: 38,
      saturation: -100,
      ambiance: 25,
      highlights: -15,
      shadows: 18,
      sharpness: 25,
      vignette: 25,
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    adjustments: {
      brightness: -12,
      contrast: 55,
      saturation: -100,
      ambiance: -10,
      highlights: -20,
      shadows: -15,
      sharpness: 30,
      vignette: 55,
      grain: 35,
    },
  },
  {
    id: 'matte',
    name: 'Matte Film',
    adjustments: {
      brightness: 5,
      contrast: -18,
      saturation: -8,
      shadows: 45,
      highlights: -15,
      warmth: 10,
      vignette: 20,
      grain: 20,
    },
  },
];

/**
 * Fast pixel-level color grading and tone enhancement
 */
export function applyPhotoAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  adj: PhotoAdjustments
): void {
  // Check if any pixel-level adjustment is active
  const hasAdjustments =
    adj.brightness !== 0 ||
    adj.contrast !== 0 ||
    adj.saturation !== 0 ||
    adj.ambiance !== 0 ||
    adj.highlights !== 0 ||
    adj.shadows !== 0 ||
    adj.warmth !== 0 ||
    adj.tint !== 0 ||
    adj.grain !== 0;

  if (hasAdjustments) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    // Normalizing factors
    const br = adj.brightness * 1.8; // -180 to 180
    const ct = (adj.contrast + 100) / 100; // 0 to 2
    const ctFactor = Math.tan(((ct * 45 + 45) * Math.PI) / 180) / 2.414;
    const sat = (adj.saturation + 100) / 100; // 0 to 2
    const amb = adj.ambiance / 100; // -1 to 1
    const hl = adj.highlights / 100; // -1 to 1
    const sh = adj.shadows / 100; // -1 to 1
    const warm = adj.warmth * 0.9; // -90 to 90
    const tint = adj.tint * 0.7; // -70 to 70
    const grainAmt = (adj.grain / 100) * 35; // 0 to 35

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. Luminance (Rec. 709)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const normLum = lum / 255;

      // 2. Highlights & Shadows curve
      let toneOffset = 0;
      if (normLum < 0.5) {
        // Shadows lifting or deepening
        const shadowWeight = Math.pow(1 - normLum * 2, 1.5);
        toneOffset += sh * 48 * shadowWeight;
      } else {
        // Highlights recovery or boost
        const highlightWeight = Math.pow((normLum - 0.5) * 2, 1.5);
        toneOffset += hl * 42 * highlightWeight;
      }

      // 3. Ambiance (boosts dynamic range & saturates underexposed regions)
      if (amb !== 0) {
        const ambCurve = Math.sin(normLum * Math.PI);
        toneOffset += amb * 28 * ambCurve;
      }

      r += br + toneOffset;
      g += br + toneOffset;
      b += br + toneOffset;

      // 4. Contrast
      if (adj.contrast !== 0) {
        r = (r - 128) * ctFactor + 128;
        g = (g - 128) * ctFactor + 128;
        b = (b - 128) * ctFactor + 128;
      }

      // 5. Warmth (Temperature: Red vs Blue) & Tint (Green vs Magenta)
      if (warm !== 0) {
        r += warm * 0.75;
        b -= warm * 0.75;
      }
      if (tint !== 0) {
        g -= tint * 0.8;
        r += tint * 0.4;
        b += tint * 0.4;
      }

      // 6. Saturation (including Ambiance saturation boost for shadows)
      let effectiveSat = sat;
      if (amb > 0 && normLum < 0.6) {
        effectiveSat += amb * 0.35 * (1 - normLum);
      }

      if (effectiveSat !== 1) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * effectiveSat;
        g = gray + (g - gray) * effectiveSat;
        b = gray + (g - gray) * effectiveSat;
      }

      // 7. Film Grain
      if (grainAmt > 0) {
        const noise = (Math.random() - 0.5) * grainAmt;
        r += noise;
        g += noise;
        b += noise;
      }

      // Clamp 0-255
      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // 8. Sharpness (High-Pass Unsharp Mask)
  if (adj.sharpness > 0) {
    applySharpnessFilter(ctx, width, height, adj.sharpness);
  }

  // 9. Vignette (Smooth cinematic radial shadow)
  if (adj.vignette > 0) {
    applyVignetteFilter(ctx, width, height, adj.vignette);
  }
}

/**
 * 3x3 Convolution Sharpness filter for crisp textures and details
 */
function applySharpnessFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sharpness: number
): void {
  const strength = (sharpness / 100) * 0.75;
  if (strength <= 0) return;

  const srcData = ctx.getImageData(0, 0, width, height);
  const src = srcData.data;
  const dstData = ctx.createImageData(width, height);
  const dst = dstData.data;

  // Copy alpha & base
  dst.set(src);

  const centerWeight = 1 + 4 * strength;
  const edgeWeight = -strength;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width * 4;
    const prevRowOffset = (y - 1) * width * 4;
    const nextRowOffset = (y + 1) * width * 4;

    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x * 4;
      const left = rowOffset + (x - 1) * 4;
      const right = rowOffset + (x + 1) * 4;
      const top = prevRowOffset + x * 4;
      const bottom = nextRowOffset + x * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          src[idx + c] * centerWeight +
          (src[left + c] + src[right + c] + src[top + c] + src[bottom + c]) * edgeWeight;
        dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);
}

/**
 * Smooth natural Vignette radial darkening
 */
function applyVignetteFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vignette: number
): void {
  const intensity = (vignette / 100) * 0.85;
  if (intensity <= 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

  ctx.save();
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    maxRadius * 0.35,
    centerX,
    centerY,
    maxRadius
  );

  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${intensity * 0.2})`);
  gradient.addColorStop(0.85, `rgba(0, 0, 0, ${intensity * 0.65})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
