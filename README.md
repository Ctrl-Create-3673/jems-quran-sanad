# Quran Sanad Update 1447/48

Jamali English Medium School, Dholka. Teachers record each student's Quran Sanad level; everything is saved in the **Sanad Entry** Google Sheet.

- **Frontend:** this repo, served by GitHub Pages (`index.html`, `css/`, `js/`).
- **Backend:** `apps-script/Code.gs`, an Apps Script web app bound to the Sanad Entry sheet.

Until `js/config.js` has an API URL, the site runs in **demo mode** with sample data kept in the browser (Teacher ID `T001`, admin password `demo`).

## Connect it to the sheet (one time)

1. Open the **Sanad Entry** sheet → Extensions → Apps Script.
2. Replace the contents of `Code.gs` with `apps-script/Code.gs` from this repo. Delete the old `Index.html` file if you no longer need the old page.
3. Project Settings (gear icon) → **Script Properties** → Add `ADMIN_PASSWORD` with your admin password.
4. In the editor, choose `setupSheets` and click **Run** (approve the permissions). Then run `selfCheck` and read the log.
5. Deploy → **New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy. Copy the URL ending in `/exec`.
6. Paste it into `js/config.js` as `API_URL`, commit and push. The live site switches from demo mode to the real sheet.

After changing `Code.gs` later, use Deploy → **Manage deployments** → edit → **New version**, so the `/exec` URL stays the same.

## How data is saved

`Quran Sanad Records` keeps one row per student per Hijri year. Saving a student again updates that row (level, date, remarks, **Last Updated**, **Updated By**) instead of adding a duplicate. Columns A–K are in the original order, so existing pivot tables keep working. Every login, save, edit and delete is written to `Audit Log`.

## Security notes

- The admin password lives in Script Properties, never in this repo.
- Every action except login needs a session token (6 hours). Student details are not readable without logging in.
- Teacher login uses the Teacher ID only, so treat Teacher IDs like passwords.
