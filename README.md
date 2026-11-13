# GEC Platform – v14

## Updates
- X/close button for editor modals fixed (`closeEditor()` is now defined).
- ESC closes normal modals, editor modals and the Staff Center.
- Express sessions now use a persistent SQLite session store (`gec-sessions.sqlite`) instead of the default in-memory store.
- Session lifetime is 30 days.
- Existing `GEC_DB` directory is reused for the session database so a Railway persistent volume keeps login sessions across deploy/restart.
- `SESSION_SECRET` should be set as a stable Railway environment variable.

## Railway
Keep the existing Railway volume/database. Do not delete or recreate the GEC database volume when deploying this version.
Set a stable `SESSION_SECRET` in Railway Variables. If `GEC_DB` points to a persistent volume, the session database is stored alongside it by default.
