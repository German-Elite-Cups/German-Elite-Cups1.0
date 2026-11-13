# GEC Platform – v6 Free Agents, Co. Manager & Marktwert

## Neu
- Free-Agent-Bereich mit eigenem Profil:
  - Name / EA-Name
  - Alter
  - 1 Hauptposition Pflicht
  - bis zu 3 Nebenpositionen optional
  - persönlicher Bewerbungstext
- Free Agents können sich selbst bei genehmigten Teams bewerben.
- Vereinsmanager und Co. Manager können Free Agents Transferangebote mit persönlichem Text senden.
- Free-Agent-Bewerbungen erscheinen im Team-Bereich und können angenommen/abgelehnt werden. Bei Annahme wird dem Spieler ein Transferangebot geschickt; der Spieler entscheidet final.
- Vereinsmanager kann einen bestehenden GEC-Account als Co. Manager hinzufügen oder entfernen.
- Marktwert pro Spieler:
  - automatisch aus Toren, Vorlagen und Torwart-„Zu Null“ berechnet
  - Standardformel: Tore × 100.000 € + Vorlagen × 75.000 € + Zu Null × 125.000 €
  - Staff kann einen manuellen Notfall-Marktwert setzen
  - leeres manuelles Feld setzt wieder auf automatische Berechnung
  - Staff kann Match-Scorer weiterhin löschen; der automatische Marktwert wird danach neu berechnet.

## Account-Modell
Ein Benutzer hat einen einzigen GEC-Account und kann gleichzeitig Spieler und Staff sein. Staff-Rollen sind `admin`, `management` oder `owner` und erweitern denselben Spieleraccount.

## Start
```bash
npm install
npm start
```
Dann `http://localhost:3000` öffnen.

Für Produktion sollten insbesondere `SESSION_SECRET`, HTTPS, Backup/DB und Hosting-Konfiguration angepasst werden.


## GEC v9 Design
Dark but colorful esports visual system: anthracite backgrounds, lighter cards,
GEC red, gold/yellow accents, white typography, responsive multi-column grids,
subtle gradients and glow. The site avoids an all-black or all-white appearance.
