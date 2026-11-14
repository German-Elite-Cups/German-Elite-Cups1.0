# GEC Platform v17 – Railway Build Fix

## Fix
- Removed `connect-sqlite3`, which can fail during `npm install` on Railway/modern Node runtimes.
- Added a persistent SQLite session store implemented with the already-installed `better-sqlite3`.
- Sessions remain valid for 30 days and survive app restarts/deploys as long as the same Railway database/volume is kept.
- Keep a stable `SESSION_SECRET` Railway variable.

## Deploy
Push/replace these files in the GitHub repository and let Railway redeploy.
Do not delete the existing Railway database/volume.
