// Reads a SheetJS workbook into a snapshot, or a list of short, specific problems.
// Runs only in the browser. Nothing here touches the network.
(function (root) {
  'use strict';

  const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, '');
  const isBlank = (v) => v == null || String(v).trim() === '';

  function findSheet(wb, name) {
    const key = norm(name);
    const hit = wb.SheetNames.find((n) => norm(n) === key);
    return hit ? wb.Sheets[hit] : null;
  }

  function rows(ws) {
    return root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }

  // "1,200", "Rs 1,200", 1200 -> 1200. Returns NaN if it is not a number.
  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (isBlank(v)) return NaN;
    const s = String(v).replace(/[,\s]/g, '').replace(/^[^\d\-.]+/, '');
    return s === '' || !/^-?\d*\.?\d+$/.test(s) ? NaN : Number(s);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Excel date serial, "2026-10-09" or "9 Oct 2026" -> "2026-10-09". Null if unreadable.
  function toISODate(v) {
    if (typeof v === 'number' && v > 0) {
      const p = root.XLSX.SSF.parse_date_code(v);
      return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
    }
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (isBlank(v)) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\s\-/]+([a-z]{3})[a-z]*[\s\-/,]+(\d{4})$/i);
    if (m) return valid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    m = s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (m) return valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    return null;
  }

  function valid(y, mo, d) {
    if (mo < 1 || mo > 12) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  function validCurrency(code) {
    if (!/^[A-Z]{3}$/.test(code)) return false;
    try { new Intl.NumberFormat('en', { style: 'currency', currency: code }); return true; } catch (e) { return false; }
  }

  // Looks for a label like "Snapshot Date" anywhere near the top and returns the cell to its right.
  function findSetting(wb, labels) {
    const keys = labels.map(norm);
    for (const name of wb.SheetNames) {
      const r = rows(wb.Sheets[name]);
      for (let i = 0; i < Math.min(r.length, 15); i++) {
        const row = r[i] || [];
        for (let j = 0; j < row.length - 0; j++) {
          if (keys.includes(norm(row[j]))) return { found: true, value: row[j + 1], sheet: name, row: i + 1 };
        }
      }
    }
    return { found: false };
  }

  // Finds the header row and maps each wanted column to its position.
  function readTable(r, wanted, firstKey) {
    const hi = r.findIndex((row) => (row || []).some((c) => norm(c) === firstKey));
    if (hi < 0) return { headerIndex: -1, cols: {} };
    const header = r[hi].map(norm);
    const cols = {};
    for (const [key, names] of Object.entries(wanted)) {
      const idx = header.findIndex((h) => names.includes(h));
      cols[key] = idx;
    }
    return { headerIndex: hi, cols };
  }

  function parseWorkbook(wb) {
    const errors = [];
    const budgetWs = findSheet(wb, 'Budget');
    const savingsWs = findSheet(wb, 'Savings');
    if (!budgetWs) errors.push('No “Budget” sheet found. Use the template.');
    if (!savingsWs) errors.push('No “Savings” sheet found. Use the template.');

    // Settings
    const dateCell = findSetting(wb, ['Snapshot Date', 'As Of', 'As Of Date']);
    let date = null;
    if (!dateCell.found || isBlank(dateCell.value)) errors.push('Snapshot Date is missing. Add it next to “Snapshot Date”.');
    else {
      date = toISODate(dateCell.value);
      if (!date) errors.push(`Snapshot Date “${dateCell.value}” isn’t a date. Try 2026-10-09.`);
    }
    const curCell = findSetting(wb, ['Currency']);
    let currency = 'PKR';
    if (curCell.found && !isBlank(curCell.value)) {
      const c = String(curCell.value).trim().toUpperCase();
      if (validCurrency(c)) currency = c;
      else errors.push(`Currency “${curCell.value}” isn’t valid. Use a 3-letter code like PKR or USD.`);
    }

    // Budget
    const budget = [];
    if (budgetWs) {
      const r = rows(budgetWs);
      const { headerIndex, cols } = readTable(r, {
        name: ['category'],
        budget: ['monthlybudget', 'budget'],
        spent: ['spentsofar', 'spent'],
      }, 'category');
      if (headerIndex < 0) errors.push('Budget sheet: no “Category” column.');
      else {
        if (cols.budget < 0) errors.push('Budget sheet: no “Monthly Budget” column.');
        if (cols.spent < 0) errors.push('Budget sheet: no “Spent So Far” column.');
        if (cols.budget >= 0 && cols.spent >= 0) {
          const seen = new Set();
          for (let i = headerIndex + 1; i < r.length; i++) {
            const row = r[i] || [];
            const rawName = row[cols.name], rawB = row[cols.budget], rawS = row[cols.spent];
            if (isBlank(rawName) && isBlank(rawB) && isBlank(rawS)) continue;
            const line = i + 1;
            const name = String(rawName == null ? '' : rawName).trim();
            if (!name) { errors.push(`Budget row ${line}: category name is empty.`); continue; }
            const b = toNumber(rawB);
            const s = isBlank(rawS) ? 0 : toNumber(rawS);
            if (isBlank(rawB)) errors.push(`${name}: Monthly Budget is empty.`);
            else if (!Number.isFinite(b)) errors.push(`${name}: Monthly Budget “${rawB}” isn’t a number.`);
            else if (b < 0) errors.push(`${name}: Monthly Budget can’t be negative.`);
            if (!Number.isFinite(s)) errors.push(`${name}: Spent So Far “${rawS}” isn’t a number.`);
            else if (s < 0) errors.push(`${name}: Spent So Far can’t be negative.`);
            const key = name.toLowerCase();
            if (seen.has(key)) errors.push(`${name} is listed twice. Keep one row per category.`);
            seen.add(key);
            budget.push({ name, budget: b, spent: s });
          }
          if (!budget.length) errors.push('Budget sheet has no categories yet.');
        }
      }
    }

    // Savings
    const goals = [];
    if (savingsWs) {
      const r = rows(savingsWs);
      const { headerIndex, cols } = readTable(r, {
        name: ['goalname', 'goal'],
        target: ['targetamount', 'target'],
        saved: ['amountsaved', 'saved'],
        deadline: ['goaldeadline', 'deadline'],
      }, 'goalname');
      if (headerIndex < 0) errors.push('Savings sheet: no “Goal Name” column.');
      else {
        if (cols.target < 0) errors.push('Savings sheet: no “Target Amount” column.');
        if (cols.saved < 0) errors.push('Savings sheet: no “Amount Saved” column.');
        if (cols.target >= 0 && cols.saved >= 0) {
          for (let i = headerIndex + 1; i < r.length; i++) {
            const row = r[i] || [];
            const rawName = row[cols.name], rawT = row[cols.target], rawS = row[cols.saved];
            const rawD = cols.deadline >= 0 ? row[cols.deadline] : null;
            if (isBlank(rawName) && isBlank(rawT) && isBlank(rawS) && isBlank(rawD)) continue;
            const line = i + 1;
            const name = String(rawName == null ? '' : rawName).trim();
            if (!name) { errors.push(`Savings row ${line}: goal name is empty.`); continue; }
            const t = toNumber(rawT);
            const s = isBlank(rawS) ? 0 : toNumber(rawS);
            if (isBlank(rawT)) errors.push(`${name}: Target Amount is empty.`);
            else if (!Number.isFinite(t)) errors.push(`${name}: Target Amount “${rawT}” isn’t a number.`);
            else if (t < 0) errors.push(`${name}: Target Amount can’t be negative.`);
            if (!Number.isFinite(s)) errors.push(`${name}: Amount Saved “${rawS}” isn’t a number.`);
            else if (s < 0) errors.push(`${name}: Amount Saved can’t be negative.`);
            let deadline = null;
            if (!isBlank(rawD)) {
              deadline = toISODate(rawD);
              if (!deadline) errors.push(`${name}: Goal Deadline “${rawD}” isn’t a date.`);
            }
            goals.push({ name, target: t, saved: s, deadline });
          }
        }
      }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, snapshot: { date, currency, budget, goals, importedAt: new Date().toISOString() } };
  }

  const api = { parseWorkbook, toNumber, toISODate, validCurrency };
  root.Parse = api;
})(typeof self !== 'undefined' ? self : this);
