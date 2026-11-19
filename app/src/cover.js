// Vice Coast's cover engine, v2: draws a multi-panel poster cover onto a
// canvas from the editor state. Pure canvas 2D, no libraries, no network, no
// fonts to load — lettering is heavy system sans with a sunset gradient fill,
// and the script subtitle uses the browser's generic cursive face. New in v2:
// every panel carries its own Enhance state (see enhance.js), applied here in
// drawPanelPhoto, so the live preview and the exported PNG match exactly.

import { defaultEnhance, enhanceFilter, applyWarmth, sharpenCanvas } from './enhance.js';

export const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Landscape 1920 x 1080' },
};

export const LAYOUTS = {
  nine: { name: 'Nine Panel', panels: 8, blurb: '3 x 3 grid, title in the middle' },
  hero: { name: 'Hero + Three', panels: 4, blurb: 'One big hero, three stacked' },
  four: { name: 'Four Square', panels: 4, blurb: '2 x 2 grid over a title band' },
  bleed: { name: 'Full Bleed', panels: 1, blurb: 'One photo edge to edge' },
};

export const GRADES = {
  sunset: { name: 'Sunset', mode: 'overlay', stops: [[0, 'rgba(255,170,60,0.10)'], [0.55, 'rgba(255,90,60,0.16)'], [1, 'rgba(255,40,120,0.30)']] },
  neon: { name: 'Neon Night', mode: 'overlay', stops: [[0, 'rgba(255,45,149,0.24)'], [0.5, 'rgba(120,40,200,0.12)'], [1, 'rgba(0,229,255,0.24)']] },
  vice: { name: 'Vice Gold', mode: 'soft-light', stops: [[0, 'rgba(140,60,220,0.35)'], [0.6, 'rgba(255,150,40,0.25)'], [1, 'rgba(255,190,60,0.35)']] },
  heat: { name: 'Heat Wave', mode: 'overlay', stops: [[0, 'rgba(255,120,0,0.14)'], [1, 'rgba(255,30,10,0.34)']] },
  noir: { name: 'Noir Teal', mode: 'overlay', desat: true, stops: [[0, 'rgba(0,80,110,0.10)'], [1, 'rgba(0,40,70,0.30)']] },
};

/** A fresh editor state: nine empty panels, each with untouched Enhance. */
export function defaultState() {
  return {
    layout: 'nine',
    size: '1080x1080',
    grade: 'sunset',
    title: 'VICE COAST',
    subtitle: 'one last ride',
    grain: true,
    vignette: true,
    frame: true,
    photos: [],
    panels: Array.from({ length: 9 }, () => ({
      photo: -1,
      zoom: 1,
      ox: 0,
      oy: 0,
      enhance: defaultEnhance(),
    })),
    selected: 0,
  };
}

/**
 * Panel and title rectangles for a layout, in canvas pixels. `kind` says how
 * the title block is drawn: 'center' for the middle cell of the nine-panel
 * grid, 'band' for the strip along the foot of the other layouts.
 */
export function layoutRects(layout, W, H) {
  const g = Math.max(4, Math.round(Math.min(W, H) * 0.012));
  if (layout === 'nine') {
    const cw = (W - 4 * g) / 3;
    const ch = (H - 4 * g) / 3;
    const panels = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue;
        panels.push({ x: g + c * (cw + g), y: g + r * (ch + g), w: cw, h: ch });
      }
    }
    const title = { x: g + (cw + g), y: g + (ch + g), w: cw, h: ch };
    return { panels, title, kind: 'center', gutter: g };
  }
  if (layout === 'hero') {
    const heroW = Math.round(W * 0.58);
    const colX = heroW + g;
    const colW = W - g - colX;
    const ph = (H - 4 * g) / 3;
    const panels = [{ x: g, y: g, w: heroW - g, h: H - 2 * g }];
    for (let i = 0; i < 3; i++) {
      panels.push({ x: colX, y: g + i * (ph + g), w: colW, h: ph });
    }
    const title = { x: g, y: H - Math.round(H * 0.2) - g, w: heroW - g, h: Math.round(H * 0.2) };
    return { panels, title, kind: 'band', gutter: g };
  }
  if (layout === 'four') {
    const bandH = Math.round(H * 0.24);
    const gridH = H - bandH - g;
    const cw = (W - 3 * g) / 2;
    const ch = (gridH - 3 * g) / 2;
    const panels = [
      { x: g, y: g, w: cw, h: ch },
      { x: g + cw + g, y: g, w: cw, h: ch },
      { x: g, y: g + ch + g, w: cw, h: ch },
      { x: g + cw + g, y: g + ch + g, w: cw, h: ch },
    ];
    const title = { x: 0, y: H - bandH, w: W, h: bandH };
    return { panels, title, kind: 'band', gutter: g };
  }
  // bleed: one photo edge to edge, title band over its foot.
  const bandH = Math.round(H * 0.36);
  return {
    panels: [{ x: 0, y: 0, w: W, h: H }],
    title: { x: 0, y: H - bandH, w: W, h: bandH },
    kind: 'band',
    gutter: g,
  };
}

/** Shrinks a font until `text` fits `maxW`, returning the size used. */
function fitFont(ctx, text, maxW, start, weight, family) {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 10 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

const TITLE_FAMILY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SCRIPT_FAMILY = '"Segoe Script", "Brush Script MT", cursive';

/** The longest side the sharpening pass works at; bigger panels are scaled down for it. */
const SHARPEN_MAX_SIDE = 1200;

/**
 * Draws one photo into a panel rect, cover-fit, with the panel's zoom/pan and
 * its Enhance dials. Brightness, contrast and saturation ride on ctx.filter;
 * warmth is a tint overlay; sharpness goes through a panel-sized offscreen
 * canvas (capped at SHARPEN_MAX_SIDE so a full-bleed panel stays quick),
 * sharpened by convolution and drawn back in.
 */
function drawPanelPhoto(ctx, img, rect, panel) {
  const enhance = panel.enhance ?? defaultEnhance();
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * panel.zoom;
  const pw = img.naturalWidth * base;
  const ph = img.naturalHeight * base;
  // Clamp the centre so the photo always covers the panel, however far it pans.
  const cx = Math.max(rect.x + rect.w - pw / 2, Math.min(rect.x + pw / 2, rect.x + rect.w / 2 + panel.ox * rect.w));
  const cy = Math.max(rect.y + rect.h - ph / 2, Math.min(rect.y + ph / 2, rect.y + rect.h / 2 + panel.oy * rect.h));
  const dx = cx - pw / 2;
  const dy = cy - ph / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (enhance.sharpness > 0) {
    const scale = Math.min(1, SHARPEN_MAX_SIDE / Math.max(rect.w, rect.h));
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(rect.w * scale));
    off.height = Math.max(1, Math.round(rect.h * scale));
    const octx = off.getContext('2d');
    octx.filter = enhanceFilter(enhance);
    octx.drawImage(img, (dx - rect.x) * scale, (dy - rect.y) * scale, pw * scale, ph * scale);
    octx.filter = 'none';
    sharpenCanvas(off, enhance.sharpness);
    ctx.drawImage(off, rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.filter = enhanceFilter(enhance);
    ctx.drawImage(img, dx, dy, pw, ph);
    ctx.filter = 'none';
  }

  applyWarmth(ctx, rect, enhance.warmth);
  ctx.restore();
}

/** An empty panel: a dark gradient, a dashed frame and an invitation. */
function drawEmptyPanel(ctx, rect) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  grad.addColorStop(0, '#3a1c56');
  grad.addColorStop(1, '#160a24');
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, rect.w * 0.006);
  ctx.setLineDash([rect.w * 0.04, rect.w * 0.03]);
  ctx.strokeRect(rect.x + rect.w * 0.06, rect.y + rect.h * 0.06, rect.w * 0.88, rect.h * 0.88);
  ctx.restore();
  fitFont(ctx, '+ ADD PHOTO', rect.w * 0.7, rect.h * 0.09, '900', TITLE_FAMILY);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+ ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** Tints one panel with the chosen grade (a gradient map over the photo). */
function applyGrade(ctx, rect, grade) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (grade.desat) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  for (const [stop, color] of grade.stops) grad.addColorStop(stop, color);
  ctx.globalCompositeOperation = grade.mode;
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** The big caption, gradient-filled with a dark outline, fitted to one line. */
function drawTitleText(ctx, text, cx, cy, maxW, startSize) {
  const size = fitFont(ctx, text, maxW, startSize, '900', TITLE_FAMILY);
  const grad = ctx.createLinearGradient(0, cy - size * 0.7, 0, cy + size * 0.35);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#ffd76a');
  grad.addColorStop(1, '#ff5e7a');
  ctx.font = `900 ${size}px ${TITLE_FAMILY}`;
  try { ctx.letterSpacing = '1px'; } catch { /* older canvas: no letter spacing */ }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(24,4,36,0.9)';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.04;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
  return size;
}

/** The script subtitle with a neon glow, fitted to one line. */
function drawSubtitleText(ctx, text, cx, cy, maxW, startSize) {
  const size = fitFont(ctx, text, maxW, startSize, '700', SCRIPT_FAMILY);
  ctx.font = `italic 700 ${size}px ${SCRIPT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff2d95';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = size * 0.18;
  ctx.shadowColor = '#00e5ff';
  ctx.fillText(text, cx, cy);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  return size;
}

/** Five stars and a heat score, the poster's little badge of honour. */
function drawHeatBadge(ctx, cx, cy, scale) {
  const size = 16 * scale;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd76a';
  ctx.shadowColor = '#ff9a3d';
  ctx.shadowBlur = size * 0.4;
  ctx.fillText('★★★★★', cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.round(size * 0.72)}px sans-serif`;
  ctx.fillText('HEAT 98', cx, cy + size * 1.15);
}

/** Halftone dots, the print-poster texture of the title block. */
function drawHalftone(ctx, rect) {
  const step = Math.max(10, rect.w * 0.055);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let y = rect.y + step / 2; y < rect.y + rect.h; y += step) {
    for (let x = rect.x + step / 2; x < rect.x + rect.w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The title block: a sunset gradient cell, or a scrim band along the foot. */
function drawTitleBlock(ctx, rect, kind, state, W, H) {
  const scale = Math.min(W, H) / 1080;
  if (kind === 'center') {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    grad.addColorStop(0, '#2b0a3d');
    grad.addColorStop(0.5, '#c2187a');
    grad.addColorStop(1, '#ff7a3d');
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    drawHalftone(ctx, rect);
    drawHeatBadge(ctx, rect.x + rect.w / 2, rect.y + rect.h * 0.16, scale);
    const title = state.title.trim().toUpperCase() || 'VICE COAST';
    drawTitleText(ctx, title, rect.x + rect.w / 2, rect.y + rect.h * 0.52, rect.w * 0.9, rect.w * 0.16);
    if (state.subtitle.trim()) {
      drawSubtitleText(ctx, state.subtitle.trim(), rect.x + rect.w / 2, rect.y + rect.h * 0.8, rect.w * 0.86, rect.w * 0.085);
    }
    return;
  }
  // band: a dark scrim rising from the foot, a neon rule, title centred, script below.
  const scrim = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  scrim.addColorStop(0, 'rgba(16,4,28,0)');
  scrim.addColorStop(0.45, 'rgba(16,4,28,0.82)');
  scrim.addColorStop(1, 'rgba(16,4,28,0.94)');
  ctx.fillStyle = scrim;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const rule = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
  rule.addColorStop(0, '#ff2d95');
  rule.addColorStop(0.5, '#ff9a3d');
  rule.addColorStop(1, '#00e5ff');
  ctx.fillStyle = rule;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.08, rect.w, Math.max(3, rect.h * 0.03));
  const pad = rect.w * 0.04;
  const title = state.title.trim().toUpperCase() || 'VICE COAST';
  const titleSize = drawTitleText(ctx, title, rect.x + pad + (rect.w - pad * 2) / 2, rect.y + rect.h * 0.52, rect.w - pad * 2, rect.h * 0.42);
  if (state.subtitle.trim()) {
    drawSubtitleText(ctx, state.subtitle.trim(), rect.x + rect.w / 2, rect.y + rect.h * 0.86, rect.w * 0.8, Math.max(14, titleSize * 0.34));
  }
  drawHeatBadge(ctx, rect.x + rect.w - pad - 40 * scale, rect.y + rect.h * 0.2, scale * 0.7);
}

let noiseTile = null;

/** A tile of random grey noise, made once, for the film-grain finish. */
function grainTile() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas');
  noiseTile.width = 140;
  noiseTile.height = 140;
  const nctx = noiseTile.getContext('2d');
  const data = nctx.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + Math.floor(Math.random() * 90);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  nctx.putImageData(data, 0, 0);
  return noiseTile;
}

/**
 * Draws the whole cover onto `canvas` from `state`. `opts.selected` (a panel
 * index, or null) draws the editor's selection outline around that panel;
 * exports pass nothing, so the outline never reaches a PNG.
 */
export function drawCover(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const { panels, title, kind, gutter } = layoutRects(state.layout, W, H);
  const grade = GRADES[state.grade] ?? GRADES.sunset;

  ctx.fillStyle = '#160a24';
  ctx.fillRect(0, 0, W, H);
  const count = LAYOUTS[state.layout].panels;
  for (let i = 0; i < count; i++) {
    const panel = state.panels[i];
    const img = panel.photo >= 0 ? state.photos[panel.photo] : null;
    if (img) drawPanelPhoto(ctx, img, panels[i], panel);
    else drawEmptyPanel(ctx, panels[i]);
    applyGrade(ctx, panels[i], grade);
  }

  // White gutters and black keylines: the poster's panel seams.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = gutter;
  for (let i = 0; i < count; i++) ctx.strokeRect(panels[i].x, panels[i].y, panels[i].w, panels[i].h);
  ctx.strokeStyle = 'rgba(10,4,18,0.85)';
  ctx.lineWidth = Math.max(1, gutter * 0.16);
  for (let i = 0; i < count; i++) ctx.strokeRect(panels[i].x, panels[i].y, panels[i].w, panels[i].h);

  drawTitleBlock(ctx, title, kind, state, W, H);

  if (state.vignette) {
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(10,2,20,0.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.frame) {
    const bw = Math.max(6, Math.round(Math.min(W, H) * 0.014));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
    ctx.strokeStyle = 'rgba(10,4,18,0.9)';
    ctx.lineWidth = Math.max(1, bw * 0.18);
    ctx.strokeRect(bw, bw, W - bw * 2, H - bw * 2);
  }
  if (opts.selected != null && opts.selected < count) {
    const r = panels[opts.selected];
    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(3, Math.min(W, H) * 0.006);
    ctx.setLineDash([Math.min(W, H) * 0.02, Math.min(W, H) * 0.01]);
    ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.restore();
  }
}
