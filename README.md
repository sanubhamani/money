# Money — budget and savings app

A phone and iPad app for a monthly budget and savings goals. You type what you spend; it shows what's left.
Everything stays on the phone. No login, no server, no tracking, no Excel.

Live: https://sanubhamani.github.io/money/ (public repo: github.com/sanubhamani/money)
On iPhone or iPad: open the link in Safari → Share → **Add to Home Screen**.

## How it works for the person using it

1. First open: type a monthly amount for each category, tap **Start**.
2. When they spend: tap the category (or **Add spending**), type the amount, tap **Add**. Every add has **Undo**.
3. Savings: tap a goal, type what they put away.
4. On the 1st of each month spending starts again at zero. Budgets stay. Savings keep adding up.
5. **Settings**: change budgets, currency, goals; **Save a backup** / **Load a backup**; delete everything.

Badges and confetti reward first entries, saving, tracking on 7 days, halfway, goal reached, and a month under budget.
Nothing is ever taken away for a missed day.

## Good to know

- Numbers live only in that phone's browser. Other people who open the link see an empty app, never your numbers.
- Clearing browser data, deleting the app, or a new phone erases them. The backup file is the safety net; the app nudges after 30 days without one.
- Safari may clear data for sites not opened for several weeks. Adding to the Home Screen helps.

## Run it on this Mac

```bash
cd "$HOME/Documents/Obsidian Vault/1-Projects/2026-Active/Budget-App" && python3 -m http.server 8765
```

Then open http://localhost:8765. Open http://localhost:8765/tests.html to re-run the 37 maths, saving and badge checks.

## Publishing a change

This folder is the master copy. Copy the changed files into a clone of the repo and push; the site updates in about a minute.
If you add or remove a file, update the list in `sw.js` and bump its version so offline copies refresh.

History: 2026-10-09 first version read weekly Excel uploads. Same day, replaced with typing-only plus badges so anyone, including older relatives, can use it.
