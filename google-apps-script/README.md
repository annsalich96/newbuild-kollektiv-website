# Setup: Google Apps Script für die Event-Anmeldungen

> Letzte Aktualisierung: 2026-07-30

Kein Passwort nötig — du machst das kurz selbst über den Browser mit dem `newbuild kollektiv`-Google-Account, ich habe den Code schon fertig geschrieben.

## Schritt 1: "Senden als"-Alias einrichten (nur falls nötig)

Falls `request@newbuild-kollektiv.com` nicht die Haupt-Login-Adresse des Google-Accounts ist, sondern ein Alias:

1. In Gmail (eingeloggt als `newbuild kollektiv`-Account) → Zahnrad → **Alle Einstellungen ansehen**
2. Tab **Konten und Import** → Abschnitt "E-Mails senden als" → **Weitere E-Mail-Adresse hinzufügen**
3. `request@newbuild-kollektiv.com` eintragen, den Bestätigungsschritten folgen

Falls `request@newbuild-kollektiv.com` bereits die Haupt-Adresse des Accounts ist, diesen Schritt überspringen.

## Schritt 2: Apps-Script-Projekt anlegen

1. Im Browser, eingeloggt als `newbuild kollektiv`-Account: **script.google.com** öffnen
2. **Neues Projekt** klicken
3. Den vorhandenen Beispiel-Code im Editor komplett löschen
4. Den kompletten Inhalt der Datei `Code.gs` (liegt neben dieser Anleitung) einfügen
5. Oben links auf das Projekt klicken und umbenennen, z. B. "NewBuild Kollektiv — Event-Anmeldungen"
6. Speichern (Strg+S)

## Schritt 3: Als Web-App veröffentlichen

1. Oben rechts auf **Bereitstellen** → **Neue Bereitstellung**
2. Bei "Typ auswählen" (Zahnrad-Symbol) → **Web-App**
3. Einstellungen:
   - Ausführen als: **Ich** (dein Account)
   - Zugriff: **Jeder** (das Formular muss ohne eigenen Google-Login senden können)
4. **Bereitstellen** klicken
5. Google fragt nach Berechtigungen (Zugriff auf Drive/Gmail) — bestätigen. Falls eine Warnung "Diese App wurde nicht überprüft" erscheint: **Erweitert** → **Zu [Projektname] (unsicher) wechseln** — das ist normal bei eigenen, nicht veröffentlichten Skripten, keine Sorge.
6. Es erscheint eine **Web-App-URL** (endet auf `/exec`) — **diese URL brauche ich von dir zurück**, um sie im Formular einzutragen.

## Danach

Sobald ich die URL habe, trage ich sie im Code ein und mache einen Testlauf (eine echte Test-Anmeldung), um zu prüfen, ob:

- eine Google-Sheets-Datei im Ordner "NewBuild Kollektiv — Event-Anmeldungen" (in Google Drive) entsteht
- die Anmeldung dort korrekt eingetragen wird
- die Bestätigungsmail ankommt

## Falls du später den Code änderst

Bei jeder Code-Änderung im Skript-Editor muss erneut **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift-Symbol) → Neue Version → Bereitstellen** gemacht werden, sonst nutzt die Web-App weiter die alte Version.
