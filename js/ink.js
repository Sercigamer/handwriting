// Ink: Striche -> Segmente, Glyphen-Maße, Textsatz mit natürlichen Abweichungen, Rendern.
// Koordinaten der Glyphen ("Einheiten"): Grundlinie y = 0, y wächst nach unten,
// Großbuchstaben-Linie y = -80, Mittellinie (x-Höhe) y = -40, Unterlänge y = +35.
(function () {
  'use strict';

  const M = {
    CAP: -80, XH: -40, DESC: 35,
    TOP: -105, BOTTOM: 50, WIDTH: 170, // Zeichenfläche im Editor
    LINE: 140,                          // Zeilenhöhe bei Zeilenabstand 1
    BASE_W: 3.0,                        // Strichbreite in Einheiten bei Strichstärke 1
  };

  // ---------- Zufall (mit Startwert, damit die Vorschau stabil bleibt) ----------
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.n = () => { // Normalverteilung, auf ±2.5 begrenzt
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return Math.max(-2.5, Math.min(2.5, z));
    };
    return next;
  }

  // ---------- Glyphen ----------
  const boxCache = new WeakMap();
  function bbox(variant) {
    let b = boxCache.get(variant);
    if (b) return b;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of variant.s) {
      for (let i = 0; i < s.length; i += 3) {
        const x = s[i], y = s[i + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) { minX = maxX = minY = maxY = 0; }
    b = { minX, maxX, minY, maxY };
    boxCache.set(variant, b);
    return b;
  }

  // ---------- Striche -> Segmente ----------
  // m = [a, b, c, d, e, f]: X = a*x + c*y + e, Y = b*x + d*y + f
  // emit(x0,y0, cx,cy, x1,y1, w) — quadratisches Kurvenstück mit Breite w (Ausgabe-Koordinaten)
  function strokeSegments(s, m, baseW, usePressure, emit) {
    const n = s.length / 3;
    if (n === 0) return;
    const ws = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const X = (i) => m[0] * s[i * 3] + m[2] * s[i * 3 + 1] + m[4];
    const Y = (i) => m[1] * s[i * 3] + m[3] * s[i * 3 + 1] + m[5];
    const W = (i) => {
      let p = s[i * 3 + 2];
      if (n > 2) { // Druck leicht glätten
        const a = s[Math.max(0, i - 1) * 3 + 2], b = s[Math.min(n - 1, i + 1) * 3 + 2];
        p = (a + 2 * p + b) / 4;
      }
      const f = usePressure ? 0.45 + 1.1 * Math.max(0, Math.min(1, p)) : 1;
      const edge = Math.min(i, n - 1 - i);
      const taper = n > 4 ? Math.min(1, 0.6 + 0.2 * edge) : 1;
      return Math.max(0.15, baseW * f * taper * ws);
    };
    if (n === 1) { const x = X(0), y = Y(0); emit(x, y, x, y, x, y, W(0) * 1.15); return; }
    if (n === 2) { emit(X(0), Y(0), (X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2, X(1), Y(1), (W(0) + W(1)) / 2); return; }
    let px = X(0), py = Y(0);
    let mx = (X(0) + X(1)) / 2, my = (Y(0) + Y(1)) / 2;
    emit(px, py, (px + mx) / 2, (py + my) / 2, mx, my, W(0));
    for (let i = 1; i < n - 1; i++) {
      const nx = (X(i) + X(i + 1)) / 2, ny = (Y(i) + Y(i + 1)) / 2;
      emit(mx, my, X(i), Y(i), nx, ny, W(i));
      mx = nx; my = ny;
    }
    const lx = X(n - 1), ly = Y(n - 1);
    emit(mx, my, (mx + lx) / 2, (my + ly) / 2, lx, ly, W(n - 1));
  }

  function drawStroke(ctx, s, m, baseW, usePressure) {
    strokeSegments(s, m, baseW, usePressure, (x0, y0, cx, cy, x1, y1, w) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      if (x0 === x1 && y0 === y1) ctx.lineTo(x1 + 0.01, y1);
      else ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
    });
  }

  function drawVariant(ctx, variant, m, baseW, usePressure) {
    for (const s of variant.s) drawStroke(ctx, s, m, baseW, usePressure);
  }

  // ---------- Textsatz ----------
  const FALLBACK = {
    '–': '-', '—': '-', '‑': '-', '−': '-',
    '„': '"', '“': '"', '”': '"', '«': '"', '»': '"',
    '‚': ',', '‘': "'", '’': "'", '´': "'", '`': "'",
    '…': '...', 'ẞ': 'ß', ' ': ' ',
  };

  // Liefert { glyphs:[{v, m, line}], lines:[{y}], missing:Set, unitsWidth }
  function layout(text, glyphs, o) {
    const v = Math.max(0, Math.min(1, o.variation));
    const r = rng(o.seed || 1);
    const lineW = o.lineWidth / (o.size / 80);     // Zeilenbreite in Einheiten
    const lineH = M.LINE * o.lineGap;
    const tracking = o.tracking;
    const wordSpace = o.wordSpace;
    const missing = new Set();
    const lastPick = {};

    const resolve = (ch) => {
      if (glyphs[ch] && glyphs[ch].length) return [ch];
      const f = FALLBACK[ch];
      if (f !== undefined) {
        if (f === ' ') return null;
        const parts = [...f];
        if (parts.every(c => glyphs[c] && glyphs[c].length)) return parts;
      }
      return [];
    };

    const pickVariant = (ch) => {
      const list = glyphs[ch];
      let i = Math.floor(r() * list.length);
      if (list.length > 1 && i === lastPick[ch]) i = (i + 1 + Math.floor(r() * (list.length - 1))) % list.length;
      lastPick[ch] = i;
      return list[i];
    };

    // Wörter in Glyph-Folgen umwandeln (Breiten in Einheiten, ohne Zeilen-Lage)
    const makeWord = (word) => {
      const items = [];
      for (const ch of word) {
        const res = resolve(ch);
        if (res === null) continue;
        if (!res.length) { missing.add(ch); items.push({ gap: 30 }); continue; }
        for (const c of res) {
          const variant = pickVariant(c);
          const b = bbox(variant);
          const s = 1 + r.n() * 0.045 * v;
          const sx = s * (1 + r.n() * 0.03 * v);
          const rot = r.n() * 2.2 * v * Math.PI / 180;
          const w = Math.max(4, (b.maxX - b.minX) * sx);
          items.push({ v: variant, b, sx, sy: s, rot, w, adv: w + tracking + r.n() * 1.6 * v + 7 });
        }
      }
      let width = 0;
      for (const it of items) width += it.gap !== undefined ? it.gap : it.adv;
      return { items, width };
    };

    const out = [];
    const lines = [];
    let maxRight = 0;
    let lineIdx = -1;
    let y = 0, x = 0, drift = 0, slope = 0, started = false;

    const newLine = () => {
      lineIdx++;
      y = lineIdx === 0 ? 0 : y + lineH * (1 + r.n() * 0.015 * v);
      x = Math.abs(r.n()) * 3 * v;
      drift = r.n() * 1.5 * v;
      slope = r.n() * 0.5 * v * Math.PI / 180;
      lines.push({ y });
      started = false;
    };

    const place = (it) => {
      if (it.gap !== undefined) { x += it.gap; return; }
      drift = drift * 0.8 + r.n() * 1.3 * v;
      drift = Math.max(-5 * v, Math.min(5 * v, drift));
      const by = y + drift + x * Math.tan(slope);
      const cos = Math.cos(it.rot), sin = Math.sin(it.rot);
      // Pivot: Mitte des Zeichens auf der Grundlinie
      const cxLocal = (it.b.minX + it.b.maxX) / 2;
      const px = x + (cxLocal - it.b.minX) * it.sx;
      // M = T(px, by) * R(rot) * S(sx, sy) * T(-cxLocal, 0)
      const a = cos * it.sx, b = sin * it.sx, c = -sin * it.sy, d = cos * it.sy;
      const e = px - a * cxLocal, f = by - b * cxLocal;
      out.push({ v: it.v, m: [a, b, c, d, e, f], line: lineIdx });
      x += it.adv;
      if (x > maxRight) maxRight = x;
    };

    const paragraphs = String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    for (const para of paragraphs) {
      newLine();
      const words = para.split(/ +/).filter(w => w.length);
      for (const word of words) {
        const wd = makeWord(word);
        if (!wd.items.length) continue;
        const space = started ? wordSpace * (1 + r.n() * 0.18 * v) : 0;
        if (started && x + space + wd.width > lineW) { newLine(); }
        else x += space;
        if (wd.width > lineW) {
          // Wort länger als die Zeile: buchstabenweise umbrechen
          for (const it of wd.items) {
            const adv = it.gap !== undefined ? it.gap : it.adv;
            if (started && x + adv > lineW) newLine();
            place(it); started = true;
          }
        } else {
          for (const it of wd.items) place(it);
        }
        started = true;
      }
    }
    return { glyphs: out, lines, missing, unitsWidth: Math.max(maxRight, 1) };
  }

  // Grenzen in Einheiten (exakt über alle Punkte)
  function bounds(lay, baseW) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of lay.glyphs) {
      const m = g.m;
      for (const s of g.v.s) {
        for (let i = 0; i < s.length; i += 3) {
          const X = m[0] * s[i] + m[2] * s[i + 1] + m[4];
          const Y = m[1] * s[i] + m[3] * s[i + 1] + m[5];
          if (X < minX) minX = X; if (X > maxX) maxX = X;
          if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
        }
      }
    }
    if (minX === Infinity) return null;
    const pad = baseW * 1.6 + 2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  const MAX_AREA = 16000000, MAX_SIDE = 16000; // iOS-Safari-Grenze für Canvas

  // Rendert auf ein neues Canvas mit durchsichtigem Hintergrund, eng zugeschnitten.
  // opts: size (px pro 80 Einheiten), ratio (Pixeldichte), color, thickness, pressure
  function render(lay, opts) {
    const baseW = M.BASE_W * opts.thickness;
    const bb = bounds(lay, baseW);
    if (!bb) return null;
    const unit = opts.size / 80;
    const cssW = (bb.maxX - bb.minX) * unit, cssH = (bb.maxY - bb.minY) * unit;
    let ratio = opts.ratio || 1;
    ratio = Math.min(ratio, Math.sqrt(MAX_AREA / Math.max(1, cssW * cssH)), MAX_SIDE / cssW, MAX_SIDE / cssH);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(cssW * ratio));
    canvas.height = Math.max(1, Math.ceil(cssH * ratio));
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opts.color;
    ctx.fillStyle = opts.color;
    const k = unit * ratio;
    for (const g of lay.glyphs) {
      const m = g.m;
      const mm = [m[0] * k, m[1] * k, m[2] * k, m[3] * k, (m[4] - bb.minX) * k, (m[5] - bb.minY) * k];
      drawVariant(ctx, g.v, mm, baseW, opts.pressure);
    }
    return { canvas, cssW, cssH, ratio, bounds: bb };
  }

  window.Ink = { M, rng, bbox, strokeSegments, drawStroke, drawVariant, layout, bounds, render, FALLBACK };
})();
