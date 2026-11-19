// Fixed scenes for screenshots: ?shot=cover shows the cover alone at its export
// size; ?shot=editor shows the page with sample photos loaded. The query picks
// the scene: layout, size, grade, title, subtitle, photos (sample names,
// comma-separated) and enhance — 'auto', 'golden', 'neon' or 'clean' — which
// presets the Enhance dials on every panel. window.__shotReady is set once
// the scene has painted.
import { LAYOUTS } from './cover.js';
import { presetValues } from './enhance.js';

/** Loads an image from a URL, resolving to the image once it can be drawn. */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function runShot(shot, query, apply) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const names = (query.get('photos') ?? 'pier,boulevard').split(',').filter(Boolean);
  const photos = [];
  for (const name of names) {
    const img = await loadImage(`samples/${name}.jpg`);
    img.name = `${name}.jpg`;
    photos.push(img);
  }
  const layout = query.get('layout') ?? 'nine';
  const count = (LAYOUTS[layout] ?? LAYOUTS.nine).panels;
  const enhance = presetValues(query.get('enhance'));
  const panels = Array.from({ length: 9 }, (_, i) => {
    // A spread of crops so no two panels show the same framing.
    const zoom = 1 + (i % 3) * 0.18 + (i % 2) * 0.07;
    const ox = (((i * 37) % 21) - 10) / 100;
    const oy = (((i * 53) % 17) - 8) / 100;
    return { photo: i < count ? i % photos.length : -1, zoom, ox, oy, enhance: { ...enhance } };
  });
  await apply(photos, {
    layout,
    size: query.get('size') ?? '1080x1080',
    grade: query.get('grade') ?? 'sunset',
    title: query.get('title') ?? 'VICE COAST',
    subtitle: query.get('subtitle') ?? 'one last ride',
    panels,
    selected: 0,
  });
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
