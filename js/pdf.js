// Kleiner PDF-Schreiber: Handschrift als Vektor-Striche auf A4-Seiten (durchsichtiger Hintergrund).
(function () {
  'use strict';
  const PW = 595.28, PH = 841.89, MARGIN = 42;

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const f = (x) => (Math.round(x * 100) / 100).toString();

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate');
      const stream = new Blob([bytes]).stream().pipeThrough(cs);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { return null; }
  }

  // lay: Ergebnis von Ink.layout; opts wie bei Ink.render
  async function build(lay, opts) {
    const baseW = Ink.M.BASE_W * opts.thickness;
    const bb = Ink.bounds(lay, baseW);
    if (!bb) return null;
    // 1 CSS-Pixel = 0,75 pt; zu breite Zeilen werden auf die Seitenbreite verkleinert
    let pt = (opts.size / 80) * 0.75;
    const avail = PW - 2 * MARGIN;
    if ((bb.maxX - bb.minX) * pt > avail) pt = avail / (bb.maxX - bb.minX);

    // Zeilen auf Seiten verteilen
    const lineTop = Ink.M.TOP + 5, lineBottom = Ink.M.BOTTOM;
    const pages = [];
    let page = null, offset = 0;
    const lineToPage = [];
    lay.lines.forEach((ln, i) => {
      const top = ln.y + lineTop, bottom = ln.y + lineBottom;
      if (!page || (bottom - offset) * pt > PH - 2 * MARGIN) {
        page = { ops: [] };
        pages.push(page);
        offset = top;
      }
      lineToPage[i] = { page, offset };
    });

    const [r, g, b] = hexToRgb(opts.color);
    for (const p of pages) p.ops.push(`${f(r)} ${f(g)} ${f(b)} RG 1 J 1 j`);
    for (const gl of lay.glyphs) {
      const lp = lineToPage[gl.line];
      if (!lp) continue;
      const m = gl.m;
      // Einheiten -> pt, y nach oben
      const mm = [m[0] * pt, -m[1] * pt, m[2] * pt, -m[3] * pt,
        MARGIN + (m[4] - bb.minX) * pt, PH - MARGIN - (m[5] - lp.offset) * pt];
      const ops = lp.page.ops;
      for (const s of gl.v.s) {
        Ink.strokeSegments(s, mm, baseW, opts.pressure, (x0, y0, cx, cy, x1, y1, w) => {
          if (x0 === x1 && y0 === y1) { ops.push(`${f(w)} w ${f(x0)} ${f(y0)} m ${f(x1)} ${f(y1)} l S`); return; }
          // quadratisch -> kubisch
          const c1x = x0 + 2 / 3 * (cx - x0), c1y = y0 + 2 / 3 * (cy - y0);
          const c2x = x1 + 2 / 3 * (cx - x1), c2y = y1 + 2 / 3 * (cy - y1);
          ops.push(`${f(w)} w ${f(x0)} ${f(y0)} m ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x1)} ${f(y1)} c S`);
        });
      }
    }

    // PDF zusammensetzen
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let pos = 0;
    const push = (data) => { const u = typeof data === 'string' ? enc.encode(data) : data; parts.push(u); pos += u.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const nPages = pages.length;
    // Objekte: 1 Katalog, 2 Seitenbaum, dann je Seite: Seite + Inhalt
    const pageIds = pages.map((_, i) => 3 + i * 2);
    const obj = (id, body) => { offsets[id] = pos; push(`${id} 0 obj\n`); push(body); push('\nendobj\n'); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${nPages} >>`);
    for (let i = 0; i < nPages; i++) {
      const pid = pageIds[i], cid = pid + 1;
      obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << >> /Contents ${cid} 0 R >>`);
      const raw = enc.encode(pages[i].ops.join('\n'));
      const z = await deflate(raw);
      offsets[cid] = pos;
      push(`${cid} 0 obj\n<< /Length ${(z || raw).length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
      push(z || raw);
      push('\nendstream\nendobj\n');
    }
    const count = 3 + nPages * 2;
    const xref = pos;
    let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  window.Pdf = { build };
})();
