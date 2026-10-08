// Badges are worked out from the numbers each time. Nothing is ever taken away for a missed day.
(function (root) {
  'use strict';
  const { Calc } = root;

  const LIST = [
    { id: 'first', emoji: '✏️', name: 'First step', how: 'Add your first spending.' },
    { id: 'saver', emoji: '🐷', name: 'Saver', how: 'Put money into a savings goal.' },
    { id: 'tracker', emoji: '📅', name: 'Tracker', how: 'Add spending on 7 different days.' },
    { id: 'halfway', emoji: '🌗', name: 'Halfway', how: 'Reach half of a savings goal.' },
    { id: 'goal', emoji: '🏆', name: 'Goal reached', how: 'Finish a savings goal.' },
    { id: 'month', emoji: '🛡️', name: 'Under budget', how: 'Finish a month without going over your total budget.' },
  ];

  function underBudgetMonth(data, todayISO) {
    const total = data.categories.reduce((t, c) => t + c.budget, 0);
    if (total <= 0) return false;
    const thisMonth = Calc.monthOf(todayISO);
    const byMonth = {};
    for (const e of data.entries) {
      const m = Calc.monthOf(e.date);
      if (m < thisMonth) byMonth[m] = (byMonth[m] || 0) + e.amount;
    }
    return Object.values(byMonth).some((spent) => spent <= total);
  }

  function status(data, todayISO) {
    const goals = Calc.goals(data, todayISO);
    const days = new Set(data.entries.map((e) => e.date)).size;
    const got = {
      first: data.entries.length > 0,
      saver: data.savings.length > 0,
      tracker: days >= 7,
      halfway: goals.some((g) => !g.noTarget && g.share >= 0.5),
      goal: goals.some((g) => g.done),
      month: underBudgetMonth(data, todayISO),
    };
    return LIST.map((b) => ({ ...b, earned: !!got[b.id] }));
  }

  // Savings milestones crossed between two amounts: 25%, 50%, 75%, 100%.
  function milestoneCrossed(target, before, after) {
    if (target <= 0) return null;
    const marks = [1, 0.75, 0.5, 0.25];
    return marks.find((m) => before / target < m && after / target >= m) || null;
  }

  root.Badges = { LIST, status, milestoneCrossed };
})(typeof self !== 'undefined' ? self : this);
