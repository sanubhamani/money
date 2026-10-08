# Money — budget and savings app

A phone and iPad app that reads a weekly Excel file and shows how the month is going.
Everything stays on the device. No login, no server, no tracking.

## Each week

1. Open `template/Budget-Template.xlsx` (or download it from the ⓘ button in the app).
2. Update **Spent So Far**, **Amount Saved** and the **Snapshot Date**.
3. In the app, tap **Update from Excel** and pick the file.

Uploading the same date again replaces that week. It never adds to old totals.
Change the currency in the template's Currency cell (PKR, USD, AED…).

## Run it on this Mac

```bash
cd "$HOME/Documents/Obsidian Vault/1-Projects/2026-Active/Budget-App" && python3 -m http.server 8765
```

Then open http://localhost:8765. Open http://localhost:8765/tests.html to re-run the 41 maths and file checks.

## Publish on GitHub Pages (not done yet — waiting for a go-ahead)

1. Make a new GitHub repository, for example `money`.
2. Upload everything in this folder to it (the `tools` folder is optional).
3. In the repository: Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
4. After a minute the app is live at `https://<username>.github.io/money/`.
5. On iPhone or iPad: open that link in Safari → Share → **Add to Home Screen**.

After the first visit it also works offline.

## Good to know

- Data lives in that one browser. It does not sync between phone and iPad, and clearing browser data erases it. The Excel file is the backup.
- The Excel file is read inside the browser. Nothing is uploaded anywhere.
- To change the template, edit `tools/make_template.py` and run `python3 tools/make_template.py`.
