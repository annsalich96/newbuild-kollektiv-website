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

## Update 2026-08-26: Benachrichtigungsmail bei neuer Anmeldung

`Code.gs` verschickt jetzt zusätzlich zur Bestätigungsmail an die anmeldende Person eine Benachrichtigungsmail an `request@newbuild-kollektiv.com` (Konstante `NOTIFY_EMAIL`), sobald sich jemand für ein Event einträgt (`sendAdminNotificationEmail`, aufgerufen in `doPost`).

Damit das live geht: den aktualisierten Inhalt von `Code.gs` im Apps-Script-Editor (script.google.com, eingeloggt als `newbuild kollektiv`-Account) einfügen und wie oben beschrieben neu bereitstellen (**Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version → Bereitstellen**).

## Update 2026-08-26: Alle Anmeldungen pro Event in einem Mail-Thread

Alle Benachrichtigungsmails zu einem Event landen jetzt in einem einzigen Gmail-Thread (Antwort statt neue Mail), damit sich Anmeldungen nicht in vielen Einzelmails verteilen. Dafür braucht das Skript jetzt `GmailApp.search()`, also einen größeren Berechtigungs-Scope als vorher (nicht mehr nur "E-Mails senden", sondern auch Mails lesen/durchsuchen). Beim nächsten Deploy erscheint deshalb voraussichtlich noch einmal die Google-Berechtigungsabfrage — normal bestätigen (ggf. wieder über "Erweitert" → "Zu [Projektname] (unsicher) wechseln", falls die Warnung erscheint).

## Update 2026-08-30: Slug-basierte Tabellen · Erinnerungsmails · Signatur

Drei Änderungen an `Code.gs`:

### 1. Event-Tabelle wird über den Slug gefunden, nicht mehr über den Titel

Bisher hieß die Tabelle `"Session 01 — <Titel>"` und wurde über diesen Namen gesucht. Sobald der Titel im CMS geändert wurde, fand das Skript die alte Tabelle nicht mehr und legte eine **zweite** an. Jetzt merkt sich das Skript pro `eventSlug` die Datei-ID (in den Skript-Eigenschaften). Der Titel darf sich beliebig ändern — die Datei wird dann nur **umbenannt**, nie neu angelegt. Bestehende Tabellen werden beim nächsten Eingang automatisch übernommen (Fallback über den bisherigen Namen). Das Formular schickt `eventSlug` bereits mit — keine Website-Änderung nötig.

### 2. Automatische Erinnerungs-E-Mails

Neue Funktion `sendeErinnerungen()` + stündlicher Zeit-Trigger. Verschickt pro Anmeldung:

| Stufe | Zeitpunkt | Status-Spalte in der Tabelle |
| --- | --- | --- |
| 1 Woche vorher | Tag `Event−7`, ab 9 Uhr | `Erinnerung 1 Woche` |
| 1 Tag vorher | Tag `Event−1`, ab 9 Uhr | `Erinnerung 1 Tag` |
| ~3 Stunden vorher | Eventtag, < 3 h bis Beginn | `Erinnerung 3 Std` |
| 1 Tag danach (Nachfass) | Tag `Event+1`, ab 9 Uhr | `Nachfass E-Mail` |

Die vier Status-Spalten legt das Skript in jeder Event-Tabelle bei Bedarf selbst an. Eine Mail geht nie doppelt raus (Spalte bekommt einen Zeitstempel, sobald verschickt). Datum/Zeit/Ort zieht das Skript aus den Spalten `Event-Datum` / `Event-Zeit` / `Event-Ort`, die bei jeder Anmeldung ohnehin gefüllt werden. `Status`-Werte mit „abgemeldet" / „storniert" / „abgesagt" werden übersprungen.

**Nach dem Deploy einmalig:** im Editor die Funktion **`erinnerungenTriggerEinrichten`** auswählen → **Ausführen** → Berechtigungen bestätigen. Damit läuft der stündliche Trigger. Kontrolle: **Trigger**-Menü (Wecker-Symbol links) — dort steht dann `sendeErinnerungen`, „Zeitgesteuert", „Stundentimer".

Projekt-Zeitzone muss auf **Europe/Berlin** stehen (Projekteinstellungen → Zahnrad), sonst rechnet die Tages-Logik daneben.

Sendelimit beachten: Consumer-Gmail 100 Mails/Tag, Workspace 1500/Tag. Bei sehr großen Events kann eine Stufe über mehrere stündliche Läufe verteilt rausgehen — das Skript macht beim nächsten Lauf automatisch weiter.

### 3. Signatur unter jeder Teilnehmer-Mail

Konstanten `SIGNATUR_HTML` (HTML) und `SIGNATUR_TEXT` (Text-Fallback) ganz oben in `Code.gs`. Wird automatisch unter Bestätigungsmail **und** alle Erinnerungen gehängt. Nur dort anpassen. Logo nur als `<img src="https://…">` mit öffentlicher URL möglich, kein Datei-Anhang.

### Offen

Geschlechtsspezifische Anrede („Liebe/Lieber" statt „Hallo") — braucht ein Anrede-Feld im Anmeldeformular (`src/event-form.ts` + Template + `events.json` + `.pages.yml`). Noch nicht umgesetzt.

### Deploy

`Code.gs` komplett in den Editor kopieren → **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version → Bereitstellen**. Beim ersten Lauf fragt Google nach zusätzlichen Berechtigungen (Trigger anlegen, Tabellen schreiben) — bestätigen.
