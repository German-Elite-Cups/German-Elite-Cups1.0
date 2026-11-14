# GEC Platform v20 – Persistent data and safe updates

## Daten bleiben bei Updates erhalten
- Der Server führt **keine DROP/DELETE/RESET-Operationen beim Start** aus.
- Tabellen werden mit `CREATE TABLE IF NOT EXISTS` angelegt. Bestehende Daten bleiben erhalten.
- Neue Felder werden ausschließlich per additive Migration (`ALTER TABLE ... ADD COLUMN`) ergänzt.
- Die Datenbank wird vor dem Start der Anwendung in `backups/` gesichert (bis zu 10 Backups).
- Sessions bleiben in derselben Datenbank erhalten.

## Railway – einmalig wichtig
Für echte Persistenz über Deployments muss ein Railway Volume verwendet werden. Empfohlen:
- Volume Mount Path: `/data`
- Variable `GEC_DATA_DIR=/data`
- Variable `GEC_DB=/data/gec.sqlite`
- Variable `GEC_UPLOAD_DIR=/data/uploads`
- Variable `SESSION_SECRET` dauerhaft setzen und bei Updates **nicht ändern**.

Wenn diese Variablen gesetzt sind, liegen Datenbank, Spieler/Teams/Stats und hochgeladene Wappen außerhalb des wechselnden App-Deployments. Beim Update wird nur der Code ersetzt; die Daten bleiben im Volume.

## Wichtig
Das Railway Volume nicht löschen. Auch `gec.sqlite` nicht manuell löschen.
