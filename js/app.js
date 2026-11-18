(function () {
  'use strict';
  const APP_VERSION = '1.0.0';
  const { M } = Ink;
  const $ = (id) => document.getElementById(id);

  // ---------- Zeichensätze ----------
  const GROUPS = [
    { key: 'lower', name: 'Kleinbuchstaben', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
    { key: 'upper', name: 'Großbuchstaben', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
    { key: 'umlaut', name: 'Umlaute & ß', chars: [...'äöüÄÖÜß'] },
    { key: 'digits', name: 'Ziffern', chars: [...'0123456789'] },
    { key: 'punct', name: 'Satzzeichen', chars: [...'.,;:!?-()"„“\'/&+=%€@*#'] },
  ];
  const HINTS = {
    lower: 'Kleinbuchstabe: bis zur gepunkteten Linie, Ober-/Unterlängen darüber hinaus.',
    upper: 'Großbuchstabe: von der Grundlinie bis zur oberen Linie.',
    umlaut: 'Mit Pünktchen bzw. wie du ß sonst schreibst.',
    digits: 'Ziffern meist so hoch wie Großbuchstaben.',
    punct: 'Satzzeichen an der richtigen Höhe: Punkt auf der Grundlinie, Anführungszeichen oben.',
    custom: 'Eigenes Zeichen.',
  };

  const DEFAULTS = {
    color: '#1c1c1c', size: 30, thick: 1.15, lineGap: 1.0, lineWidth: 720, variation: 55, tracking: 0,
    wordSpace: 34, pressure: true, bg: 'lined', target: 3, ghost: false, group: 'all', text: '', custom: [], seed: 1234,
  };
  const COLORS = ['#1c1c1c', '#1d3a8a', '#2563eb', '#c62828', '#1b7f3b', '#6d28d9'];

  let settings = Object.assign({}, DEFAULTS, Store.loadSettings());
  let glyphs = {};
  let current = 'a';
  let strokes = [];          // aktuelle Zeichnung: Array von Arrays [x,y,p,...]
  let editingIdx = null;     // Index der Variante, die gerade korrigiert wird
  let dirty = false;
  let penSeen = false;

  const saveSettings = () => Store.saveSettings(settings);
  const allChars = () => GROUPS.flatMap(g => g.chars).concat(settings.custom.filter(c => !GROUPS.some(g => g.chars.includes(c))));
  const groupOf = (ch) => (GROUPS.find(g => g.chars.includes(ch)) || { key: 'custom' }).key;
  const count = (ch) => (glyphs[ch] ? glyphs[ch].length : 0);

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), err ? 4500 : 2600);
  }

  // ---------- Ansichten ----------
  function showView(name) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    settings.view = name; saveSettings();
    if (name === 'draw') requestAnimationFrame(sizeCanvas);
    if (name === 'write') schedulePreview(0);
    if (name === 'data') updateStorageInfo();
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

  function updateProgress() {
    const chars = allChars();
    const done = chars.filter(c => count(c) > 0).length;
    const vars = Object.values(glyphs).reduce((a, l) => a + l.length, 0);
    $('progress').textContent = `${done}/${chars.length} Zeichen · ${vars} Varianten`;
  }

  // ======================================================================
  // Zeichnen
  // ======================================================================
  const canvas = $('drawCanvas');
  const ctx = canvas.getContext('2d');
  let unitPx = 1, dpr = 1;

  function fillGroupSelect() {
    const sel = $('charGroup');
    sel.innerHTML = '';
    const opts = [['all', 'Alle Zeichen']].concat(GROUPS.map(g => [g.key, g.name]));
    if (settings.custom.length) opts.push(['custom', 'Eigene Zeichen']);
    for (const [k, n] of opts) { const o = document.createElement('option'); o.value = k; o.textContent = n; sel.appendChild(o); }
    sel.value = opts.some(o => o[0] === settings.group) ? settings.group : 'all';
  }
  $('charGroup').addEventListener('change', (e) => { settings.group = e.target.value; saveSettings(); renderGrid(); });

  function gridChars() {
    if (settings.group === 'all') return allChars();
    if (settings.group === 'custom') return settings.custom.slice();
    const g = GROUPS.find(g => g.key === settings.group);
    return g ? g.chars : allChars();
  }

  function renderGrid() {
    const grid = $('charGrid');
    grid.innerHTML = '';
    const target = settings.target;
    for (const ch of gridChars()) {
      const b = document.createElement('button');
      const n = count(ch);
      b.className = 'cell' + (n >= target ? ' done' : n > 0 ? ' some' : '') + (ch === current ? ' sel' : '');
      b.innerHTML = '<span></span><span class="n"></span>';
      b.firstChild.textContent = ch;
      b.lastChild.textContent = n ? n : '';
      b.title = `${ch}: ${n} Variante${n === 1 ? '' : 'n'}`;
      b.addEventListener('click', () => selectChar(ch));
      grid.appendChild(b);
    }
    updateProgress();
  }

  function confirmDiscard() {
    return !dirty || confirm('Die Zeichnung ist noch nicht gespeichert. Verwerfen?');
  }

  function selectChar(ch, force) {
    if (ch === current && !force) return;
    if (!force && !confirmDiscard()) return;
    current = ch;
    strokes = []; editingIdx = null; dirty = false;
    settings.current = ch; saveSettings();
    $('currentChar').textContent = ch;
    $('charHint').textContent = HINTS[groupOf(ch)];
    renderGrid();
    renderVariants();
    redraw();
    const sel = document.querySelector('.cell.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  function renderVariants() {
    const box = $('variants');
    box.innerHTML = '';
    const list = glyphs[current] || [];
    list.forEach((v, i) => {
      const b = document.createElement('div');
      b.className = 'variant' + (editingIdx === i ? ' sel' : '');
      b.title = 'Antippen zum Korrigieren';
      const c = document.createElement('canvas');
      b.appendChild(c);
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '✕'; x.title = 'Variante löschen';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Variante ${i + 1} von „${current}“ löschen?`)) return;
        list.splice(i, 1);
        if (editingIdx === i) { editingIdx = null; strokes = []; dirty = false; }
        else if (editingIdx !== null && editingIdx > i) editingIdx--;
        await persistChar(current);
        renderVariants(); renderGrid(); redraw();
      });
      b.appendChild(x);
      b.addEventListener('click', () => {
        if (editingIdx === i) return;
        if (!confirmDiscard()) return;
        editingIdx = i;
        strokes = v.s.map(s => s.slice());
        dirty = false;
        renderVariants(); redraw();
      });
      box.appendChild(b);
      requestAnimationFrame(() => thumb(c, v));
    });
    const n = document.createElement('button');
    n.className = 'variant new' + (editingIdx === null ? ' sel' : '');
    n.textContent = '+';
    n.title = 'Neue Variante zeichnen';
    n.addEventListener('click', () => {
      if (editingIdx === null) return;
      if (!confirmDiscard()) return;
      editingIdx = null; strokes = []; dirty = false;
      renderVariants(); redraw();
    });
    box.appendChild(n);
    updateButtons();
  }

  function thumb(c, v) {
    const r = window.devicePixelRatio || 1;
    const w = c.clientWidth || 56, h = c.clientHeight || 52;
    c.width = w * r; c.height = h * r;
    const g = c.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    // auf das Zeichen zoomen, kleine Satzzeichen aber nicht riesig aufblasen
    const b = Ink.bbox(v);
    const bw = b.maxX - b.minX + 16, bh = b.maxY - b.minY + 16;
    const u = Math.min((w * r) / bw, (h * r) / bh, (h * r) / 70);
    const ox = (w * r) / 2 - ((b.minX + b.maxX) / 2) * u;
    const oy = (h * r) / 2 - ((b.minY + b.maxY) / 2) * u;
    Ink.drawVariant(g, v, [u, 0, 0, u, ox, oy], M.BASE_W * 1.1, settings.pressure);
  }

  function sizeCanvas() {
    const wrap = $('canvasWrap');
    if (!wrap.offsetParent) return;
    const availW = wrap.clientWidth;
    const maxH = Math.max(220, window.innerWidth <= 900 ? window.innerHeight * 0.42 : window.innerHeight - 250);
    const h = Math.min(availW * (M.BOTTOM - M.TOP) / M.WIDTH, maxH);
    dpr = window.devicePixelRatio || 1;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(availW * dpr);
    canvas.height = Math.round(h * dpr);
    unitPx = h / (M.BOTTOM - M.TOP);
    redraw();
  }
  window.addEventListener('resize', () => requestAnimationFrame(sizeCanvas));

  // Einheiten <-> Canvas: x mittig, y von TOP
  const offX = () => (canvas.width / dpr - M.WIDTH * unitPx) / 2;
  const toUnits = (cx, cy) => [(cx - offX()) / unitPx, cy / unitPx + M.TOP];
  const editorMatrix = () => { const k = unitPx * dpr; return [k, 0, 0, k, offX() * dpr, -M.TOP * k]; };

  function redraw() {
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const k = unitPx * dpr;
    const yOf = (u) => (u - M.TOP) * k;
    const line = (u, color, dash, width) => {
      ctx.beginPath(); ctx.setLineDash(dash.map(d => d * dpr)); ctx.strokeStyle = color; ctx.lineWidth = width * dpr;
      ctx.moveTo(0, yOf(u)); ctx.lineTo(W, yOf(u)); ctx.stroke();
    };
    ctx.lineCap = 'butt';
    line(M.CAP, '#9fb7d6', [6, 6], 1);
    line(M.XH, '#b9c9de', [2, 5], 1.2);
    line(0, '#5f86b8', [], 1.6);
    line(M.DESC, '#d6dfeb', [6, 6], 1);
    ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const m = editorMatrix();
    const bw = M.BASE_W * Math.max(1.1, settings.thick);
    if (settings.ghost) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      (glyphs[current] || []).forEach((v, i) => { if (i !== editingIdx) Ink.drawVariant(ctx, v, m, bw, false); });
    }
    ctx.strokeStyle = '#111';
    for (const s of strokes) Ink.drawStroke(ctx, s, m, bw, settings.pressure);
  }

  // ---------- Eingabe ----------
  let active = null; // { id, s }
  function ptFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const [x, y] = toUnits(e.clientX - r.left, e.clientY - r.top);
    let p = e.pressure;
    if (e.pointerType === 'pen') p = Math.max(0.08, p || 0);
    else p = 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; $('penBadge').hidden = false; setTimeout(() => { $('penBadge').hidden = true; }, 3000); }
    if (e.pointerType === 'touch' && penSeen) return;       // Handballen ignorieren
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (active) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const s = ptFromEvent(e);
    active = { id: e.pointerId, s };
    strokes.push(s);
    dirty = true;
    redraw(); updateButtons();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const s = active.s;
    for (const ev of (evs.length ? evs : [e])) {
      const p = ptFromEvent(ev);
      const lx = s[s.length - 3], ly = s[s.length - 2];
      if (Math.hypot(p[0] - lx, p[1] - ly) < 0.45) { s[s.length - 1] = Math.max(s[s.length - 1], p[2]); continue; }
      s.push(p[0], p[1], p[2]);
    }
    scheduleRedraw();
  });
  const endStroke = (e) => {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    redraw();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS: Scrollen/Lupe beim Zeichnen verhindern
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  let rafPending = false;
  function scheduleRedraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; redraw(); });
  }

  function updateButtons() {
    $('undoBtn').disabled = !strokes.length;
    $('clearBtn').disabled = !strokes.length;
  }

  function undo() { if (!strokes.length) return; strokes.pop(); dirty = true; redraw(); updateButtons(); }
  function clearDrawing() { if (!strokes.length) return; strokes = []; dirty = true; redraw(); updateButtons(); }
  $('undoBtn').addEventListener('click', undo);
  $('clearBtn').addEventListener('click', clearDrawing);

  async function persistChar(ch) {
    try { await Store.saveChar(ch, glyphs[ch] || []); }
    catch (e) { console.error(e); toast('Speichern fehlgeschlagen: ' + e.message, true); }
    invalidatePreview();
  }

  async function saveCurrent() {
    if (!strokes.length) {
      if (editingIdx !== null) { toast('Variante ist leer – zum Löschen das ✕ benutzen.', true); return false; }
      toast('Erst etwas zeichnen.', true); return false;
    }
    const variant = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), s: strokes.map(s => s.slice()), t: Date.now() };
    const list = glyphs[current] || (glyphs[current] = []);
    if (editingIdx !== null && list[editingIdx]) { variant.id = list[editingIdx].id; list[editingIdx] = variant; }
    else list.push(variant);
    await persistChar(current);
    const msg = editingIdx !== null ? `„${current}“ Variante ${editingIdx + 1} korrigiert` : `„${current}“ gespeichert (${list.length})`;
    strokes = []; editingIdx = null; dirty = false;
    renderVariants(); renderGrid(); redraw();
    toast(msg);
    return true;
  }

  function nextMissing() {
    const chars = allChars();
    const start = chars.indexOf(current);
    for (let k = 1; k <= chars.length; k++) {
      const ch = chars[(start + k) % chars.length];
      if (count(ch) < settings.target) return ch;
    }
    return null;
  }

  $('saveBtn').addEventListener('click', saveCurrent);
  $('saveNextBtn').addEventListener('click', async () => {
    if (!(await saveCurrent())) return;
    if (count(current) < settings.target) return; // erst genug Varianten für dieses Zeichen
    const n = nextMissing();
    if (n) selectChar(n, true); else toast(`Alle Zeichen haben ${settings.target} Varianten. 🎉`);
  });

  $('addCharBtn').addEventListener('click', () => {
    const v = prompt('Welches Zeichen möchtest du hinzufügen? (z. B. § oder ½)');
    if (!v) return;
    const ch = [...v.trim()][0];
    if (!ch) return;
    if (!allChars().includes(ch)) { settings.custom.push(ch); saveSettings(); fillGroupSelect(); }
    selectChar(ch);
  });

  document.addEventListener('keydown', (e) => {
    if (!$('view-draw').classList.contains('active')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { e.preventDefault(); $('saveNextBtn').click(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearDrawing(); return; }
    if (e.key.length === 1 && e.key !== ' ' && allChars().includes(e.key)) { e.preventDefault(); selectChar(e.key); }
  });

  // ======================================================================
  // Schreiben
  // ======================================================================
  const RANGES = [
    ['size', 'size', 'sizeOut', v => v + ' px'],
    ['thick', 'thick', 'thickOut', v => (+v).toFixed(2)],
    ['lineGap', 'lineGap', 'lineOut', v => (+v).toFixed(2) + '×'],
    ['lineWidth', 'lineWidth', 'widthOut', v => v + ' px'],
    ['variation', 'variation', 'varOut', v => v + ' %'],
    ['tracking', 'tracking', 'trackOut', v => (v > 0 ? '+' : '') + v],
    ['wordSpace', 'wordSpace', 'wordOut', v => v],
  ];
  for (const [id, key, out, fmt] of RANGES) {
    const el = $(id);
    el.value = settings[key];
    $(out).textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      $(out).textContent = fmt(settings[key]);
      saveSettings();
      if (key === 'thick') redraw();
      schedulePreview();
    });
  }
  $('pressure').checked = settings.pressure;
  $('pressure').addEventListener('change', (e) => { settings.pressure = e.target.checked; saveSettings(); redraw(); schedulePreview(0); });
  $('bgSelect').value = settings.bg;
  $('bgSelect').addEventListener('change', (e) => { settings.bg = e.target.value; saveSettings(); applyBg(); });
  $('reseedBtn').addEventListener('click', () => { settings.seed = (Math.random() * 1e9) | 0; saveSettings(); schedulePreview(0); });
  const ta = $('textInput');
  ta.value = settings.text || '';
  ta.addEventListener('input', () => { settings.text = ta.value; saveSettings(); schedulePreview(); });

  function renderColors() {
    const box = $('colors');
    box.innerHTML = '';
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (settings.color.toLowerCase() === c ? ' sel' : '');
      b.style.background = c; b.title = c;
      b.addEventListener('click', (e) => { e.preventDefault(); setColor(c); });
      box.appendChild(b);
    }
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = settings.color; inp.title = 'Eigene Farbe';
    inp.addEventListener('input', () => setColor(inp.value));
    box.appendChild(inp);
  }
  function setColor(c) { settings.color = c.toLowerCase(); saveSettings(); renderColors(); schedulePreview(0); }

  function applyBg() {
    const p = $('preview');
    p.classList.remove('bg-lined', 'bg-plain', 'bg-dark', 'bg-checker');
    p.classList.add('bg-' + settings.bg);
  }

  const EXPORT_RATIO = 3;
  let previewTimer = 0, previewUrl = null;
  let exportCache = null; // { key, blob, lay }
  function renderKey() {
    return JSON.stringify([settings.text, settings.color, settings.size, settings.thick, settings.lineGap, settings.lineWidth,
      settings.variation, settings.tracking, settings.wordSpace, settings.pressure, settings.seed, glyphVersion]);
  }
  let glyphVersion = 0;
  function invalidatePreview() { glyphVersion++; exportCache = null; }

  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, delay === undefined ? 180 : delay);
  }

  function doLayout() {
    return Ink.layout(settings.text || '', glyphs, {
      size: settings.size, lineGap: settings.lineGap, lineWidth: settings.lineWidth,
      variation: settings.variation / 100, tracking: settings.tracking, wordSpace: settings.wordSpace, seed: settings.seed,
    });
  }
  function renderOpts(ratio) {
    return { size: settings.size, ratio, color: settings.color, thickness: settings.thick, pressure: settings.pressure };
  }

  function renderExportSync() {
    const key = renderKey();
    const lay = doLayout();
    const res = Ink.render(lay, renderOpts(EXPORT_RATIO));
    return { key, lay, res };
  }

  function updatePreview() {
    if (!$('view-write').classList.contains('active')) return;
    const { key, lay, res } = renderExportSync();
    showMissing(lay.missing);
    const img = $('previewImg');
    if (!res) {
      img.hidden = true; $('previewEmpty').hidden = false;
      exportCache = null;
      setExportEnabled(false);
      return;
    }
    $('previewEmpty').hidden = true;
    res.canvas.toBlob((blob) => {
      if (!blob) return;
      exportCache = { key, blob, lay, w: res.canvas.width, h: res.canvas.height };
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      img.src = previewUrl;
      lastPreview = { cssW: res.cssW, cssH: res.cssH, minY: res.bounds.minY };
      sizePreview();
      img.hidden = false;
      setExportEnabled(true);
    }, 'image/png');
  }

  // Vorschau an die Breite anpassen (Bild bleibt in voller Auflösung), Heftlinien auf die Grundlinie legen
  let lastPreview = null;
  function sizePreview() {
    if (!lastPreview) return;
    const p = $('preview'), img = $('previewImg');
    const PAD = 24;
    const fit = Math.min(1, Math.max(0.1, (p.clientWidth - 2 * PAD) / lastPreview.cssW));
    img.style.width = lastPreview.cssW * fit + 'px';
    img.style.height = lastPreview.cssH * fit + 'px';
    const unit = settings.size / 80 * fit;
    const lh = M.LINE * settings.lineGap * unit;
    p.style.setProperty('--lh', lh.toFixed(2) + 'px');
    p.style.setProperty('--lo', (PAD + (-lastPreview.minY) * unit - lh).toFixed(2) + 'px');
  }
  window.addEventListener('resize', () => requestAnimationFrame(sizePreview));

  function setExportEnabled(on) {
    for (const id of ['copyBtn', 'shareBtn', 'pngBtn', 'pdfBtn']) $(id).disabled = !on;
  }

  function showMissing(set) {
    const box = $('missing');
    if (!set.size) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = 'Noch nicht gezeichnet: ';
    for (const ch of set) {
      const b = document.createElement('button');
      b.className = 'ghost small'; b.textContent = ch === ' ' ? '␣' : ch;
      b.title = `„${ch}“ jetzt zeichnen`;
      b.addEventListener('click', () => {
        if (!allChars().includes(ch)) { settings.custom.push(ch); saveSettings(); fillGroupSelect(); }
        showView('draw'); selectChar(ch);
      });
      box.appendChild(b);
    }
  }

  // Blob passend zum aktuellen Stand: sofort (Cache) oder als Promise
  function currentPngBlob() {
    const key = renderKey();
    if (exportCache && exportCache.key === key) return exportCache.blob;
    const { res } = renderExportSync();
    if (!res) return null;
    return new Promise((resolve) => res.canvas.toBlob(resolve, 'image/png'));
  }

  const fileName = (ext) => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `handschrift-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
  };
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  $('copyBtn').addEventListener('click', async () => {
    const b = currentPngBlob();
    if (!b) { toast('Nichts zu kopieren.', true); return; }
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      toast('Zwischenablage nicht verfügbar (nur über https). Nutze „Teilen“ oder „PNG“.', true); return;
    }
    try {
      // Safari will das Promise direkt im Klick sehen
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    } catch (e1) {
      try {
        const blob = await b;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch (e2) {
        console.error(e1, e2);
        toast('Kopieren hat nicht geklappt: ' + (e2.message || e2), true); return;
      }
    }
    toast(isIOS ? 'Kopiert – in GoodNotes lange tippen → Einsetzen' : 'Kopiert – in GoodNotes mit Strg+V einfügen');
  });

  $('shareBtn').addEventListener('click', async () => {
    let b = currentPngBlob();
    if (!b) return;
    b = await b;
    const file = new File([b], fileName('png'), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') toast('Teilen fehlgeschlagen: ' + e.message, true); }
    } else {
      download(b, file.name);
      toast('Teilen geht hier nicht – PNG wurde gespeichert.');
    }
  });

  $('pngBtn').addEventListener('click', async () => {
    let b = currentPngBlob();
    if (!b) return;
    download(await b, fileName('png'));
  });

  $('pdfBtn').addEventListener('click', async () => {
    const lay = doLayout();
    const blob = await Pdf.build(lay, renderOpts(1));
    if (!blob) { toast('Nichts zu speichern.', true); return; }
    const name = fileName('pdf');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') download(blob, name); }
    } else download(blob, name);
  });

  // Ziehen des Bildes (iPad Split View / PC) als Datei mit Namen
  $('previewImg').addEventListener('dragstart', (e) => {
    if (exportCache && e.dataTransfer) {
      try { e.dataTransfer.setData('DownloadURL', `image/png:${fileName('png')}:${$('previewImg').src}`); } catch (err) {}
    }
  });

  // ======================================================================
  // Daten
  // ======================================================================
  $('targetVariants').value = settings.target;
  $('targetVariants').addEventListener('change', (e) => {
    settings.target = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 3));
    e.target.value = settings.target; $('targetLabel').textContent = settings.target;
    saveSettings(); renderGrid();
  });
  $('targetLabel').textContent = settings.target;
  $('ghostToggle').checked = settings.ghost;
  $('ghostToggle').addEventListener('change', (e) => { settings.ghost = e.target.checked; saveSettings(); redraw(); });

  $('exportBtn').addEventListener('click', async () => {
    const data = { app: 'handschrift', version: 1, exported: new Date().toISOString(), custom: settings.custom, glyphs };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const d = new Date().toISOString().slice(0, 10);
    const name = `meine-handschrift-${d}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(blob, name);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'handschrift' || typeof data.glyphs !== 'object') throw new Error('Keine Handschrift-Datei');
      let added = 0, chars = 0;
      for (const [ch, list] of Object.entries(data.glyphs)) {
        if (!Array.isArray(list)) continue;
        const have = glyphs[ch] || [];
        const ids = new Set(have.map(v => v.id));
        const fresh = list.filter(v => v && Array.isArray(v.s) && v.s.every(Array.isArray) && !ids.has(v.id));
        if (!fresh.length) continue;
        glyphs[ch] = have.concat(fresh);
        added += fresh.length; chars++;
        await Store.saveChar(ch, glyphs[ch]);
      }
      for (const c of (data.custom || [])) if (!allChars().includes(c)) settings.custom.push(c);
      saveSettings(); fillGroupSelect();
      invalidatePreview(); renderGrid(); renderVariants(); redraw(); updateStorageInfo();
      toast(added ? `${added} Varianten für ${chars} Zeichen importiert` : 'Nichts Neues in der Datei');
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message, true);
    }
  });
  $('wipeBtn').addEventListener('click', async () => {
    if (!confirm('Wirklich ALLE gezeichneten Zeichen auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.')) return;
    await Store.clearAll();
    glyphs = {};
    invalidatePreview(); strokes = []; editingIdx = null; dirty = false;
    renderGrid(); renderVariants(); redraw(); updateStorageInfo();
    toast('Alles gelöscht');
  });

  async function updateStorageInfo() {
    let txt = `Gespeichert in ${Store.backend}.`;
    try {
      if (navigator.storage && navigator.storage.persisted) {
        txt += (await navigator.storage.persisted()) ? ' Dauerhaft geschützt.' : ' Kann vom Browser bei Platzmangel gelöscht werden – Export als Backup!';
      }
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (e.usage) txt += ` Belegt: ${(e.usage / 1024).toFixed(0)} KB.`;
      }
    } catch (e) {}
    if (isIOS && !window.navigator.standalone) txt += ' Tipp: Über Teilen → „Zum Home-Bildschirm“ installieren, dann bleiben die Daten sicherer.';
    $('storageInfo').textContent = txt;
  }
  $('versionInfo').textContent = `Handschrift ${APP_VERSION}`;

  // ======================================================================
  // Start
  // ======================================================================
  async function init() {
    applyBg(); renderColors(); fillGroupSelect();
    try { glyphs = await Store.loadAll(); } catch (e) { toast('Konnte Zeichen nicht laden: ' + e.message, true); }
    Store.persist();
    current = settings.current && allChars().includes(settings.current) ? settings.current : 'a';
    selectChar(current, true);
    showView(settings.view || (Object.keys(glyphs).length ? 'write' : 'draw'));
  }
  init();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Neue Version geladen – App neu öffnen für das Update.');
        });
      });
    }).catch((e) => console.warn('SW', e));
  }

  // Für Tests
  window.__hs = { get glyphs() { return glyphs; }, get settings() { return settings; }, selectChar, saveCurrent, updatePreview, doLayout };
})();
