// One-click photo Enhance for Vice Coast Cover Studio 2: per-panel photo
// tuning, done entirely offline in canvas 2D — no library, no network, no
// upload. Every panel carries its own enhance state, so one panel can glow
// golden while the next pops neon, and the same drawing path feeds the live
// preview and the exported PNG, so what you see is what the PNG gets.
//
// The five dials, all deltas around zero:
//   brightness, contrast, saturation, warmth: -100..100 (0 = untouched)
//   sharpness: 0..100 (0 = off)
// Brightness, contrast and saturation ride on the canvas 2D filter, warmth is
// a tint overlay, and sharpness is a real unsharp-mask convolution on an
// offscreen copy of the panel (see sharpenCanvas).

/** A fresh, untouched enhance state: every dial at its neutral value. */
export function defaultEnhance() {
  return { brightness: 0, contrast: 0, saturation: 0, sharpness: 0, warmth: 0 };
}

/** The one-click Auto-enhance: a gentle lift on every dial at once. */
export const AUTO_ENHANCE = {
  brightness: 8,
  contrast: 12,
  saturation: 15,
  sharpness: 30,
  warmth: 5,
};

/** Three named looks, each a fixed set of dial positions. */
export const ENHANCE_PRESETS = {
  golden: {
    name: 'Golden Hour',
    values: { brightness: 6, contrast: 10, saturation: 20, sharpness: 25, warmth: 26 },
  },
  neon: {
    name: 'Neon Pop',
    values: { brightness: 0, contrast: 24, saturation: 32, sharpness: 35, warmth: -20 },
  },
  clean: {
    name: 'Clean & Bright',
    values: { brightness: 16, contrast: -8, saturation: 6, sharpness: 20, warmth: 2 },
  },
};

/**
 * A fresh copy of the dials for a preset key: 'auto', 'golden', 'neon' or
 * 'clean'. Anything else (or nothing) gives the untouched defaults, so a bad
 * query value can never break a screenshot scene.
 */
export function presetValues(key) {
  if (key === 'auto') return { ...AUTO_ENHANCE };
  const preset = ENHANCE_PRESETS[key];
  return preset ? { ...preset.values } : defaultEnhance();
}

/** True when every dial sits at its neutral value — nothing to do. */
export function isDefaultEnhance(enhance) {
  if (!enhance) return true;
  return (
    enhance.brightness === 0 &&
    enhance.contrast === 0 &&
    enhance.saturation === 0 &&
    enhance.sharpness === 0 &&
    enhance.warmth === 0
  );
}

/**
 * The CSS filter string for the light-and-colour dials, for ctx.filter. A
 * delta of +12 becomes contrast(1.12); zero dials still produce a valid,
 * identity filter, so callers never need a special case.
 */
export function enhanceFilter(enhance) {
  if (!enhance) return 'none';
  const b = 1 + enhance.brightness / 100;
  const c = 1 + enhance.contrast / 100;
  const s = 1 + enhance.saturation / 100;
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

/**
 * Warms or cools a panel with a soft tint overlay, clipped by the caller's
 * path. Positive warmth leans amber, negative leans icy blue; the overlay
 * blend keeps shadows and highlights readable instead of washing them out.
 */
export function applyWarmth(ctx, rect, warmth) {
  if (!warmth) return;
  const alpha = Math.min(0.3, (Math.abs(warmth) / 100) * 0.32);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = warmth > 0 ? `rgba(255,138,42,${alpha})` : `rgba(46,120,255,${alpha})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/**
 * Sharpens a canvas in place with a 3x3 unsharp-mask convolution: each pixel
 * is pushed away from its four neighbours, blended by `amount` (0..100, so
 * 30 means 30% of the full sharpen). Edges are copied through untouched.
 * Runs on the panel-sized offscreen copy, never on the whole cover, so the
 * cost stays proportional to one panel.
 */
export function sharpenCanvas(canvas, amount) {
  if (amount <= 0) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (w < 3 || h < 3) return;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const d = src.data;
  const o = out.data;
  const strength = amount / 100;
  o.set(d); // edges and alpha pass through unchanged
  const row = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const sharp = 5 * d[i + c] - d[i - 4 + c] - d[i + 4 + c] - d[i - row + c] - d[i + row + c];
        o[i + c] = Math.max(0, Math.min(255, d[i + c] + (sharp - d[i + c]) * strength));
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}
