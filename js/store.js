// Everything is saved on this device only, under one key. Backups are a plain file the person keeps.
(function (root) {
  'use strict';

  const KEY = 'money.v2';

  function empty() {
    return { version: 2, currency: 'PKR', categories: [], goals: [], entries: [], savings: [], meta: { lastBackup: null, setupDone: false } };
  }

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isStr = (s) => typeof s === 'string' && s.trim() !== '';

  // Checks a loaded backup. Returns clean data or null.
  function validate(raw) {
    const d = raw && raw.app === 'money' && raw.data ? raw.data : raw;
    if (!d || typeof d !== 'object') return null;
    const arr = (x) => (Array.isArray(x) ? x : null);
    const cats = arr(d.categories), goals = arr(d.goals), entries = arr(d.entries), savings = arr(d.savings);
    if (!cats || !goals || !entries || !savings) return null;
    if (!cats.every((c) => isStr(c.id) && isStr(c.name) && isNum(c.budget) && c.budget >= 0)) return null;
    if (!goals.every((g) => isStr(g.id) && isStr(g.name) && isNum(g.target) && g.target >= 0 && (g.deadline == null || isDate(g.deadline)))) return null;
    if (!entries.every((e) => isStr(e.id) && isStr(e.catId) && isNum(e.amount) && e.amount > 0 && isDate(e.date))) return null;
    if (!savings.every((s) => isStr(s.id) && isStr(s.goalId) && isNum(s.amount) && s.amount > 0 && isDate(s.date))) return null;
    const out = empty();
    out.currency = /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'PKR';
    out.categories = cats.map((c) => ({ id: c.id, name: c.name.trim(), budget: c.budget }));
    out.goals = goals.map((g) => ({ id: g.id, name: g.name.trim(), target: g.target, deadline: g.deadline || null }));
    out.entries = entries.map((e) => ({ id: e.id, catId: e.catId, amount: e.amount, date: e.date }));
    out.savings = savings.map((s) => ({ id: s.id, goalId: s.goalId, amount: s.amount, date: s.date }));
    out.meta = { lastBackup: (d.meta && d.meta.lastBackup) || null, setupDone: out.categories.length > 0, seenBadges: (d.meta && d.meta.seenBadges) || [] };
    return out;
  }

  function create(storage) {
    return {
      load() {
        try {
          const raw = storage.getItem(KEY);
          if (!raw) return empty();
          return validate(JSON.parse(raw)) || empty();
        } catch (e) {
          return empty();
        }
      },
      save(data) {
        storage.setItem(KEY, JSON.stringify(data)); // may throw if storage is full or blocked
      },
      clear() {
        storage.removeItem(KEY);
      },
    };
  }

  function backupFile(data, todayISO) {
    const body = JSON.stringify({ app: 'money', version: 2, savedAt: new Date().toISOString(), data }, null, 1);
    return { name: `money-backup-${todayISO}.json`, body };
  }

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

  root.Store = { KEY, empty, newId, validate, create, backupFile, memoryStorage, browserStorage };
})(typeof self !== 'undefined' ? self : this);
