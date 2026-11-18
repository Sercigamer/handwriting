// Speicher: Glyphen in IndexedDB (ein Eintrag pro Zeichen), Fallback localStorage.
// Einstellungen in localStorage. Alles nur auf diesem Gerät.
(function () {
  'use strict';
  const DB_NAME = 'handschrift';
  const STORE = 'glyphs';
  let dbPromise = null;
  let useLS = false;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('kein IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(st, v => { result = v; })).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const LS_KEY = 'handschrift.glyphs';
  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function lsWrite(all) { localStorage.setItem(LS_KEY, JSON.stringify(all)); }

  // Liefert { zeichen: [variante, ...] }
  async function loadAll() {
    if (!useLS) {
      try {
        return await tx('readonly', (st, done) => {
          const out = {};
          const req = st.openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) { if (Array.isArray(c.value) && c.value.length) out[c.key] = c.value; c.continue(); }
            else done(out);
          };
        });
      } catch (e) {
        console.warn('IndexedDB nicht nutzbar, nehme localStorage', e);
        useLS = true;
      }
    }
    return lsAll();
  }

  async function saveChar(ch, variants) {
    if (!useLS) {
      try {
        await tx('readwrite', st => {
          if (variants && variants.length) st.put(variants, ch); else st.delete(ch);
        });
        return;
      } catch (e) { console.warn(e); useLS = true; }
    }
    const all = lsAll();
    if (variants && variants.length) all[ch] = variants; else delete all[ch];
    lsWrite(all);
  }

  async function clearAll() {
    if (!useLS) {
      try { await tx('readwrite', st => { st.clear(); }); } catch (e) { useLS = true; }
    }
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  async function persist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      }
    } catch (e) {}
    return false;
  }

  const SET_KEY = 'handschrift.settings';
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
  }

  window.Store = { loadAll, saveChar, clearAll, persist, loadSettings, saveSettings,
    get backend() { return useLS ? 'localStorage' : 'IndexedDB'; } };
})();
