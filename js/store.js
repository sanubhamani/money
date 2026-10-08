// Dated snapshots saved on this device only. One snapshot per date; the same date replaces the old one.
(function (root) {
  'use strict';

  const KEY = 'budget.snapshots.v1';
  const CURRENT = 'budget.current.v1';

  function create(storage) {
    function readAll() {
      try { return JSON.parse(storage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function writeAll(all) {
      storage.setItem(KEY, JSON.stringify(all)); // may throw if storage is full or blocked
    }
    return {
      all: readAll,
      // Returns { replaced: true } when that date already existed.
      save(snap) {
        const all = readAll();
        const replaced = Object.prototype.hasOwnProperty.call(all, snap.date);
        all[snap.date] = snap; // replace, never add to old totals
        writeAll(all);
        storage.setItem(CURRENT, snap.date);
        return { replaced };
      },
      current() {
        const all = readAll();
        let d = null;
        try { d = storage.getItem(CURRENT); } catch (e) { /* ignore */ }
        if (d && all[d]) return all[d];
        const dates = Object.keys(all).sort();
        return dates.length ? all[dates[dates.length - 1]] : null;
      },
      remove(date) {
        const all = readAll();
        delete all[date];
        writeAll(all);
        if (storage.getItem(CURRENT) === date) storage.removeItem(CURRENT);
      },
      clear() {
        storage.removeItem(KEY);
        storage.removeItem(CURRENT);
      },
    };
  }

  // In-memory fallback for private browsing or blocked storage.
  function memoryStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  }

  function browserStorage() {
    try {
      const s = root.localStorage;
      s.setItem('__t', '1');
      s.removeItem('__t');
      return { storage: s, persistent: true };
    } catch (e) {
      return { storage: memoryStorage(), persistent: false };
    }
  }

  root.Store = { create, memoryStorage, browserStorage };
})(typeof self !== 'undefined' ? self : this);
