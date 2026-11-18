// Nur zum Testen: zeichnet ein paar grobe Testbuchstaben über echte Pointer-Events (Stift mit Druck)
// in die App. Im Browser-Konsolenfenster der App ausführen: await (await fetch('tools/test-glyphs.js')).text() …
// oder per CDP auswerten. Ergebnis: je 3 Varianten für die Zeichen unten.
(async () => {
  const c = document.getElementById('drawCanvas');
  const PI = Math.PI;
  const ell = (cx, cy, rx, ry, a0, a1, n = 24) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; };
  const lin = (...pts) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3)); for (let k = (i ? 1 : 0); k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); } return out; };
  const G = {
    o: [ell(15, -20, 14, 20, -PI / 2, 1.5 * PI + 0.3)],
    a: [ell(15, -20, 14, 20, -0.3, 2 * PI - 0.2), lin([29, -38], [29, 0])],
    l: [lin([5, -82], [5, -4], [9, 0])],
    h: [lin([3, -82], [3, 0]), ell(15, -22, 12, 14, PI, 2 * PI).concat(lin([27, -22], [27, 0]))],
    e: [lin([2, -20], [28, -22]).concat(ell(15, -20, 13, 20, 0, -1.7 * PI))],
    w: [lin([0, -40], [8, 0], [16, -30], [24, 0], [32, -40])],
    t: [lin([8, -65], [8, -3], [14, 0]), lin([0, -40], [18, -40])],
    H: [lin([0, -80], [0, 0]), lin([30, -80], [30, 0]), lin([0, -42], [30, -42])],
    i: [lin([4, -40], [4, 0]), [[4, -55]]],
    n: [lin([2, -40], [2, 0]), ell(14, -26, 12, 12, PI, 2 * PI).concat(lin([26, -26], [26, 0]))],
    '.': [[[2, -1]]], '!': [lin([3, -80], [3, -20]), [[3, -1]]], ',': [lin([3, -2], [0, 10])],
  };
  const fire = (type, x, y, p) => {
    const r = c.getBoundingClientRect(), u = r.height / 155, off = (r.width - 170 * u) / 2;
    c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: p, clientX: r.left + off + x * u, clientY: r.top + (y + 105) * u }));
  };
  let seed = 11;
  for (const ch of Object.keys(G)) for (let v = 0; v < 3; v++) {
    let s = (seed += 97);
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
    window.__hs.selectChar(ch, true);
    const dx = 60 + rnd() * 6, sk = rnd() * 0.15, sc = 1 + rnd() * 0.1;
    for (const stroke of G[ch]) {
      const pts = stroke.map(([x, y]) => [dx + (x + (-y) * sk) * sc + rnd() * 0.8, y * sc + rnd() * 0.8]);
      fire('pointerdown', pts[0][0], pts[0][1], 0.3);
      for (let i = 1; i < pts.length; i++) fire('pointermove', pts[i][0], pts[i][1], 0.35 + 0.4 * Math.sin(PI * i / pts.length));
      fire('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1], 0);
    }
    await window.__hs.saveCurrent();
  }
  return Object.keys(window.__hs.glyphs).length;
})();
