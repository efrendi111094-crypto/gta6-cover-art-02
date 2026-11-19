// Vice Coast Cover Studio 2: wires the page — photos in, layout and grade
// picked, Enhance tuned per panel, caption typed, panels cropped by drag or
// slider, PNG out. A `?shot=` query sets up a fixed scene for a screenshot
// instead (./shots.js).
import { drawCover, defaultState, layoutRects, LAYOUTS, SIZES, GRADES } from './cover.js';
import { AUTO_ENHANCE, ENHANCE_PRESETS, defaultEnhance, isDefaultEnhance } from './enhance.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const state = defaultState();

/** The six free sample photos shipped under samples/ (image-model made). */
const SAMPLES = ['boulevard', 'pier', 'neon', 'convertible', 'beach', 'boardwalk'];

/** The five Enhance dials, each with its slider and its value label. */
const ENHANCE_CONTROLS = [
  { key: 'brightness', input: 'enh-brightness', label: 'brightnessVal' },
  { key: 'contrast', input: 'enh-contrast', label: 'contrastVal' },
  { key: 'saturation', input: 'enh-saturation', label: 'saturationVal' },
  { key: 'sharpness', input: 'enh-sharpness', label: 'sharpnessVal' },
  { key: 'warmth', input: 'enh-warmth', label: 'warmthVal' },
];

/** Loads an image from a URL, resolving to the image once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function panelCount() {
  return LAYOUTS[state.layout].panels;
}

function selectedPanel() {
  return state.panels[state.selected];
}

function render() {
  const size = SIZES[state.size];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  drawCover(canvas, state, {
    // The exported cover never carries the editor's selection outline.
    selected: document.body.classList.contains('shot-cover') ? null : state.selected,
  });
  syncControls();
}

/** Formats a dial value the way the label shows it: +8, -12, 30. */
function dialText(value) {
  return value > 0 ? `+${value}` : String(value);
}

/** Reflects the state in every control: active buttons, sliders, selects. */
function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  const sel = document.getElementById('panelPhoto');
  sel.innerHTML = '<option value="-1">Empty panel</option>' + state.photos
    .map((img, i) => `<option value="${i}">Photo ${i + 1} — ${img.name ?? 'image'}</option>`)
    .join('');
  sel.value = String(selectedPanel().photo);
  const panel = selectedPanel();
  document.getElementById('zoom').value = panel.zoom;
  document.getElementById('panX').value = panel.ox;
  document.getElementById('panY').value = panel.oy;
  document.getElementById('zoomVal').textContent = `${Math.round(panel.zoom * 100)}%`;
  document.getElementById('panelLabel').textContent = `Panel ${state.selected + 1} of ${panelCount()}`;
  document.getElementById('enhanceLabel').textContent = `Panel ${state.selected + 1} of ${panelCount()}`;
  for (const { key, input, label } of ENHANCE_CONTROLS) {
    const value = panel.enhance?.[key] ?? 0;
    document.getElementById(input).value = value;
    document.getElementById(label).textContent = dialText(value);
  }
  const thumbs = document.getElementById('thumbs');
  thumbs.innerHTML = '';
  state.photos.forEach((img, i) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'thumb';
    t.title = `Use photo ${i + 1} in the selected panel`;
    t.appendChild(img.cloneNode(false));
    t.addEventListener('click', () => {
      selectedPanel().photo = i;
      render();
    });
    thumbs.appendChild(t);
  });
}

/** Adds loaded images as photos and fills empty panels with them, in order. */
function addPhotos(images) {
  for (const img of images) {
    if (state.photos.length >= 12) break;
    state.photos.push(img);
    const slot = state.panels.findIndex((p) => p.photo === -1);
    if (slot !== -1 && slot < panelCount()) state.panels[slot].photo = state.photos.length - 1;
  }
  render();
}

document.getElementById('photo').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const images = [];
  for (const file of files) {
    const img = await loadImage(URL.createObjectURL(file));
    img.name = file.name;
    images.push(img);
  }
  addPhotos(images);
  statusEl.textContent = `${files.length} photo${files.length > 1 ? 's' : ''} loaded — pick a layout and export.`;
});

for (const name of SAMPLES) {
  document.getElementById(`sample-${name}`).addEventListener('click', async () => {
    const img = await loadImage(`samples/${name}.jpg`);
    img.name = `${name}.jpg`;
    addPhotos([img]);
    statusEl.textContent = `Sample photo ${name}.jpg loaded.`;
  });
}

document.querySelectorAll('[data-layout]').forEach((b) => {
  b.addEventListener('click', () => {
    state.layout = b.dataset.layout;
    if (state.selected >= panelCount()) state.selected = 0;
    render();
  });
});
document.querySelectorAll('[data-size]').forEach((b) => {
  b.addEventListener('click', () => {
    state.size = b.dataset.size;
    render();
  });
});
document.querySelectorAll('[data-grade]').forEach((b) => {
  b.addEventListener('click', () => {
    state.grade = b.dataset.grade;
    render();
  });
});

document.getElementById('title').addEventListener('input', (e) => {
  state.title = e.target.value;
  render();
});
document.getElementById('subtitle').addEventListener('input', (e) => {
  state.subtitle = e.target.value;
  render();
});
document.getElementById('panelPhoto').addEventListener('change', (e) => {
  selectedPanel().photo = Number(e.target.value);
  render();
});
document.getElementById('zoom').addEventListener('input', (e) => {
  selectedPanel().zoom = Number(e.target.value);
  render();
});
document.getElementById('panX').addEventListener('input', (e) => {
  selectedPanel().ox = Number(e.target.value);
  render();
});
document.getElementById('panY').addEventListener('input', (e) => {
  selectedPanel().oy = Number(e.target.value);
  render();
});
document.getElementById('fillAll').addEventListener('click', () => {
  const photo = selectedPanel().photo;
  if (photo < 0) {
    statusEl.textContent = 'Put a photo in the selected panel first.';
    return;
  }
  for (let i = 0; i < panelCount(); i++) state.panels[i].photo = photo;
  render();
  statusEl.textContent = 'Every panel now shows the same photo.';
});
document.getElementById('resetCrop').addEventListener('click', () => {
  const panel = selectedPanel();
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  render();
});

// Enhance: every control edits the selected panel's dials and re-renders, so
// the preview shows the tuned photo at once — and the export draws the same.
for (const { key, input } of ENHANCE_CONTROLS) {
  document.getElementById(input).addEventListener('input', (e) => {
    selectedPanel().enhance[key] = Number(e.target.value);
    render();
  });
}
document.getElementById('autoEnhance').addEventListener('click', () => {
  selectedPanel().enhance = { ...AUTO_ENHANCE };
  render();
  statusEl.textContent = 'Auto-enhance applied to this panel — light, colour and sharpness lifted.';
});
document.querySelectorAll('[data-preset]').forEach((b) => {
  b.addEventListener('click', () => {
    const preset = ENHANCE_PRESETS[b.dataset.preset];
    if (!preset) return;
    selectedPanel().enhance = { ...preset.values };
    render();
    statusEl.textContent = `${preset.name} preset applied to this panel.`;
  });
});
document.getElementById('resetEnhance').addEventListener('click', () => {
  selectedPanel().enhance = defaultEnhance();
  render();
  statusEl.textContent = 'Enhance reset for this panel.';
});

// Compare: while the button (or the C key) is held, the selected panel draws
// without its Enhance dials, so the original and the tuned photo can be
// judged back to back. Releasing restores the enhanced view at once.
const compareBtn = document.getElementById('compareBtn');
function setComparing(on) {
  if (state.comparing === on) return;
  state.comparing = on;
  compareBtn.classList.toggle('comparing', on);
  compareBtn.setAttribute('aria-pressed', String(on));
  compareBtn.textContent = on ? 'Showing original — release to compare' : 'Hold to see original';
  render();
  // An un-enhanced panel looks identical under Compare, so say so instead of
  // promising an enhanced version that does not exist yet.
  if (on && isDefaultEnhance(selectedPanel().enhance)) {
    statusEl.textContent = 'This panel has no Enhance applied yet — nothing to compare. Try Auto-enhance first.';
  } else {
    statusEl.textContent = on
      ? 'Showing the original photo — release the button to see the enhanced version.'
      : 'Back to the enhanced photo.';
  }
}
compareBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  setComparing(true);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  compareBtn.addEventListener(ev, () => setComparing(false));
}

// Copy enhance: spreads the selected panel's five dials to every panel of
// the cover, so one good look can be applied everywhere in a single click.
document.getElementById('copyEnhance').addEventListener('click', () => {
  const dials = { ...selectedPanel().enhance };
  for (let i = 0; i < panelCount(); i++) state.panels[i].enhance = { ...dials };
  render();
  statusEl.textContent = `Enhance copied to all ${panelCount()} panels.`;
});
for (const id of ['grain', 'vignette', 'frame']) {
  document.getElementById(id).addEventListener('change', (e) => {
    state[id] = e.target.checked;
    render();
  });
}

// Keyboard shortcuts: 1–5 pick the five colour grades in button order, E
// runs Auto-enhance on the selected panel, and holding C compares the
// selected panel with its original. Ignored while typing in a text field,
// and ignored with a modifier key, so browser shortcuts keep working.
const GRADE_KEYS = ['sunset', 'neon', 'vice', 'heat', 'noir'];
function typingInField(e) {
  const tag = e.target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
document.addEventListener('keydown', (e) => {
  if (typingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  const digit = Number(e.key);
  if (digit >= 1 && digit <= GRADE_KEYS.length) {
    state.grade = GRADE_KEYS[digit - 1];
    render();
    statusEl.textContent = `${GRADES[state.grade].name} grade selected.`;
    return;
  }
  if (e.repeat) return;
  if (e.key === 'e' || e.key === 'E') {
    selectedPanel().enhance = { ...AUTO_ENHANCE };
    render();
    statusEl.textContent = 'Auto-enhance applied to this panel — light, colour and sharpness lifted.';
  } else if (e.key === 'c' || e.key === 'C') {
    setComparing(true);
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'c' || e.key === 'C') setComparing(false);
});

document.getElementById('export').addEventListener('click', () => {
  const size = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  // An export never carries the Compare view: the PNG always shows the
  // enhanced cover, even if the C key is still held when Export is clicked.
  const wasComparing = state.comparing;
  state.comparing = false;
  drawCover(off, state, {});
  state.comparing = wasComparing;
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-coast-${state.size}.png`;
    a.click();
    statusEl.textContent = `Saved vice-coast-${state.size}.png (${size.w} x ${size.h}).`;
  }, 'image/png');
});

// Click a panel to select it; drag inside it to move its photo.
let dragging = false;
let lastX = 0;
let lastY = 0;

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const { panels } = layoutRects(state.layout, canvas.width, canvas.height);
  const hit = panels.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  if (hit === -1) return;
  state.selected = hit;
  dragging = true;
  lastX = p.x;
  lastY = p.y;
  canvas.setPointerCapture(e.pointerId);
  render();
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = canvasPoint(e);
  const { panels } = layoutRects(state.layout, canvas.width, canvas.height);
  const r = panels[state.selected];
  const panel = selectedPanel();
  panel.ox = Math.max(-0.5, Math.min(0.5, panel.ox + (p.x - lastX) / r.w));
  panel.oy = Math.max(-0.5, Math.min(0.5, panel.oy + (p.y - lastY) / r.h));
  lastX = p.x;
  lastY = p.y;
  render();
});
canvas.addEventListener('pointerup', () => { dragging = false; });

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), async (photos, scene) => {
    Object.assign(state, scene);
    state.photos = photos;
    document.getElementById('title').value = state.title;
    document.getElementById('subtitle').value = state.subtitle;
    render();
  });
} else {
  render();
}
