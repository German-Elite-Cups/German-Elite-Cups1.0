# GERMAN ELITE CUPS – Version 13

## Staff: vollständige Spielerverwaltung

Der Staff-Bereich kann Spieler jetzt vollständig bearbeiten:
- EA-Name / Accountname ändern
- Passwort zurücksetzen
- Account aktiv/sperren
- Alter, Größe, Gewicht und Bio ändern
- Hauptposition und bis zu 3 Nebenpositionen bearbeiten
- Team und Trikotnummer verwalten
- Spieler aus einem Team entfernen
- Free-Agent-Status und Free-Agent-Daten verwalten
- manuellen Marktwert und Marktwert-Notiz setzen oder wieder auf automatisch stellen
- vorhandene Match-Statistiken direkt im Spielereditor bearbeiten oder löschen

Die Rollenverwaltung bleibt separat: Rollen werden weiterhin nur über das Rollen-Management geändert.

## Railway

Den Inhalt dieses Pakets in das bestehende GitHub-Repository laden und committen. Railway deployt den neuen Commit automatisch.

Die bestehende Railway-Datenbank / das Volume **nicht löschen**. Die Version enthält Migrationen, damit die neuen Profilfelder in einer vorhandenen SQLite-Datenbank nachgerüstet werden.
