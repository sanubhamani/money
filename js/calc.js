// All the money maths. Pure functions, no DOM, so tests.html can check them.
(function (root) {
  'use strict';

  const CLOSE_AT = 0.85; // a category is "close" once 85% is used

  function sum(list, key) {
    return list.reduce((t, x) => t + (Number.isFinite(x[key]) ? x[key] : 0), 0);
  }

  function parseISO(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toISO(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function daysBetween(fromISO, toISOStr) {
    const a = parseISO(fromISO), b = parseISO(toISOStr);
    return Math.round((b - a) / 86400000);
  }

  function daysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  // ok | close | over | none (no budget and nothing spent)
  function categoryStatus(budget, spent) {
    if (budget <= 0) return spent > 0 ? 'over' : 'none';
    const r = spent / budget;
    if (r > 1) return 'over';
    if (r >= CLOSE_AT) return 'close';
    return 'ok';
  }

  // Share used, for bars and rings. Capped at 1 for drawing; raw value kept separately.
  function share(part, whole) {
    if (whole <= 0) return part > 0 ? 1 : 0;
    return Math.max(0, part / whole);
  }

  // Spending pace vs how much of the month has gone. A pace check, not a prediction.
  function pace(totalBudget, totalSpent, dateISO) {
    const d = parseISO(dateISO);
    const dim = daysInMonth(d);
    const day = d.getDate();
    const monthShare = day / dim;
    if (totalBudget <= 0) {
      return { state: 'none', day, daysInMonth: dim, monthShare, spendShare: share(totalSpent, totalBudget), expected: 0, gap: 0 };
    }
    const spendShare = totalSpent / totalBudget;
    const expected = totalBudget * monthShare;
    const gap = totalSpent - expected; // + means ahead of pace
    // Within 5 points of the month counts as "even".
    let state = 'even';
    if (spendShare - monthShare > 0.05) state = 'fast';
    else if (monthShare - spendShare > 0.05) state = 'slow';
    return { state, day, daysInMonth: dim, monthShare, spendShare, expected, gap };
  }

  function budgetSummary(snap) {
    const categories = snap.budget.map((c) => ({
      name: c.name,
      budget: c.budget,
      spent: c.spent,
      left: c.budget - c.spent,
      share: share(c.spent, c.budget),
      status: categoryStatus(c.budget, c.spent),
    }));
    const total = sum(snap.budget, 'budget');
    const spent = sum(snap.budget, 'spent');
    const left = total - spent;
    return {
      categories,
      total,
      spent,
      left,
      share: share(spent, total),
      status: categoryStatus(total, spent),
      overCount: categories.filter((c) => c.status === 'over').length,
      pace: pace(total, spent, snap.date),
    };
  }

  // One savings goal. Budget money left over is never added here.
  function goalSummary(goal, dateISO) {
    const target = goal.target;
    const saved = goal.saved;
    const out = {
      name: goal.name,
      target,
      saved,
      deadline: goal.deadline || null,
      remaining: Math.max(0, target - saved),
      share: target > 0 ? Math.max(0, saved / target) : 0,
      done: false,
      noTarget: target <= 0,
      daysLeft: null,
      weeksLeft: null,
      weeklyNeeded: null,
      deadlineState: 'none', // none | future | passed | done
    };
    if (out.noTarget) return out;
    out.done = saved >= target;
    if (!out.deadline) {
      out.deadlineState = out.done ? 'done' : 'none';
      return out;
    }
    out.daysLeft = daysBetween(dateISO, out.deadline);
    if (out.done) out.deadlineState = 'done';
    else if (out.daysLeft <= 0) out.deadlineState = 'passed';
    else {
      out.deadlineState = 'future';
      out.weeksLeft = out.daysLeft / 7;
      // Under a week to go: the whole gap is needed this week.
      out.weeklyNeeded = out.remaining / Math.max(1, out.weeksLeft);
    }
    return out;
  }

  function savingsSummary(snap) {
    const goals = snap.goals.map((g) => goalSummary(g, snap.date));
    return {
      goals,
      target: sum(snap.goals, 'target'),
      saved: sum(snap.goals, 'saved'),
    };
  }

  // Total saved at each snapshot, oldest first. Each snapshot stands alone; nothing is added up across uploads.
  function savingsHistory(snapshots) {
    return Object.values(snapshots)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => ({ date: s.date, saved: sum(s.goals, 'saved'), spent: sum(s.budget, 'spent') }));
  }

  const api = { CLOSE_AT, parseISO, toISO, daysBetween, categoryStatus, share, pace, budgetSummary, goalSummary, savingsSummary, savingsHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
