// Money: type what you spend, see what's left. Everything stays on this device.
(function () {
  'use strict';
  const { Calc, Store, Badges } = window;
  const $ = (s, el = document) => el.querySelector(s);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const { storage, persistent } = Store.browserStorage();
  const store = Store.create(storage);
  if (persistent && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  let data = store.load();
  if (!data.meta.seenBadges) data.meta.seenBadges = [];
  const today = () => Calc.toISO(new Date());

  function commit() {
    try {
      store.save(data);
      return true;
    } catch (e) {
      toast('Couldn’t save. This phone’s storage may be full.');
      return false;
    }
  }

  // ---------- Formatting ----------
  function money(n, opts = {}) {
    const cur = data.currency;
    const abs = Math.abs(n);
    let s;
    try {
      s = new Intl.NumberFormat(undefined, {
        style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: abs % 1 && abs < 1000 ? 2 : 0,
      }).format(abs);
    } catch (e) {
      s = `${cur} ${Math.round(abs).toLocaleString()}`;
    }
    if (n < 0) return '−' + s;
    return opts.plus && n > 0 ? '+' + s : s;
  }
  function curSymbol() {
    try {
      const p = new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      return (p.find((x) => x.type === 'currency') || {}).value || data.currency;
    } catch (e) { return data.currency; }
  }
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
  function niceDate(iso, withYear) {
    const d = Calc.parseISO(iso);
    const showYear = withYear || d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined });
  }
  const monthName = (iso) => Calc.parseISO(iso).toLocaleDateString('en-GB', { month: 'long' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "1,200" or "Rs 1200" -> 1200. NaN if not a number.
  function readAmount(v) {
    const s = String(v || '').replace(/[,\s]/g, '').replace(/^[^\d.]+/, '');
    return /^\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }

  // ---------- Status words + symbols (colour is never the only signal) ----------
  const STATUS = {
    ok: { sym: '✓', word: 'On track' },
    close: { sym: '!', word: 'Almost out' },
    over: { sym: '✕', word: 'Over' },
    none: { sym: '–', word: 'No budget' },
  };
  const chip = (status, word) => `<span class="chip chip-${status}"><span aria-hidden="true">${STATUS[status].sym}</span> ${word || STATUS[status].word}</span>`;

  // ---------- Icons ----------
  const ICONS = {
    food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1-3 4-3 7s1 4 3 4"/>',
    transport: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 21l1-4M16 21l-1-4"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
    shopping: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    entertainment: '<path d="M3 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v3Z" transform="translate(0 1.5)"/><path d="M14 5.5v12" stroke-dasharray="2 2"/>',
    bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    health: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    study: '<path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M7 10v5c3 2 7 2 10 0v-5"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-1-3-5-4-5-1.5S12 9 12 9Zm0 0c1-3 5-4 5-1.5S12 9 12 9Z"/>',
    home: '<path d="M4 11 12 4l8 7v9H4v-9Z"/><path d="M10 20v-5h4v5"/>',
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
    beauty: '<path d="M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-3.5 2-6 5-10Z"/>',
    travel: '<path d="M2.5 13.5 21 6l-4 13-5-4-3 4v-5l8-7"/>',
    other: '<path d="M3 12V4h8l10 10-7 7L3 12Z"/><circle cx="7.5" cy="8" r="1.3"/>',
    goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  };
  const KEYWORDS = [
    ['food', /food|grocer|eat|meal|lunch|dinner|restaurant|snack/],
    ['coffee', /coffee|cafe|chai|tea/],
    ['transport', /transport|uber|careem|fuel|petrol|gas|car|bus|ride|commute/],
    ['travel', /trip|holiday|vacation|flight|travel/],
    ['shopping', /shop|cloth|fashion|amazon|daraz/],
    ['entertainment', /entertain|fun|movie|cinema|game|music|stream|netflix|going out|party/],
    ['bills', /bill|rent|utilit|electric|internet|wifi|subscri/],
    ['phone', /phone|mobile|data|top ?up/],
    ['health', /health|gym|fitness|medic|doctor|pharm/],
    ['study', /study|school|uni|college|book|course|education|fee/],
    ['gift', /gift|charity|donat|zakat|sadqa/],
    ['beauty', /beauty|salon|hair|skin|makeup|self.?care/],
    ['home', /home|house|furniture/],
  ];
  function iconKey(name) {
    const n = name.toLowerCase();
    const hit = KEYWORDS.find(([, re]) => re.test(n));
    return hit ? hit[0] : 'other';
  }
  const svgIcon = (key, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
  const TINTS = ['t1', 't2', 't3', 't4', 't5', 't6'];
  const tintOf = (catId) => TINTS[Math.max(0, data.categories.findIndex((c) => c.id === catId)) % TINTS.length];
  const tile = (cat) => `<span class="tile ${tintOf(cat.id)}">${svgIcon(iconKey(cat.name))}</span>`;

  // ---------- Render ----------
  function render() {
    const t = today();
    $('#month').textContent = monthName(t);
    $('#storageBanner').hidden = persistent;
    const needSetup = !data.categories.length;
    $('#setup').hidden = !needSetup;
    $('#dash').hidden = needSetup;
    $('.dock').hidden = needSetup;
    if (needSetup) { renderSetup(); return; }

    const B = Calc.monthBudget(data, t);
    renderHero(B);
    renderPace(B);
    renderCategories(B);
    renderGoals(Calc.goals(data, t));
    renderChart(t);
    renderBadges(t);
    renderBackupNudge(t);
  }

  function renderHero(B) {
    const over = B.left < 0;
    const status = B.total <= 0 && B.spent <= 0 ? 'none' : B.status;
    const R = 84, C = 2 * Math.PI * R;
    const fill = Math.min(1, B.share);
    const label = over ? 'Over budget' : 'Left to spend';
    const big = money(B.left);
    const sizeCls = big.length > 11 ? 'xl' : big.length > 8 ? 'l' : '';
    $('#hero').innerHTML = `
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="ring-track" cx="100" cy="100" r="${R}"/>
          <circle class="ring-fill ring-${status}" cx="100" cy="100" r="${R}"
            stroke-dasharray="${C}" stroke-dashoffset="${C}" data-target="${C * (1 - fill)}"/>
          ${B.share > 1 ? `<circle class="ring-lap" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(1, B.share - 1))}"/>` : ''}
        </svg>
        <div class="ring-center">
          <span class="ring-pct">${pct(B.share)}</span>
          <span class="ring-sub">used</span>
        </div>
      </div>
      <div class="hero-text">
        <p class="hero-label">${label}</p>
        <p class="hero-num ${sizeCls} ${over ? 'neg' : ''}">${big}</p>
        <p class="hero-meta">${money(B.spent)} of ${money(B.total)}</p>
        ${over ? chip('over', `Over by ${money(-B.left)}`) : B.overCount ? chip('close', `${B.overCount} categor${B.overCount === 1 ? 'y' : 'ies'} over`) : chip(status)}
      </div>`;
    $('#hero').setAttribute('aria-label', `${label}: ${big}. Tap for details.`);
    requestAnimationFrame(() => {
      const f = $('#hero .ring-fill');
      if (f) f.style.strokeDashoffset = f.dataset.target + 'px';
    });
  }

  const PACE = {
    fast: { sym: '▲', word: 'Spending faster than the month' },
    even: { sym: '●', word: 'In step with the month' },
    slow: { sym: '▼', word: 'Spending slower than the month' },
    none: { sym: '–', word: 'No budget to compare' },
  };

  function renderPace(B) {
    const p = B.pace;
    $('#pace').innerHTML = `
      <div class="pace-head">
        <span class="pace-tag">Pace check</span>
        <span class="pace-day">Day ${p.day} of ${p.daysInMonth}</span>
      </div>
      <p class="pace-word pace-${p.state}"><span aria-hidden="true">${PACE[p.state].sym}</span> ${PACE[p.state].word}</p>
      <div class="pace-bar" aria-hidden="true">
        <div class="pace-spent pace-${p.state}" style="width:${Math.min(100, p.spendShare * 100)}%"></div>
        <div class="pace-marker" style="left:${p.monthShare * 100}%"><span>Today</span></div>
      </div>
      <div class="pace-legend"><span>Spent ${pct(p.spendShare)}</span><span>Month ${pct(p.monthShare)}</span></div>`;
  }

  function renderCategories(B) {
    $('#cats').innerHTML = B.categories.map((c) => {
      const over = c.left < 0;
      const w = Math.min(100, c.share * 100);
      const cat = data.categories.find((x) => x.id === c.id);
      return `
      <button class="card cat" data-cat="${c.id}" aria-label="${esc(c.name)}: ${over ? 'over by ' + money(-c.left) : money(c.left) + ' left'}. Tap to add spending.">
        <div class="cat-top">${tile(cat)}<span class="add-pill">${svgIcon('plus')} Add</span></div>
        <p class="cat-name">${esc(c.name)}</p>
        <p class="cat-num ${over ? 'neg' : ''}">${over ? money(-c.left) : money(c.left)}</p>
        <p class="cat-sub">${over ? 'over' : 'left'}</p>
        <div class="bar" aria-hidden="true"><div class="bar-fill bar-${c.status}" style="--w:${w}%"></div></div>
        <div class="cat-status">${chip(c.status)}</div>
      </button>`;
    }).join('');
  }

  function jar(share, done) {
    const level = Math.max(0, Math.min(1, share));
    const top = 30, bottom = 112;
    const y = bottom - (bottom - top) * level;
    const id = 'j' + Math.random().toString(36).slice(2, 8);
    return `
      <svg class="jar" viewBox="0 0 96 120" aria-hidden="true">
        <defs><clipPath id="${id}"><path d="M22 26h52v6c8 6 12 14 12 26v42a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14V58c0-12 4-20 12-26v-6Z"/></clipPath></defs>
        <g clip-path="url(#${id})">
          <rect class="jar-liquid ${done ? 'done' : ''}" x="0" y="${y}" width="96" height="${120 - y}"/>
          <path class="jar-wave ${done ? 'done' : ''}" d="M0 ${y} q12 -5 24 0 t24 0 t24 0 t24 0 v6 H0 Z"/>
        </g>
        <path class="jar-glass" d="M22 26h52v6c8 6 12 14 12 26v42a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14V58c0-12 4-20 12-26v-6Z"/>
        <rect class="jar-lid" x="18" y="14" width="60" height="12" rx="4"/>
      </svg>`;
  }

  function goalTag(g) {
    if (g.noTarget) return chip('none', 'No target');
    if (g.done) return chip('ok', 'Goal reached');
    if (g.deadlineState === 'passed') return chip('over', 'Deadline passed');
    return `<span class="chip chip-goal">${pct(g.share)} there</span>`;
  }

  function renderGoals(goals) {
    const addBtn = `<button class="card add-goal" id="addGoal">${svgIcon('plus')} ${goals.length ? 'Add another goal' : 'Saving for something? Add a goal'}</button>`;
    $('#goals').innerHTML = goals.map((g) => {
      const hint = g.done || g.noTarget ? '' : g.weeklyNeeded != null
        ? `<p class="goal-hint">${money(g.weeklyNeeded)} a week to finish by ${niceDate(g.deadline)}</p>`
        : g.deadlineState === 'none' ? `<p class="goal-hint">${money(g.remaining)} to go</p>` : '';
      return `
      <button class="card goal" data-goal="${g.id}" aria-label="${esc(g.name)}: ${money(g.saved)} saved of ${money(g.target)}. Tap to add savings.">
        ${jar(g.share, g.done)}
        <div class="goal-text">
          <p class="goal-name">${esc(g.name)}</p>
          <p class="goal-num">${money(g.saved)}</p>
          <p class="goal-of">of ${money(g.target)}</p>
          ${goalTag(g)}
          ${hint}
        </div>
        <span class="add-pill goal-add">${svgIcon('plus')} Add</span>
      </button>`;
    }).join('') + addBtn;
    $('#addGoal').addEventListener('click', () => goalForm(null));
  }

  function renderChart(t) {
    const hist = Calc.savingsOverTime(data.savings, t);
    const box = $('#chart');
    if (hist.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const W = 320, H = 150, padB = 24, padT = 22;
    const max = Math.max(...hist.map((h) => h.saved), 1);
    const slot = W / hist.length;
    const bw = Math.min(34, slot * 0.6);
    const last = hist[hist.length - 1], prev = hist[hist.length - 2];
    const change = last.saved - prev.saved;
    const bars = hist.map((h, i) => {
      const bh = Math.max(3, (H - padB - padT) * (h.saved / max));
      const x = i * slot + (slot - bw) / 2, y = H - padB - bh;
      const isLast = i === hist.length - 1;
      return `<rect class="cbar ${isLast ? 'last' : ''}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="7" style="--d:${i * 60}ms"><title>${niceDate(h.date)}: ${money(h.saved)}</title></rect>
        ${isLast ? `<text class="cval" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${money(h.saved)}</text>` : ''}
        <text class="clab" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${isLast ? 'Today' : niceDate(h.date).replace(/ \d{4}$/, '')}</text>`;
    }).join('');
    const dir = change > 0 ? 'up' : 'flat';
    box.innerHTML = `
      <div class="chart-head">
        <h3>Total saved, week by week</h3>
        <span class="delta delta-${dir}"><span aria-hidden="true">${dir === 'up' ? '▲' : '●'}</span> ${money(change, { plus: true })} this week</span>
      </div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Total saved each week. Now ${money(last.saved)}.">${bars}</svg>`;
  }

  function renderBadges(t) {
    const list = Badges.status(data, t);
    const n = list.filter((b) => b.earned).length;
    $('#badges').innerHTML = `
      <div class="badges-head"><h3>Badges</h3><span class="badge-count">${n} of ${list.length}</span></div>
      <div class="badge-row">${list.map((b) => `
        <span class="medal ${b.earned ? 'got' : 'locked'}">
          <span class="medal-face" aria-hidden="true">${b.earned ? b.emoji : '🔒'}</span>
          <span class="medal-name">${esc(b.name)}</span>
        </span>`).join('')}</div>`;
    $('#badges').setAttribute('aria-label', `Badges: ${n} of ${list.length} earned. Tap to see all.`);
  }

  function renderBackupNudge(t) {
    const count = data.entries.length + data.savings.length;
    const last = data.meta.lastBackup;
    const stale = !last || Calc.daysBetween(last, t) >= 30;
    $('#backupBanner').hidden = !(count >= 5 && stale);
  }

  // ---------- Budget form (first-time setup and Settings) ----------
  const DEFAULTS = ['Food', 'Transport', 'Shopping', 'Fun', 'Bills'];

  function budgetRows(cats) {
    return cats.map((c) => `
      <div class="brow" data-id="${c.id || ''}">
        <input class="bname" aria-label="Category name" value="${esc(c.name)}" placeholder="Name" maxlength="24">
        <div class="bamt"><span>${esc(curSymbol())}</span><input class="bval" inputmode="decimal" aria-label="Monthly budget for ${esc(c.name || 'this category')}" value="${c.budget ? c.budget : ''}" placeholder="0"></div>
        <button class="bdel" type="button" aria-label="Remove ${esc(c.name || 'this row')}">${svgIcon('trash')}</button>
      </div>`).join('');
  }

  function wireBudgetForm(root, onSave) {
    root.addEventListener('click', (e) => {
      const del = e.target.closest('.bdel');
      if (del) {
        const r = del.closest('.brow');
        const id = r.dataset.id;
        const used = id && data.entries.some((x) => x.catId === id && Calc.monthOf(x.date) === Calc.monthOf(today()));
        if (used && !confirm('This category has spending this month. Remove it anyway?')) return;
        r.remove();
      }
      if (e.target.closest('.badd')) {
        $('.blist', root).insertAdjacentHTML('beforeend', budgetRows([{ name: '', budget: 0 }]));
        const rows = root.querySelectorAll('.brow');
        $('.bname', rows[rows.length - 1]).focus();
      }
      if (e.target.closest('.bsave')) {
        const err = $('.form-err', root);
        const out = [];
        const names = new Set();
        for (const r of root.querySelectorAll('.brow')) {
          const name = $('.bname', r).value.trim();
          const raw = $('.bval', r).value.trim();
          if (!name && !raw) continue;
          if (!name) { err.textContent = 'Every row needs a name.'; $('.bname', r).focus(); return; }
          const amt = raw === '' ? 0 : readAmount(raw);
          if (!Number.isFinite(amt)) { err.textContent = `${name}: type a number, like 5000.`; $('.bval', r).focus(); return; }
          if (names.has(name.toLowerCase())) { err.textContent = `${name} is there twice.`; return; }
          names.add(name.toLowerCase());
          out.push({ id: r.dataset.id || Store.newId(), name, budget: amt });
        }
        if (!out.length) { err.textContent = 'Add at least one category.'; return; }
        if (!out.some((c) => c.budget > 0)) { err.textContent = 'Type a monthly amount for at least one.'; return; }
        const sel = $('.bcur', root);
        if (sel) data.currency = sel.value;
        onSave(out);
      }
    });
  }

  function currencySelect() {
    const list = ['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR', 'CAD', 'INR'];
    if (!list.includes(data.currency)) list.unshift(data.currency);
    return `<label class="cur-row">Money in <select class="bcur">${list.map((c) => `<option ${c === data.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>`;
  }

  function renderSetup() {
    const box = $('#setup');
    if (box.dataset.ready) return;
    box.dataset.ready = '1';
    box.innerHTML = `
      <div class="card setup-card">
        <p class="eyebrow">Welcome</p>
        <h2>How much can you spend each month?</h2>
        <p class="lead">Type an amount next to each one. Leave it empty if you don’t need it.</p>
        ${currencySelect()}
        <div class="blist">${budgetRows(DEFAULTS.map((name) => ({ name, budget: 0 })))}</div>
        <button class="btn-ghost badd" type="button">${svgIcon('plus')} Add a category</button>
        <p class="form-err" role="alert"></p>
        <button class="primary bsave" type="button">Start</button>
        <p class="fine">Your numbers stay on this phone. Nobody else can see them.</p>
      </div>`;
    wireBudgetForm(box, (cats) => {
      data.categories = cats;
      data.meta.setupDone = true;
      if (commit()) { delete box.dataset.ready; render(); window.scrollTo(0, 0); toast('All set. Tap a category when you spend.'); }
    });
  }

  // ---------- Sheets ----------
  const sheet = $('#sheet');
  function openSheet(html, focusSel) {
    $('#sheetBody').innerHTML = html;
    if (!sheet.open) {
      if (typeof sheet.showModal === 'function') sheet.showModal();
      else sheet.setAttribute('open', '');
    }
    sheet.scrollTop = 0;
    if (focusSel) { const f = $(focusSel, sheet); if (f) f.focus(); }
  }
  function closeSheet() {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  }
  const row = (k, v, cls = '') => `<div class="drow"><span>${k}</span><strong class="${cls}">${v}</strong></div>`;

  function amountBlock(label, btnLabel) {
    return `
      <label class="big-label" for="amt">${label}</label>
      <div class="amt-wrap"><span class="amt-cur">${esc(curSymbol())}</span><input id="amt" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" aria-describedby="amtErr"></div>
      <p class="form-err" id="amtErr" role="alert"></p>
      <label class="date-row">Date <input type="date" id="amtDate" value="${today()}" max="${today()}"></label>
      <button class="primary sheet-primary" id="amtGo">${btnLabel}</button>`;
  }

  function wireAmount(onAmount) {
    const go = () => {
      const v = readAmount($('#amt').value);
      const date = $('#amtDate').value || today();
      if (!Number.isFinite(v) || v <= 0) { $('#amtErr').textContent = 'Type an amount above 0.'; $('#amt').focus(); return; }
      if (date > today()) { $('#amtErr').textContent = 'The date can’t be in the future.'; return; }
      onAmount(v, date);
    };
    $('#amtGo').addEventListener('click', go);
    $('#amt').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  function entryList(items, kind) {
    if (!items.length) return '<p class="fine">Nothing yet.</p>';
    return `<ul class="entries">${items.map((x) => `
      <li><span class="e-date">${niceDate(x.date)}</span><strong>${money(x.amount)}</strong>
        <button class="e-del" data-del="${x.id}" data-kind="${kind}" aria-label="Delete ${money(x.amount)} on ${niceDate(x.date)}">${svgIcon('trash')}</button></li>`).join('')}</ul>`;
  }

  function wireDeletes(after) {
    sheet.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.kind === 'spend' ? 'entries' : 'savings';
      const i = data[key].findIndex((x) => x.id === b.dataset.del);
      if (i < 0) return;
      const [removed] = data[key].splice(i, 1);
      if (!commit()) return;
      render();
      after();
      toast(`Deleted ${money(removed.amount)}`, () => { data[key].push(removed); commit(); render(); if (sheet.open) after(); });
    }));
  }

  // Pick a category (from the big bottom button), then the amount.
  function pickCategory() {
    openSheet(`
      <h2>What was it for?</h2>
      <div class="pick-grid">${data.categories.map((c) => `<button class="pick" data-pick="${c.id}">${tile(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>`);
    sheet.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => spendSheet(b.dataset.pick)));
  }

  function spendSheet(catId) {
    const cat = data.categories.find((c) => c.id === catId);
    if (!cat) return;
    const c = Calc.monthBudget(data, today()).categories.find((x) => x.id === catId);
    const month = Calc.monthOf(today());
    const items = data.entries.filter((e) => e.catId === catId && Calc.monthOf(e.date) === month).sort((a, b) => (a.date < b.date ? 1 : -1));
    openSheet(`
      <h2>${tile(cat)} ${esc(cat.name)}</h2>
      <p class="sheet-sub">${c.left < 0 ? `<span class="neg">${money(-c.left)} over</span>` : `${money(c.left)} left`} of ${money(cat.budget)} this month</p>
      ${amountBlock('How much did you spend?', 'Add')}
      <h3>This month</h3>
      ${entryList(items, 'spend')}`, '#amt');
    wireAmount((amount, date) => {
      const entry = { id: Store.newId(), catId, amount, date };
      data.entries.push(entry);
      if (!commit()) return;
      closeSheet();
      render();
      toast(`Added ${money(amount)} to ${cat.name}`, () => {
        data.entries = data.entries.filter((x) => x.id !== entry.id);
        commit(); render();
      });
      checkBadges(false);
    });
    wireDeletes(() => spendSheet(catId));
  }

  function goalSheet(goalId) {
    const g = Calc.goals(data, today()).find((x) => x.id === goalId);
    if (!g) return;
    const items = data.savings.filter((s) => s.goalId === goalId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
    let plan = '';
    if (g.noTarget) plan = 'Add a target to track this goal.';
    else if (g.done) plan = `Goal reached! ${g.saved > g.target ? `You saved ${money(g.saved - g.target)} extra.` : ''}`;
    else if (g.deadlineState === 'future') plan = `Save about <strong>${money(g.weeklyNeeded)} a week</strong> to reach it by ${niceDate(g.deadline, true)}.`;
    else if (g.deadlineState === 'passed') plan = `The date (${niceDate(g.deadline, true)}) has passed. ${money(g.remaining)} still to go.`;
    openSheet(`
      <h2>${svgIcon('goal', 'ico ico-h')} ${esc(g.name)}</h2>
      <p class="sheet-sub">${money(g.saved)} of ${money(g.target)} · ${goalTag(g)}</p>
      ${amountBlock('How much did you save?', 'Add to savings')}
      ${plan ? `<p>${plan}</p>` : ''}
      <p class="fine">Only money you add here counts as savings. Money left in your budget doesn’t.</p>
      <h3>Added so far</h3>
      ${entryList(items, 'save')}
      <button class="btn-ghost" id="editGoal">Change this goal</button>`, '#amt');
    wireAmount((amount, date) => {
      const before = g.saved;
      const entry = { id: Store.newId(), goalId, amount, date };
      data.savings.push(entry);
      if (!commit()) return;
      closeSheet();
      render();
      const mark = Badges.milestoneCrossed(g.target, before, before + amount);
      const undo = () => { data.savings = data.savings.filter((x) => x.id !== entry.id); commit(); render(); };
      if (mark === 1) { celebrate(); toast(`🏆 You reached ${g.name}!`, undo); }
      else if (mark) { celebrate(); toast(`🎉 ${Math.round(mark * 100)}% of the way to ${g.name}!`, undo); }
      else toast(`Saved ${money(amount)} for ${g.name}`, undo);
      checkBadges(!!mark);
    });
    wireDeletes(() => goalSheet(goalId));
    $('#editGoal').addEventListener('click', () => goalForm(goalId));
  }

  function goalForm(goalId) {
    const g = goalId ? data.goals.find((x) => x.id === goalId) : { name: '', target: 0, deadline: null };
    openSheet(`
      <h2>${goalId ? 'Change goal' : 'New savings goal'}</h2>
      <label class="field">What are you saving for?<input id="gName" value="${esc(g.name)}" placeholder="e.g. New phone" maxlength="30"></label>
      <label class="field">How much do you need?<div class="amt-wrap small"><span class="amt-cur">${esc(curSymbol())}</span><input id="gTarget" inputmode="decimal" value="${g.target || ''}" placeholder="0"></div></label>
      <label class="field">By when? <span class="opt">(optional)</span><input type="date" id="gDate" value="${g.deadline || ''}"></label>
      <p class="form-err" id="gErr" role="alert"></p>
      <button class="primary sheet-primary" id="gSave">Save goal</button>
      ${goalId ? '<button class="btn-danger" id="gDel">Delete this goal</button>' : ''}`, '#gName');
    $('#gSave').addEventListener('click', () => {
      const name = $('#gName').value.trim();
      const target = readAmount($('#gTarget').value);
      const deadline = $('#gDate').value || null;
      if (!name) { $('#gErr').textContent = 'Give the goal a name.'; return; }
      if (!Number.isFinite(target) || target <= 0) { $('#gErr').textContent = 'Type how much you need, above 0.'; return; }
      if (goalId) Object.assign(g, { name, target, deadline });
      else data.goals.push({ id: Store.newId(), name, target, deadline });
      if (!commit()) return;
      closeSheet(); render();
      toast(goalId ? 'Goal updated' : `Goal added: ${name}`);
      checkBadges(false);
    });
    const del = $('#gDel');
    if (del) del.addEventListener('click', () => {
      if (!confirm(`Delete “${g.name}” and its savings history?`)) return;
      data.goals = data.goals.filter((x) => x.id !== goalId);
      data.savings = data.savings.filter((x) => x.goalId !== goalId);
      commit(); closeSheet(); render(); toast('Goal deleted');
    });
  }

  function heroDetail() {
    const t = today(), B = Calc.monthBudget(data, t), p = B.pace;
    const paceLine = p.state === 'none' ? 'No budget set, so there is no pace to check.'
      : `It is day ${p.day} of ${p.daysInMonth}, so ${pct(p.monthShare)} of the month has gone. You have used ${pct(p.spendShare)} of your budget. ` +
        (p.state === 'fast' ? `That is ${money(p.gap)} ahead of an even pace.` : p.state === 'slow' ? `That is ${money(-p.gap)} behind an even pace.` : 'That is about even.');
    const last = Calc.lastMonthSpent(data.entries, t);
    openSheet(`
      <h2>${monthName(t)}</h2>
      ${row('Budget', money(B.total))}
      ${row('Spent', money(B.spent))}
      ${row(B.left < 0 ? 'Over by' : 'Left', money(Math.abs(B.left)), B.left < 0 ? 'neg' : 'pos')}
      ${last ? row(`Spent in ${monthName(Calc.prevMonth(t) + '-01')}`, money(last)) : ''}
      <h3>Pace check</h3>
      <p>${paceLine}</p>
      <p class="fine">This compares spending to the days gone. It is not a prediction.</p>
      <p class="fine">Spending starts again at zero on the 1st of each month.</p>`);
  }

  function badgesDetail() {
    const list = Badges.status(data, today());
    openSheet(`
      <h2>Badges</h2>
      <ul class="badge-list">${list.map((b) => `
        <li class="${b.earned ? 'got' : 'locked'}"><span class="medal-face" aria-hidden="true">${b.earned ? b.emoji : '🔒'}</span>
          <div><strong>${esc(b.name)}</strong><span>${b.earned ? '✓ Earned' : esc(b.how)}</span></div></li>`).join('')}</ul>`);
  }

  function settingsSheet() {
    const last = data.meta.lastBackup;
    openSheet(`
      <h2>Settings</h2>
      <h3>Monthly budgets</h3>
      ${currencySelect()}
      <div class="blist">${budgetRows(data.categories)}</div>
      <button class="btn-ghost badd" type="button">${svgIcon('plus')} Add a category</button>
      <p class="form-err" role="alert"></p>
      <button class="primary sheet-primary bsave" type="button">Save budgets</button>

      <h3>Backup</h3>
      <p class="fine">Your numbers live only on this phone. Save a backup file now and then, and keep it in Files or email it to yourself.</p>
      <p class="fine">${last ? `Last backup: ${niceDate(last, true)}` : 'No backup yet.'}</p>
      <button class="btn-secondary" id="doBackup">Save a backup</button>
      <button class="btn-ghost" id="doRestore">Load a backup</button>
      <input type="file" id="restoreInput" accept=".json,application/json" hidden>

      <h3>Privacy</h3>
      <p class="fine">Nothing is sent anywhere. Nobody else can see your numbers. They don’t sync to your other devices, and clearing this browser’s data erases them.</p>
      <button class="btn-danger" id="wipe">Delete everything on this phone</button>`);
    wireBudgetForm($('#sheetBody'), (cats) => {
      data.categories = cats;
      if (commit()) { closeSheet(); render(); toast('Budgets saved'); }
    });
    $('#doBackup').addEventListener('click', backup);
    $('#doRestore').addEventListener('click', () => $('#restoreInput').click());
    $('#restoreInput').addEventListener('change', (e) => { restore(e.target.files[0]); e.target.value = ''; });
    $('#wipe').addEventListener('click', () => {
      if (!confirm('Delete all your numbers from this phone? This can’t be undone.')) return;
      if (!confirm('Are you sure? Save a backup first if you might need them.')) return;
      store.clear();
      data = Store.empty();
      data.meta.seenBadges = [];
      closeSheet(); render(); toast('Everything deleted');
    });
  }

  // ---------- Backup ----------
  async function backup() {
    const t = today();
    const prev = data.meta.lastBackup;
    data.meta.lastBackup = t;
    const f = Store.backupFile(data, t);
    const file = new File([f.body], f.name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Money backup' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      commit(); closeSheet(); render(); toast('Backup saved');
    } catch (e) {
      data.meta.lastBackup = prev;
      if (e && e.name === 'AbortError') return;
      toast('Couldn’t save the backup. Try again.');
    }
  }

  async function restore(file) {
    if (!file) return;
    let parsed = null;
    try { parsed = Store.validate(JSON.parse(await file.text())); } catch (e) { parsed = null; }
    if (!parsed) { toast('That isn’t a Money backup file.'); return; }
    if (!confirm('Replace everything on this phone with this backup?')) return;
    data = parsed;
    data.meta.seenBadges = Badges.status(data, today()).filter((b) => b.earned).map((b) => b.id);
    commit(); closeSheet(); render(); toast('Backup loaded');
  }

  // ---------- Game touches ----------
  function checkBadges(alreadyCelebrated) {
    const earned = Badges.status(data, today()).filter((b) => b.earned);
    const fresh = earned.filter((b) => !data.meta.seenBadges.includes(b.id));
    data.meta.seenBadges = earned.map((b) => b.id);
    commit();
    if (!fresh.length) return;
    setTimeout(() => {
      celebrate();
      toast(`${fresh[0].emoji} New badge: ${fresh[0].name}`);
    }, alreadyCelebrated ? 3200 : 1800);
  }

  function celebrate() {
    if (reduceMotion) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    box.setAttribute('aria-hidden', 'true');
    const colors = ['#6A4CF0', '#4BE3A0', '#FFC15C', '#FF7A6B', '#5AAAFF', '#FF6EB4'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.4 + 's';
      p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      p.style.setProperty('--x', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }

  // ---------- Toast with optional Undo ----------
  let toastTimer;
  function toast(msg, undo) {
    const t = $('#toast');
    const host = sheet.open ? sheet : document.body; // stay above an open sheet
    if (t.parentNode !== host) host.appendChild(t);
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="toast-undo">Undo</button>' : ''}`;
    t.classList.add('show');
    if (undo) $('.toast-undo', t).addEventListener('click', () => { undo(); t.classList.remove('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 3000);
  }

  // ---------- Wire up ----------
  $('#addBtn').addEventListener('click', pickCategory);
  $('#hero').addEventListener('click', heroDetail);
  $('#pace').addEventListener('click', heroDetail);
  $('#badges').addEventListener('click', badgesDetail);
  $('#settingsBtn').addEventListener('click', settingsSheet);
  $('#backupBanner').addEventListener('click', backup);
  $('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) spendSheet(b.dataset.cat); });
  $('#goals').addEventListener('click', (e) => { const b = e.target.closest('[data-goal]'); if (b) goalSheet(b.dataset.goal); });
  $('#sheetClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // A new day or month while the app sat open in the background.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  // Badges already earned (e.g. after an update) don't pop up as new.
  if (!data.meta.seenBadges.length && data.categories.length) {
    data.meta.seenBadges = Badges.status(data, today()).filter((b) => b.earned).map((b) => b.id);
  }

  render();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
