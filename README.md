# GEC Platform v25

## Neu in v25
- Cup-Anzeige mit festem Team-/Wappen-Layout, kein Überlaufen der Wappen.
- Separater Button „Turnierbaum öffnen“ mit horizontalem K.-o.-Baum.
- Cup-Erstellung: direktes K.-o. oder Gruppenphase + K.-o.; Gruppengröße 3 oder 4.
- Zufällige Auslosung per serverseitigem Shuffle; Gruppen werden ebenfalls zufällig verteilt.
- Gruppenphase mit Rundenspielen und öffentlicher Tabelle; danach Staff-Button für K.-o.-Auslosung.
- Vereinsmanager kann Teamdaten bearbeiten und den Kader registrieren/verwalten.
- Kaderaufnahme ist nur für bereits registrierte GEC-Spieler möglich; ein Spieler kann nur einem Team angehören.
- Öffentliche Teamseite mit Kader, Toren, Vorlagen, Zu-Null und automatisch berechnetem Marktwert.
- Staff kann Match-Stats pro Spieler eintragen: Tore, Vorlagen und „Zu Null“ nur für TW.
- Free-Agent-Bereich für Manager/Co-Manager erweitert: Bewerbungen sichtbar und annehmbar/ablehnbar; Angebote bleiben im bestehenden Transferfluss.
- Persistente Datenbank /data bleibt erhalten; keine Startup-Resets oder Drops.

## Railway
- GEC_DATA_DIR=/data
- GEC_DB=/data/gec.sqlite
- GEC_UPLOAD_DIR=/data/uploads
- Stable SESSION_SECRET setzen.
- Bestehendes Railway Volume nicht löschen.
