// Draws the dashboard and handles the Excel upload. Everything stays in this browser.
(function () {
  'use strict';
  const { Calc, Parse, Store, XLSX } = window;
  const $ = (s) => document.querySelector(s);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const { storage, persistent } = Store.browserStorage();
  const store = Store.create(storage);
  if (persistent && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Pretend data, shown until the first upload ----------
  function sampleSnapshots() {
    const today = new Date();
    const iso = (offsetDays) => Calc.toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetDays));
    const base = (date, saved, spentScale) => ({
      date,
      currency: 'PKR',
      budget: [
        { name: 'Food', budget: 15000, spent: Math.round(9800 * spentScale) },
        { name: 'Transport', budget: 6000, spent: Math.round(3900 * spentScale) },
        { name: 'Shopping', budget: 8000, spent: Math.round(8600 * spentScale) },
        { name: 'Entertainment', budget: 5000, spent: Math.round(4300 * spentScale) },
        { name: 'Bills', budget: 12000, spent: Math.round(11000 * spentScale) },
      ],
      goals: [
        { name: 'New laptop', target: 150000, saved: saved[0], deadline: `${today.getFullYear() + 1}-03-31` },
        { name: 'Emergency fund', target: 50000, saved: saved[1], deadline: null },
      ],
    });
    const list = [
      base(iso(28), [38000, 41000], 0.3),
      base(iso(21), [44000, 44000], 0.5),
      base(iso(14), [51000, 47000], 0.7),
      base(iso(7), [55000, 50000], 0.85),
      base(iso(0), [62000, 50000], 1),
    ];
    const all = {};
    list.forEach((s) => (all[s.date] = s));
    return { all, current: list[list.length - 1] };
  }

  // ---------- Formatting ----------
  function money(n, cur, opts = {}) {
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
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
  function niceDate(iso, withYear) {
    const d = Calc.parseISO(iso);
    const showYear = withYear || d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined });
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  };
  const KEYWORDS = [
    ['food', /food|grocer|eat|meal|lunch|dinner|restaurant|snack/],
    ['coffee', /coffee|cafe|chai|tea/],
    ['transport', /transport|travel to|uber|careem|fuel|petrol|gas|car|bus|ride|commute/],
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

  // ---------- State ----------
  let state = load();
  function load() {
    const current = store.current();
    if (current) return { sample: false, current, all: store.all() };
    const s = sampleSnapshots();
    return { sample: true, current: s.current, all: s.all };
  }

  // ---------- Render ----------
  function render() {
    const snap = state.current;
    const cur = snap.currency;
    const B = Calc.budgetSummary(snap);
    const S = Calc.savingsSummary(snap);

    $('#asof').textContent = `As of ${niceDate(snap.date)}`;
    $('#sampleBanner').hidden = !state.sample;
    $('#storageBanner').hidden = persistent;

    renderHero(B, cur);
    renderPace(B, cur);
    renderCategories(B, cur);
    renderGoals(S, cur);
    renderChart(cur);
  }

  function renderHero(B, cur) {
    const over = B.left < 0;
    const status = B.total <= 0 && B.spent <= 0 ? 'none' : B.status;
    const R = 84, C = 2 * Math.PI * R;
    const fill = Math.min(1, B.share);
    const label = over ? 'Over budget' : 'Left to spend';
    const big = money(B.left, cur);
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
        <p class="hero-num ${sizeCls} ${over ? 'neg' : ''}" data-count="${B.left}">${big}</p>
        <p class="hero-meta">${money(B.spent, cur)} of ${money(B.total, cur)}</p>
        ${over ? chip('over', `Over by ${money(-B.left, cur)}`) : B.overCount ? chip('close', `${B.overCount} categor${B.overCount === 1 ? 'y' : 'ies'} over`) : chip(status)}
      </div>`;
    $('#hero').setAttribute('aria-label', `${label}: ${big}. Tap for details.`);
    requestAnimationFrame(() => {
      const f = $('#hero .ring-fill');
      if (f) f.style.strokeDashoffset = f.dataset.target + 'px';
    });
    countUp($('#hero .hero-num'), B.left, cur);
  }

  function countUp(el, to, cur) {
    if (!el || reduceMotion) return;
    const start = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(Math.round(to * e), cur);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = money(to, cur);
    };
    requestAnimationFrame(step);
  }

  const PACE = {
    fast: { sym: '▲', word: 'Spending faster than the month' },
    even: { sym: '●', word: 'In step with the month' },
    slow: { sym: '▼', word: 'Spending slower than the month' },
    none: { sym: '–', word: 'No budget to compare' },
  };

  function renderPace(B, cur) {
    const p = B.pace;
    const spendW = Math.min(100, p.spendShare * 100);
    $('#pace').innerHTML = `
      <div class="pace-head">
        <span class="pace-tag">Pace check</span>
        <span class="pace-day">Day ${p.day} of ${p.daysInMonth}</span>
      </div>
      <p class="pace-word pace-${p.state}"><span aria-hidden="true">${PACE[p.state].sym}</span> ${PACE[p.state].word}</p>
      <div class="pace-bar" aria-hidden="true">
        <div class="pace-spent pace-${p.state}" style="width:${spendW}%"></div>
        <div class="pace-marker" style="left:${p.monthShare * 100}%"><span>Today</span></div>
      </div>
      <div class="pace-legend"><span>Spent ${pct(p.spendShare)}</span><span>Month ${pct(p.monthShare)}</span></div>`;
  }

  function renderCategories(B, cur) {
    $('#cats').innerHTML = B.categories.map((c, i) => {
      const over = c.left < 0;
      const w = Math.min(100, c.share * 100);
      return `
      <button class="card cat" data-cat="${i}" aria-label="${esc(c.name)}: ${over ? 'over by ' + money(-c.left, cur) : money(c.left, cur) + ' left'}. Tap for details.">
        <span class="tile ${TINTS[i % TINTS.length]}">${svgIcon(iconKey(c.name))}</span>
        <p class="cat-name">${esc(c.name)}</p>
        <p class="cat-num ${over ? 'neg' : ''}">${over ? money(-c.left, cur) : money(c.left, cur)}</p>
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
          <rect class="jar-liquid ${done ? 'done' : ''}" x="0" y="${y}" width="96" height="${120 - y}" style="--y:${y}px"/>
          <path class="jar-wave ${done ? 'done' : ''}" d="M0 ${y} q12 -5 24 0 t24 0 t24 0 t24 0 v6 H0 Z"/>
        </g>
        <path class="jar-glass" d="M22 26h52v6c8 6 12 14 12 26v42a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14V58c0-12 4-20 12-26v-6Z"/>
        <rect class="jar-lid" x="18" y="14" width="60" height="12" rx="4"/>
      </svg>`;
  }

  function renderGoals(S, cur) {
    if (!S.goals.length) {
      $('#goals').innerHTML = `<div class="card empty">${svgIcon('goal')}<p>Add a goal in the Savings sheet.</p></div>`;
      return;
    }
    $('#goals').innerHTML = S.goals.map((g, i) => {
      let tag;
      if (g.noTarget) tag = chip('none', 'No target');
      else if (g.done) tag = chip('ok', 'Goal reached');
      else if (g.deadlineState === 'passed') tag = chip('over', 'Deadline passed');
      else tag = `<span class="chip chip-goal">${pct(g.share)} there</span>`;
      const hint = g.done || g.noTarget ? '' : g.weeklyNeeded != null
        ? `<p class="goal-hint">${money(g.weeklyNeeded, cur)} a week to finish by ${niceDate(g.deadline)}</p>`
        : g.deadlineState === 'none' ? `<p class="goal-hint">${money(g.remaining, cur)} to go</p>` : '';
      return `
      <button class="card goal" data-goal="${i}" aria-label="${esc(g.name)}: ${money(g.saved, cur)} saved of ${money(g.target, cur)}. Tap for details.">
        ${jar(g.share, g.done)}
        <div class="goal-text">
          <p class="goal-name">${esc(g.name)}</p>
          <p class="goal-num">${money(g.saved, cur)}</p>
          <p class="goal-of">of ${money(g.target, cur)}</p>
          ${tag}
          ${hint}
        </div>
      </button>`;
    }).join('');
  }

  function renderChart(cur) {
    const hist = Calc.savingsHistory(state.all).slice(-8);
    const box = $('#chart');
    if (hist.length < 2) {
      box.innerHTML = `<div class="chart-empty">${svgIcon('info')}<span>Your savings chart shows up after your 2nd weekly update.</span></div>`;
      return;
    }
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
      return `<rect class="cbar ${isLast ? 'last' : ''}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="7" style="--d:${i * 60}ms"><title>${niceDate(h.date)}: ${money(h.saved, cur)}</title></rect>
        ${isLast ? `<text class="cval" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${money(h.saved, cur)}</text>` : ''}
        <text class="clab" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${niceDate(h.date).replace(/ \d{4}$/, '')}</text>`;
    }).join('');
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const sym = { up: '▲', down: '▼', flat: '●' }[dir];
    box.innerHTML = `
      <div class="chart-head">
        <h3>Total saved</h3>
        <span class="delta delta-${dir}"><span aria-hidden="true">${sym}</span> ${money(change, cur, { plus: true })} since ${niceDate(prev.date)}</span>
      </div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Total saved at each update. Latest ${money(last.saved, cur)}.">${bars}</svg>`;
  }

  // ---------- Detail sheets ----------
  const sheet = $('#sheet');
  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
  }
  function closeSheet() {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  }
  const row = (k, v, cls = '') => `<div class="drow"><span>${k}</span><strong class="${cls}">${v}</strong></div>`;

  function heroDetail() {
    const snap = state.current, cur = snap.currency, B = Calc.budgetSummary(snap), p = B.pace;
    const paceLine = p.state === 'none' ? 'No budget set, so there is no pace to check.'
      : `It is day ${p.day} of ${p.daysInMonth}, so ${pct(p.monthShare)} of the month has gone. You have used ${pct(p.spendShare)} of your budget. ` +
        (p.state === 'fast' ? `That is ${money(p.gap, cur)} ahead of an even pace.` : p.state === 'slow' ? `That is ${money(-p.gap, cur)} behind an even pace.` : 'That is about even.');
    openSheet(`
      <h2>This month</h2>
      ${row('Budget', money(B.total, cur))}
      ${row('Spent', money(B.spent, cur))}
      ${row(B.left < 0 ? 'Over by' : 'Left', money(Math.abs(B.left), cur), B.left < 0 ? 'neg' : 'pos')}
      ${row('Used', pct(B.share))}
      <h3>Pace check</h3>
      <p>${paceLine}</p>
      <p class="fine">This compares spending to the days gone. It is not a prediction.</p>
      <p class="fine">Money left here is not counted as savings.</p>`);
  }

  function catDetail(i) {
    const snap = state.current, cur = snap.currency, c = Calc.budgetSummary(snap).categories[i];
    const note = c.status === 'none' ? 'No budget set for this one.'
      : c.budget <= 0 ? `No budget set, and ${money(c.spent, cur)} spent.`
      : c.left < 0 ? `You spent ${money(-c.left, cur)} more than planned.`
      : c.status === 'close' ? `Only ${money(c.left, cur)} left here.` : `${money(c.left, cur)} still free to spend.`;
    openSheet(`
      <h2><span class="tile ${TINTS[i % TINTS.length]}">${svgIcon(iconKey(c.name))}</span> ${esc(c.name)}</h2>
      ${row('Budget', money(c.budget, cur))}
      ${row('Spent', money(c.spent, cur))}
      ${row(c.left < 0 ? 'Over by' : 'Left', money(Math.abs(c.left), cur), c.left < 0 ? 'neg' : 'pos')}
      ${row('Used', c.budget > 0 ? pct(c.share) : '—')}
      <p>${chip(c.status)} ${note}</p>`);
  }

  function goalDetail(i) {
    const snap = state.current, cur = snap.currency, g = Calc.savingsSummary(snap).goals[i];
    let plan;
    if (g.noTarget) plan = 'Add a Target Amount to track this goal.';
    else if (g.done) plan = `Goal reached. You saved ${money(g.saved - g.target, cur)} extra.`;
    else if (g.deadlineState === 'future') plan = `Save about <strong>${money(g.weeklyNeeded, cur)} a week</strong> for the next ${Math.ceil(g.weeksLeft)} week${Math.ceil(g.weeksLeft) === 1 ? '' : 's'} to reach it by ${niceDate(g.deadline, true)}.`;
    else if (g.deadlineState === 'passed') plan = `The deadline (${niceDate(g.deadline, true)}) has passed. ${money(g.remaining, cur)} still to go. Set a new date in the sheet.`;
    else plan = 'No deadline set. Add one to see how much to save each week.';
    openSheet(`
      <h2>${svgIcon('goal', 'ico ico-h')} ${esc(g.name)}</h2>
      ${row('Target', money(g.target, cur))}
      ${row('Saved', money(g.saved, cur), 'pos')}
      ${row('Still to go', money(g.remaining, cur))}
      ${row('Progress', g.noTarget ? '—' : pct(g.share))}
      ${g.deadline ? row('Deadline', niceDate(g.deadline, true)) : ''}
      <p>${plan}</p>
      <p class="fine">Only the Amount Saved in your sheet counts. Money left in your budget is not added.</p>`);
  }

  function infoDetail() {
    const dates = Object.keys(store.all()).sort().reverse();
    openSheet(`
      <h2>How it works</h2>
      <ol class="steps">
        <li>Download the template once.</li>
        <li>Each week, update the numbers and the Snapshot Date.</li>
        <li>Tap <strong>Update from Excel</strong> and pick the file.</li>
      </ol>
      <a class="btn-secondary" href="template/Budget-Template.xlsx" download>${svgIcon('download')} Download template</a>
      <h3>Your data</h3>
      <p>Your file is read on this device. Nothing is sent anywhere.</p>
      <p class="fine">Data stays in this browser only. It does not sync to your other devices, and it is lost if you clear this browser's data. Keep your Excel file as the backup.</p>
      <p class="fine">Change currency in the template's Currency cell (for example PKR, USD, AED).</p>
      <h3>Saved updates</h3>
      ${dates.length ? `<ul class="hist">${dates.map((d) => `<li>${niceDate(d, true)}</li>`).join('')}</ul>
        <button class="btn-danger" id="clearAll">Delete all data on this device</button>` : '<p class="fine">None yet. You are looking at sample data.</p>'}`);
    const c = $('#clearAll');
    if (c) c.addEventListener('click', () => {
      if (!confirm('Delete every saved update from this device? This can’t be undone.')) return;
      store.clear();
      state = load();
      closeSheet();
      render();
      toast('All data deleted');
    });
  }

  function errorDetail(errors) {
    const shown = errors.slice(0, 6);
    openSheet(`
      <h2 class="err-title"><span aria-hidden="true">✕</span> This file needs a fix</h2>
      <ul class="errs">${shown.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      ${errors.length > shown.length ? `<p class="fine">…and ${errors.length - shown.length} more.</p>` : ''}
      <p class="fine">Nothing was changed. Fix the file and try again.</p>`);
  }

  // ---------- Upload ----------
  async function handleFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      errorDetail([`“${file.name}” isn’t an .xlsx file. Save it as Excel Workbook (.xlsx).`]);
      return;
    }
    let wb;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array', cellDates: false });
    } catch (e) {
      errorDetail(['Couldn’t open this file. Save it again as .xlsx and retry.']);
      return;
    }
    const res = Parse.parseWorkbook(wb);
    if (!res.ok) { errorDetail(res.errors); return; }
    let saved;
    try {
      saved = store.save(res.snapshot);
    } catch (e) {
      errorDetail(['Couldn’t save on this device. Storage may be full or blocked.']);
      return;
    }
    state = load();
    render();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    toast(saved.replaced ? `Replaced your ${niceDate(res.snapshot.date)} update` : `Updated · ${niceDate(res.snapshot.date)}`);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Wire up ----------
  $('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('#hero').addEventListener('click', heroDetail);
  $('#pace').addEventListener('click', heroDetail);
  $('#infoBtn').addEventListener('click', infoDetail);
  $('#sampleBanner').addEventListener('click', infoDetail);
  $('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) catDetail(+b.dataset.cat); });
  $('#goals').addEventListener('click', (e) => { const b = e.target.closest('[data-goal]'); if (b) goalDetail(+b.dataset.goal); });
  $('#sheetClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  render();

  // Offline support after the first load (only when served over http/https).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
