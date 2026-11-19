(function () {
  'use strict';
  const APP_VERSION = '1.1.0';
  const { M } = Ink;
  const $ = (id) => document.getElementById(id);

  // ---------- Zeichensatz: 114 Zeichen ----------
  const GROUPS = [
    { key: 'lower', name: 'Kleinbuchstaben', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
    { key: 'upper', name: 'Großbuchstaben', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
    { key: 'umlaut', name: 'Umlaute & Eszett', chars: [...'äöüÄÖÜß'] },
    { key: 'digits', name: 'Ziffern', chars: [...'0123456789'] },
    { key: 'punct', name: 'Satzzeichen', chars: [...'.,;:!?-–_()[]{}'] },
    { key: 'quotes', name: 'Anführungszeichen', chars: [...'"„“”\'‚‘’'] },
    { key: 'symbols', name: 'Symbole & Mathe', chars: [...'/\\|&+=<>%×÷~^°§*#@'] },
    { key: 'currency', name: 'Währungen', chars: [...'€$£¥'] },
  ];
  const NAMES = {
    '.': 'Punkt', ',': 'Komma', ';': 'Semikolon', ':': 'Doppelpunkt', '!': 'Ausrufezeichen', '?': 'Fragezeichen',
    '-': 'Bindestrich / Minus', '–': 'Gedankenstrich', '_': 'Unterstrich', '(': 'Klammer auf', ')': 'Klammer zu',
    '[': 'Eckige Klammer auf', ']': 'Eckige Klammer zu', '{': 'Geschweifte Klammer auf', '}': 'Geschweifte Klammer zu',
    '"': 'Anführungszeichen', '„': 'Anführungszeichen unten', '“': 'Anführungszeichen oben', '”': 'Schlusszeichen (englisch)',
    "'": 'Apostroph', '‚': 'Einfaches Anführungszeichen unten', '‘': 'Einfaches Anführungszeichen oben', '’': 'Einfaches Schlusszeichen',
    '/': 'Schrägstrich', '\\': 'Backslash', '|': 'Senkrechter Strich', '&': 'Und-Zeichen', '+': 'Plus', '=': 'Gleich',
    '<': 'Kleiner als', '>': 'Größer als', '%': 'Prozent', '×': 'Mal', '÷': 'Geteilt', '~': 'Tilde', '^': 'Dach',
    '°': 'Grad', '§': 'Paragraf', '*': 'Stern', '#': 'Raute', '@': 'At-Zeichen',
    '€': 'Euro', '$': 'Dollar', '£': 'Pfund', '¥': 'Yen', 'ß': 'Eszett',
  };
  const GROUP_HINTS = {
    lower: 'Bis zur gepunkteten Linie – Ober- und Unterlängen darüber hinaus.',
    upper: 'Von der Grundlinie bis zur oberen gestrichelten Linie.',
    umlaut: 'So, wie du sie sonst auch schreibst.',
    digits: 'Meist so hoch wie Großbuchstaben.',
    punct: 'Auf die richtige Höhe achten.',
    quotes: 'Auf die richtige Höhe achten.',
    symbols: 'Ungefähr in Buchstabengröße, mittig zur Zeile.',
    currency: 'So hoch wie Großbuchstaben.',
    custom: 'Eigenes Zeichen.',
  };
  const CHAR_HINTS = {
    '.': 'Punkt direkt auf die Grundlinie.', ',': 'Auf der Grundlinie, Schwanz etwas darunter.', ';': 'Komma auf der Grundlinie, Punkt darüber.',
    '„': 'Unten auf der Grundlinie, wie zwei kleine Kommas.', '‚': 'Unten auf der Grundlinie, wie ein Komma.',
    '“': 'Oben an der oberen Linie.', '”': 'Oben an der oberen Linie.', '"': 'Oben an der oberen Linie.', "'": 'Oben an der oberen Linie.',
    '‘': 'Oben an der oberen Linie.', '’': 'Oben an der oberen Linie.', '_': 'Auf oder knapp unter der Grundlinie.',
    '-': 'Kurzer Strich auf halber x-Höhe.', '–': 'Längerer Strich auf halber x-Höhe.', '°': 'Kleiner Kreis oben.', '^': 'Klein und oben.',
  };

  const DEFAULTS = {
    color: '#1c1c1c', size: 30, thick: 1.15, lineGap: 1.0, lineWidth: 720, variation: 55, tracking: 0,
    wordSpace: 34, pressure: true, bg: 'lined', target: 3, ghost: false, template: false, text: '', custom: [], seed: 1234,
    welcomed: false,
  };
  const COLORS = ['#1c1c1c', '#1d3a8a', '#2563eb', '#c62828', '#1b7f3b', '#6d28d9', '#ffffff'];
  const INK = '#f1f1f5';

  let settings = Object.assign({}, DEFAULTS, Store.loadSettings());
  if (settings.bg === 'plain') settings.bg = 'lined';
  let glyphs = {};
  let current = 'a';
  let strokes = [];
  let editingIdx = null;
  let dirty = false;
  let penSeen = false;

  const saveSettings = () => Store.saveSettings(settings);
  const baseChars = GROUPS.flatMap(g => g.chars);
  const allChars = () => baseChars.concat(settings.custom.filter(c => !baseChars.includes(c)));
  const groupOf = (ch) => (GROUPS.find(g => g.chars.includes(ch)) || { key: 'custom', name: 'Eigene Zeichen', chars: settings.custom });
  const count = (ch) => (glyphs[ch] ? glyphs[ch].length : 0);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const narrow = () => window.matchMedia('(max-width: 900px)').matches;

  function charName(ch) {
    if (NAMES[ch]) return NAMES[ch];
    if (/[a-zäöü]/.test(ch)) return 'Kleines ' + ch;
    if (/[A-ZÄÖÜ]/.test(ch)) return 'Großes ' + ch;
    if (/[0-9]/.test(ch)) return 'Ziffer ' + ch;
    return 'Zeichen ' + ch;
  }

  // ---------- Toast & Dialog ----------
  let toastTimer = 0;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), err ? 4500 : 2600);
  }

  function dialog({ title, text = '', ok = 'OK', cancel = 'Abbrechen', danger = false, input = null }) {
    return new Promise((resolve) => {
      const m = $('modal'), inp = $('modalInput'), okB = $('modalOk'), caB = $('modalCancel');
      $('modalTitle').textContent = title;
      $('modalText').textContent = text;
      $('modalText').hidden = !text;
      okB.textContent = ok; caB.textContent = cancel;
      okB.classList.toggle('danger', danger);
      okB.classList.toggle('primary', !danger);
      inp.hidden = input === null;
      inp.value = input || '';
      m.hidden = false;
      setTimeout(() => (input !== null ? inp : okB).focus(), 30);
      const done = (v) => {
        m.hidden = true;
        okB.onclick = caB.onclick = m.onclick = inp.onkeydown = null;
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(input !== null ? null : false); } };
      document.addEventListener('keydown', onKey, true);
      okB.onclick = () => done(input !== null ? inp.value : true);
      caB.onclick = () => done(input !== null ? null : false);
      m.onclick = (e) => { if (e.target === m) done(input !== null ? null : false); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } };
    });
  }
  const confirmDlg = (title, text, ok, danger) => dialog({ title, text, ok, danger });

  // ---------- Ansichten ----------
  function showView(name) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    settings.view = name; saveSettings();
    closeSheet();
    if (name === 'draw') requestAnimationFrame(sizeCanvas);
    if (name === 'write') schedulePreview(0);
    if (name === 'data') { updateStorageInfo(); renderGroupStats(); }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

  function updateProgress() {
    const chars = allChars();
    const done = chars.filter(c => count(c) > 0).length;
    const vars = Object.values(glyphs).reduce((a, l) => a + l.length, 0);
    const pct = Math.round(done / chars.length * 100);
    $('ringBar').style.strokeDashoffset = (113.1 * (1 - done / chars.length)).toFixed(1);
    $('ringPct').textContent = pct + '%';
    $('progMain').textContent = `${done} / ${chars.length}`;
    $('progSub').textContent = `Zeichen · ${vars} Varianten`;
  }

  // ======================================================================
  // Zeichnen
  // ======================================================================
  const canvas = $('drawCanvas');
  const ctx = canvas.getContext('2d');
  let unitPx = 1, dpr = 1;

  function sheetGroups() {
    const list = GROUPS.slice();
    const extra = settings.custom.filter(c => !baseChars.includes(c));
    if (extra.length) list.push({ key: 'custom', name: 'Eigene Zeichen', chars: extra });
    return list;
  }

  function renderSheet() {
    const body = $('charSheet');
    body.innerHTML = '';
    const target = settings.target;
    for (const g of sheetGroups()) {
      const sec = document.createElement('div');
      sec.className = 'group';
      const full = g.chars.filter(c => count(c) >= target).length;
      const title = document.createElement('div');
      title.className = 'group-title';
      title.innerHTML = '<span></span><span class="count"></span>';
      title.firstChild.textContent = g.name;
      title.lastChild.textContent = `${full}/${g.chars.length}`;
      if (full === g.chars.length) title.lastChild.classList.add('full');
      sec.appendChild(title);
      const grid = document.createElement('div');
      grid.className = 'chargrid';
      for (const ch of g.chars) {
        const b = document.createElement('button');
        const n = count(ch);
        b.className = 'cell' + (n >= target ? ' done' : n > 0 ? ' some' : '') + (ch === current ? ' sel' : '');
        b.textContent = ch;
        b.dataset.ch = ch;
        b.title = `${charName(ch)} – ${n} von ${target} Varianten`;
        if (n) {
          const f = document.createElement('span');
          f.className = 'fill';
          f.style.width = `calc((100% - 12px) * ${Math.min(1, n / target)})`;
          b.appendChild(f);
        }
        b.addEventListener('click', () => { selectChar(ch); if (narrow()) closeSheet(); });
        grid.appendChild(b);
      }
      sec.appendChild(grid);
      body.appendChild(sec);
    }
    updateProgress();
  }

  function openSheet() { $('sheet').classList.add('open'); const s = document.querySelector('.cell.sel'); if (s) s.scrollIntoView({ block: 'center' }); }
  function closeSheet() { $('sheet').classList.remove('open'); }
  $('sheetBtn').addEventListener('click', openSheet);
  $('sheetClose').addEventListener('click', closeSheet);

  async function confirmDiscard() {
    return !dirty || await confirmDlg('Zeichnung verwerfen?', 'Die Striche sind noch nicht gespeichert.', 'Verwerfen', true);
  }

  async function selectChar(ch, force) {
    if (ch === current && !force) return;
    if (!force && !(await confirmDiscard())) return;
    current = ch;
    strokes = []; editingIdx = null; dirty = false;
    settings.current = ch; saveSettings();
    $('currentChar').textContent = ch;
    $('charName').textContent = charName(ch);
    const g = groupOf(ch);
    $('charGroupLabel').textContent = `${g.name} · ${g.chars.indexOf(ch) + 1} von ${g.chars.length}`;
    $('charHint').textContent = CHAR_HINTS[ch] || GROUP_HINTS[g.key] || '';
    renderSheet();
    renderVariants();
    redraw();
    const sel = document.querySelector('.cell.sel');
    if (sel && !narrow()) sel.scrollIntoView({ block: 'nearest' });
  }

  function step(dir) {
    const chars = allChars();
    const i = chars.indexOf(current);
    selectChar(chars[(i + dir + chars.length) % chars.length]);
  }
  $('prevBtn').addEventListener('click', () => step(-1));
  $('nextBtn').addEventListener('click', () => step(1));

  function renderVariants() {
    const box = $('variants');
    box.innerHTML = '';
    const list = glyphs[current] || [];
    list.forEach((v, i) => {
      const b = document.createElement('div');
      b.className = 'variant' + (editingIdx === i ? ' sel' : '');
      b.title = `Variante ${i + 1} – antippen zum Korrigieren`;
      const c = document.createElement('canvas');
      b.appendChild(c);
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '✕'; x.title = 'Variante löschen';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await confirmDlg(`Variante ${i + 1} löschen?`, `„${current}“ hat danach ${list.length - 1} Variante${list.length - 1 === 1 ? '' : 'n'}.`, 'Löschen', true))) return;
        list.splice(i, 1);
        if (editingIdx === i) { editingIdx = null; strokes = []; dirty = false; }
        else if (editingIdx !== null && editingIdx > i) editingIdx--;
        await persistChar(current);
        renderVariants(); renderSheet(); redraw();
      });
      b.appendChild(x);
      b.addEventListener('click', async () => {
        if (editingIdx === i) return;
        if (!(await confirmDiscard())) return;
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
    n.innerHTML = '<svg><use href="#i-plus"/></svg>';
    n.title = 'Neue Variante zeichnen';
    n.addEventListener('click', async () => {
      if (editingIdx === null) return;
      if (!(await confirmDiscard())) return;
      editingIdx = null; strokes = []; dirty = false;
      renderVariants(); redraw();
    });
    box.appendChild(n);
    for (let k = list.length + 1; k < settings.target; k++) {
      const s = document.createElement('div');
      s.className = 'variant slot';
      box.appendChild(s);
    }
    updateButtons();
  }

  function thumb(c, v) {
    const r = window.devicePixelRatio || 1;
    const w = c.clientWidth || 58, h = c.clientHeight || 54;
    c.width = w * r; c.height = h * r;
    const g = c.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK;
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
    const maxH = Math.max(240, window.innerHeight - (narrow() ? 380 : 320));
    const h = Math.min(availW * (M.BOTTOM - M.TOP) / M.WIDTH, maxH);
    dpr = window.devicePixelRatio || 1;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(availW * dpr);
    canvas.height = Math.round(h * dpr);
    unitPx = h / (M.BOTTOM - M.TOP);
    redraw();
  }
  window.addEventListener('resize', () => requestAnimationFrame(sizeCanvas));

  const offX = () => (canvas.width / dpr - M.WIDTH * unitPx) / 2;
  const toUnits = (cx, cy) => [(cx - offX()) / unitPx, cy / unitPx + M.TOP];
  const editorMatrix = () => { const k = unitPx * dpr; return [k, 0, 0, k, offX() * dpr, -M.TOP * k]; };

  function redraw() {
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = unitPx * dpr;
    const yOf = (u) => (u - M.TOP) * k;
    // Grundlinien-Band dezent hervorheben
    ctx.fillStyle = 'rgba(139,124,255,0.035)';
    ctx.fillRect(0, yOf(M.XH), W, yOf(0) - yOf(M.XH));
    const line = (u, color, dash, width, label) => {
      ctx.beginPath(); ctx.setLineDash(dash.map(d => d * dpr)); ctx.strokeStyle = color; ctx.lineWidth = width * dpr;
      ctx.moveTo(0, yOf(u)); ctx.lineTo(W, yOf(u)); ctx.stroke();
      if (label) {
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(141,143,163,0.55)';
        ctx.font = `${11 * dpr}px -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText(label, 12 * dpr, yOf(u) - 6 * dpr);
      }
    };
    ctx.lineCap = 'butt';
    line(M.CAP, 'rgba(255,255,255,0.13)', [7, 7], 1, 'Großbuchstaben');
    line(M.XH, 'rgba(255,255,255,0.16)', [2, 6], 1.3, 'Mittellinie');
    line(0, 'rgba(139,124,255,0.75)', [], 1.6, 'Grundlinie');
    line(M.DESC, 'rgba(255,255,255,0.08)', [7, 7], 1, 'Unterlänge');
    ctx.setLineDash([]);
    if (settings.template) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `${112 * k}px -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(current, offX() * dpr + 85 * k, yOf(0));
      ctx.restore();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const m = editorMatrix();
    const bw = M.BASE_W * Math.max(1.1, settings.thick);
    if (settings.ghost) {
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      (glyphs[current] || []).forEach((v, i) => { if (i !== editingIdx) Ink.drawVariant(ctx, v, m, bw, false); });
    }
    ctx.strokeStyle = INK;
    for (const s of strokes) Ink.drawStroke(ctx, s, m, bw, settings.pressure);
  }

  // ---------- Eingabe ----------
  let active = null;
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
    if (e.pointerType === 'touch' && penSeen) return;
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
  const endStroke = (e) => { if (!active || e.pointerId !== active.id) return; active = null; redraw(); };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
    $('templateBtn').classList.toggle('on', !!settings.template);
  }

  function undo() { if (!strokes.length) return; strokes.pop(); dirty = true; redraw(); updateButtons(); }
  function clearDrawing() { if (!strokes.length) return; strokes = []; dirty = true; redraw(); updateButtons(); }
  $('undoBtn').addEventListener('click', undo);
  $('clearBtn').addEventListener('click', clearDrawing);
  function setTemplate(on) {
    settings.template = on; saveSettings();
    $('templateToggle').checked = on;
    updateButtons(); redraw();
  }
  $('templateBtn').addEventListener('click', () => setTemplate(!settings.template));

  async function persistChar(ch) {
    try { await Store.saveChar(ch, glyphs[ch] || []); }
    catch (e) { console.error(e); toast('Speichern fehlgeschlagen: ' + e.message, true); }
    invalidatePreview();
  }

  async function saveCurrent() {
    if (!strokes.length) {
      toast(editingIdx !== null ? 'Variante ist leer – zum Löschen das ✕ benutzen.' : 'Erst etwas zeichnen.', true);
      return false;
    }
    const variant = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), s: strokes.map(s => s.slice()), t: Date.now() };
    const list = glyphs[current] || (glyphs[current] = []);
    const wasEdit = editingIdx !== null && list[editingIdx];
    if (wasEdit) { variant.id = list[editingIdx].id; list[editingIdx] = variant; }
    else list.push(variant);
    await persistChar(current);
    const msg = wasEdit ? `„${current}“ Variante ${editingIdx + 1} korrigiert` : `„${current}“ gespeichert · ${list.length}/${settings.target}`;
    strokes = []; editingIdx = null; dirty = false;
    renderVariants(); renderSheet(); redraw();
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
    if (count(current) < settings.target) return;
    const n = nextMissing();
    if (n) selectChar(n, true);
    else toast(`Fertig! Alle ${allChars().length} Zeichen haben ${settings.target} Varianten. 🎉`);
  });

  $('addCharBtn').addEventListener('click', async () => {
    const v = await dialog({ title: 'Eigenes Zeichen', text: 'Welches Zeichen fehlt dir? (z. B. ½, ©, →)', ok: 'Hinzufügen', input: '' });
    if (!v) return;
    const ch = [...v.trim()][0];
    if (!ch) return;
    if (!allChars().includes(ch)) { settings.custom.push(ch); saveSettings(); }
    selectChar(ch);
  });

  document.addEventListener('keydown', (e) => {
    if (!$('view-draw').classList.contains('active') || !$('modal').hidden || !$('welcome').hidden) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { e.preventDefault(); $('saveNextBtn').click(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearDrawing(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
    if (e.key.length === 1 && e.key !== ' ' && allChars().includes(e.key)) { e.preventDefault(); selectChar(e.key); }
  });

  // ======================================================================
  // Schreiben
  // ======================================================================
  const RANGES = [
    ['size', 'sizeOut', v => v + ' px'],
    ['thick', 'thickOut', v => (+v).toFixed(2)],
    ['lineGap', 'lineOut', v => (+v).toFixed(2) + '×'],
    ['lineWidth', 'widthOut', v => v + ' px'],
    ['variation', 'varOut', v => v + ' %'],
    ['tracking', 'trackOut', v => (v > 0 ? '+' : '') + v],
    ['wordSpace', 'wordOut', v => v],
  ];
  const fillRange = (el) => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(1) + '%');
  for (const [key, out, fmt] of RANGES) {
    const el = $(key);
    el.value = settings[key];
    $(out).textContent = fmt(settings[key]);
    fillRange(el);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      $(out).textContent = fmt(settings[key]);
      fillRange(el);
      saveSettings();
      if (key === 'thick') redraw();
      schedulePreview();
    });
  }
  $('pressure').checked = settings.pressure;
  $('pressure').addEventListener('change', (e) => { settings.pressure = e.target.checked; saveSettings(); redraw(); schedulePreview(0); });
  document.querySelectorAll('#bgSeg button').forEach(b => b.addEventListener('click', () => { settings.bg = b.dataset.bg; saveSettings(); applyBg(); }));
  $('reseedBtn').addEventListener('click', () => { settings.seed = (Math.random() * 1e9) | 0; saveSettings(); schedulePreview(0); });
  const ta = $('textInput');
  ta.value = settings.text || '';
  ta.addEventListener('input', () => { settings.text = ta.value; saveSettings(); schedulePreview(); });

  function renderColors() {
    const box = $('colors');
    box.innerHTML = '';
    let preset = false;
    for (const c of COLORS) {
      const b = document.createElement('button');
      const sel = settings.color.toLowerCase() === c;
      preset = preset || sel;
      b.className = 'swatch' + (sel ? ' sel' : '');
      b.style.background = c; b.title = c;
      b.addEventListener('click', (e) => { e.preventDefault(); setColor(c); });
      box.appendChild(b);
    }
    const wrap = document.createElement('label');
    wrap.className = 'color-pick' + (preset ? '' : ' sel');
    wrap.title = 'Eigene Farbe';
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = settings.color;
    inp.addEventListener('input', () => { settings.color = inp.value.toLowerCase(); saveSettings(); schedulePreview(); });
    inp.addEventListener('change', () => renderColors());
    wrap.appendChild(inp);
    box.appendChild(wrap);
  }
  function setColor(c) {
    settings.color = c.toLowerCase(); saveSettings(); renderColors(); schedulePreview(0);
    if (c === '#ffffff' && settings.bg === 'lined') { settings.bg = 'dark'; saveSettings(); applyBg(); }
  }

  function applyBg() {
    const p = $('preview');
    p.classList.remove('bg-lined', 'bg-dark', 'bg-checker');
    p.classList.add('bg-' + settings.bg);
    document.querySelectorAll('#bgSeg button').forEach(b => b.classList.toggle('on', b.dataset.bg === settings.bg));
  }

  const EXPORT_RATIO = 3;
  let previewTimer = 0, previewUrl = null;
  let exportCache = null;
  let glyphVersion = 0;
  function renderKey() {
    return JSON.stringify([settings.text, settings.color, settings.size, settings.thick, settings.lineGap, settings.lineWidth,
      settings.variation, settings.tracking, settings.wordSpace, settings.pressure, settings.seed, glyphVersion]);
  }
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
    return { key, lay, res: Ink.render(lay, renderOpts(EXPORT_RATIO)) };
  }

  function updatePreview() {
    if (!$('view-write').classList.contains('active')) return;
    const { key, lay, res } = renderExportSync();
    showMissing(lay.missing);
    const img = $('previewImg');
    if (!res) {
      img.hidden = true; $('previewEmpty').hidden = false;
      exportCache = null; lastPreview = null;
      setExportEnabled(false);
      return;
    }
    res.canvas.toBlob((blob) => {
      if (!blob) return;
      exportCache = { key, blob };
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      img.src = previewUrl;
      lastPreview = { cssW: res.cssW, cssH: res.cssH, minY: res.bounds.minY };
      sizePreview();
      img.hidden = false;
      $('previewEmpty').hidden = true;
      setExportEnabled(true);
    }, 'image/png');
  }

  let lastPreview = null;
  function sizePreview() {
    if (!lastPreview) return;
    const p = $('preview'), img = $('previewImg');
    const PAD = 28;
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
    box.textContent = 'Noch nicht gezeichnet:';
    for (const ch of set) {
      const b = document.createElement('button');
      b.textContent = ch;
      b.title = `${charName(ch)} jetzt zeichnen`;
      b.addEventListener('click', () => {
        if (!allChars().includes(ch)) { settings.custom.push(ch); saveSettings(); }
        showView('draw'); selectChar(ch);
      });
      box.appendChild(b);
    }
  }

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

  $('copyBtn').addEventListener('click', async () => {
    const b = currentPngBlob();
    if (!b) { toast('Nichts zu kopieren.', true); return; }
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      toast('Zwischenablage nicht verfügbar. Nutze „Teilen“ oder „PNG“.', true); return;
    }
    try {
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
    toast(isIOS ? '✓ Kopiert – in GoodNotes lange tippen → Einsetzen' : '✓ Kopiert – in GoodNotes mit Strg+V einfügen');
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
    const b = currentPngBlob();
    if (b) download(await b, fileName('png'));
  });
  $('pdfBtn').addEventListener('click', async () => {
    const blob = await Pdf.build(doLayout(), renderOpts(1));
    if (!blob) { toast('Nichts zu speichern.', true); return; }
    const name = fileName('pdf');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') download(blob, name); }
    } else download(blob, name);
  });
  $('previewImg').addEventListener('dragstart', (e) => {
    if (exportCache && e.dataTransfer) {
      try { e.dataTransfer.setData('DownloadURL', `image/png:${fileName('png')}:${$('previewImg').src}`); } catch (err) {}
    }
  });

  // ======================================================================
  // Daten
  // ======================================================================
  function setTarget(n) {
    settings.target = Math.max(1, Math.min(8, n));
    $('targetOut').textContent = settings.target;
    saveSettings(); renderSheet(); renderVariants(); renderGroupStats();
  }
  $('targetOut').textContent = settings.target;
  $('tMinus').addEventListener('click', () => setTarget(settings.target - 1));
  $('tPlus').addEventListener('click', () => setTarget(settings.target + 1));
  $('ghostToggle').checked = settings.ghost;
  $('ghostToggle').addEventListener('change', (e) => { settings.ghost = e.target.checked; saveSettings(); redraw(); });
  $('templateToggle').checked = settings.template;
  $('templateToggle').addEventListener('change', (e) => setTemplate(e.target.checked));

  function renderGroupStats() {
    const box = $('groupStats');
    box.innerHTML = '';
    for (const g of sheetGroups()) {
      const done = g.chars.filter(c => count(c) >= settings.target).length;
      const row = document.createElement('div');
      row.className = 'gs';
      row.innerHTML = '<span></span><span></span><div class="bar"><i></i></div>';
      row.children[0].textContent = g.name;
      row.children[1].textContent = `${done} / ${g.chars.length}`;
      row.querySelector('i').style.width = (done / g.chars.length * 100) + '%';
      box.appendChild(row);
    }
  }

  async function exportData() {
    const data = { app: 'handschrift', version: 1, exported: new Date().toISOString(), custom: settings.custom, glyphs };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `meine-handschrift-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(blob, name);
  }
  $('exportBtn').addEventListener('click', exportData);
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
      settings.welcomed = true; $('welcome').hidden = true;
      saveSettings();
      invalidatePreview(); renderSheet(); renderVariants(); redraw(); updateStorageInfo(); renderGroupStats();
      toast(added ? `${added} Varianten für ${chars} Zeichen importiert` : 'Nichts Neues in der Datei');
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message, true);
    }
  });
  $('wipeBtn').addEventListener('click', async () => {
    if (!(await confirmDlg('Alle Zeichen löschen?', 'Alle gezeichneten Zeichen auf diesem Gerät werden gelöscht. Das lässt sich nicht rückgängig machen.', 'Alles löschen', true))) return;
    await Store.clearAll();
    glyphs = {};
    invalidatePreview(); strokes = []; editingIdx = null; dirty = false;
    renderSheet(); renderVariants(); redraw(); updateStorageInfo(); renderGroupStats();
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

  // ---------- Willkommen ----------
  $('welcomeGo').addEventListener('click', () => {
    settings.welcomed = true; saveSettings();
    $('welcome').hidden = true;
    showView('draw');
    selectChar(nextMissing() || 'a', true);
  });
  $('welcomeImport').addEventListener('click', () => $('importFile').click());

  // ======================================================================
  // Start
  // ======================================================================
  async function init() {
    applyBg(); renderColors();
    try { glyphs = await Store.loadAll(); } catch (e) { toast('Konnte Zeichen nicht laden: ' + e.message, true); }
    Store.persist();
    current = settings.current && allChars().includes(settings.current) ? settings.current : 'a';
    await selectChar(current, true);
    const hasGlyphs = Object.keys(glyphs).length > 0;
    if (hasGlyphs) settings.welcomed = true;
    showView(settings.view || (hasGlyphs ? 'write' : 'draw'));
    $('welcome').hidden = !!settings.welcomed;
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

  window.__hs = { get glyphs() { return glyphs; }, get settings() { return settings; }, selectChar, saveCurrent, updatePreview, doLayout, allChars };
})();
