# NewBuild Kollektiv — Website (Projekt-Kontext für Claude Code)

> Letzte Aktualisierung: 2026-07-31

Diese Datei liegt im Repo selbst (nicht nur im Second-Brain-Vault), damit jeder — egal auf welchem Rechner das Repo geklont wird — sofort den vollen Kontext hat.

## Was das hier ist

Statische Website (Vite + TypeScript, kein Framework) für NewBuild Kollektiv, ein Networking-/Event-Kollektiv für Architekten. Eigenständiges Projekt, unabhängig von AN(N) Architecture Solution.

## Hosting & Deployment

- **Host:** Cloudflare Pages, Projekt `newbuild-kollektiv-website`
- **Domain:** `newbuild-kollektiv.com` (Full Setup über Cloudflare-Nameserver, DNS liegt bei GoDaddy-Account "Ann-Kathrin Salich", Kundennummer 611976493 — nicht mit dem AN(N)-GoDaddy-Account verwechseln)
- **GitHub-Repo:** [annsalich96/newbuild-kollektiv-website](https://github.com/annsalich96/newbuild-kollektiv-website) (Branch `main`)
- **Deploy-Trigger:** Jeder Push auf `main` → Cloudflare Pages baut automatisch (`npm run build` → `dist/`)
- **Workflow-Regel für dieses Repo:** Nach jedem Commit sofort `git push origin main`, ohne nachzufragen — Repo arbeitet direkt auf `main`, kein Branch-Workflow.

## CMS: Pages CMS

Content-Pflege läuft über [Pages CMS](https://app.pagescms.org) — Login per GitHub-OAuth über den Account `annsalich96`, kein eigenes Passwort/Backend. Pages CMS editiert die Dateien in `src/content/*.json` direkt im GitHub-Repo; jede Änderung dort löst automatisch ein neues Cloudflare-Deployment aus.

**Workflow-Aufteilung:**

- **Kleinigkeiten** (Texte, Bilder, neue Events/Team-Mitglieder/Sponsoren) → Ann macht das selbst über Pages CMS, kein Code nötig.
- **Größere Layout-/Struktur-Änderungen** (neue Sektionen, Design-Anpassungen, neue Felder) → über Claude Code / direkt im Code.

**Steuerdatei:** `.pages.yml` (Repo-Root) definiert, welche Felder Pages CMS pro Content-Typ anzeigt (Events, Team, Sponsoring, Mission/About, Impressum, Datenschutz, Widerrufsrecht, Footer).

> [!warning] .pages.yml wird NICHT automatisch aus dem Code generiert
> Wenn im Code ein Feld in `src/content/*.json` (bzw. dem zugehörigen TS-Typ) hinzugefügt, umbenannt oder entfernt wird, muss `.pages.yml` **manuell** nachgezogen werden — sonst zeigt Pages CMS das Feld gar nicht an oder das CMS schreibt in ein Feld, das der Code nicht mehr kennt. Es gibt keinen Auto-Sync zwischen JSON-Struktur/TS-Typen und `.pages.yml`.
>
> Der Build-Schritt `node scripts/check-cms-schema.mjs` (läuft automatisch vor jedem `npm run build`, siehe `package.json`) prüft nur, ob die in `.pages.yml` als `required` markierten Felder in den JSON-Dateien tatsächlich befüllt sind — er generiert `.pages.yml` nicht neu und merkt nicht, wenn dort ein Feld fehlt, das im Code längst existiert. Bei jeder Content-Struktur-Änderung im Code also **immer auch `.pages.yml` von Hand anpassen**.
>
> Optionale Felder (`required: false`) im TS-Typ immer als `feld?: string` typisieren — lässt Ann ein optionales Feld im CMS leer, schreibt Pages CMS den Key gar nicht erst in die JSON. Ohne `?` bricht dann `tsc` beim nächsten Build (ist am 2026-07-30 bei Team → `image` genau so passiert).

## Event-Anmeldeseiten (automatisch generiert)

Jedes Event bekommt beim Build automatisch eine eigene Unterseite unter `events/<slug>/index.html` (z.B. `events/session-01-.../`) — dafür gibt es **keinen eigenen Pages-CMS-Eintrag**, die Seiten entstehen aus denselben Daten wie der "Events"-Bereich in Pages CMS.

- `scripts/generate-event-pages.mjs` liest `src/content/events.json`, füllt `scripts/event-page.template.html` pro Event aus und schreibt das Ergebnis nach `events/<slug>/index.html`. Läuft automatisch bei jedem `vite dev`/`vite build` (aufgerufen aus `vite.config.ts`) — der `events/`-Ordner wird nicht eingecheckt (siehe `.gitignore`), entsteht immer frisch.
- Neues Event-Feld `introLabel` (Standard: `"Mission"`) ist das Eyebrow-Label über dem Titel — **kein Session-Nummer-Feld**, sondern frei editierbar über Pages CMS (Ann kann daraus z.B. auch "Session 01" machen, wenn gewünscht).
- Grid-Positionen der Event-Seite (Spalten/Balken) sind in `04-projects/newbuild-kollektiv-website/design files/Anmeldeseite_Spaltensystem.pdf` vorgegeben und am 2026-07-31 direkt aus den PDF-Koordinaten (nicht per Augenmaß) ausgemessen worden — Element-Tabelle mit den exakten Werten steht in [`docs/anmeldeseite-grid-tabelle.md`](./docs/anmeldeseite-grid-tabelle.md).
- Registrierungsformular (`src/event-form.ts`) sendet an Google Apps Script, siehe nächster Abschnitt.

## Geteilte Bausteine (Nav, Footer, Sponsoren-Leiste)

Nav-Leiste, Fußzeile und Sponsoren-Laufband sind **global identisch** auf Startseite, allen Event-Seiten und allen rechtlichen Seiten — als eigene TS-Module ausgelagert, damit die Logik nicht mehrfach existiert:

- `src/nav.ts` — Sticky-Nav-Verhalten + Mobile-Menü-Toggle
- `src/sponsors-marquee.ts` — rendert die Sponsoren-Laufband-Liste aus `src/content/sponsors.json`
- `src/footer.ts` — rendert Adresse/Telefon/E-Mail + die drei rechtlichen Link-Texte aus `src/content/footer.json` (global editierbar über Pages CMS, wirkt auf **alle** Seiten gleichzeitig)
- `src/legal-pages.ts` — rendert Impressum/Datenschutz/Widerrufsrecht-Inhalte aus den jeweiligen `src/content/*.json`

Jeder HTML-Entry-Point (`index.html`, `scripts/event-page.template.html`, `impressum.html`, `datenschutzerklaerung.html`, `widerrufsrecht.html`) bindet je nach Bedarf `src/main.ts`, `src/event-form.ts` oder `src/legal-pages.ts` ein — diese importieren wiederum die geteilten Module. Footer-Felder haben zusätzlich einen fest im HTML stehenden Fallback-Text (nicht nur leer + JS-befüllt), damit die Fußzeile nie komplett leer erscheint, falls JavaScript mal verzögert lädt.

## Google Apps Script: Event-Anmeldungen

`google-apps-script/Code.gs` (liegt in diesem Repo, siehe `google-apps-script/README.md` für die Einrichtung) läuft als Web-App unter dem Google-Account **"newbuild kollektiv"** (Alias `request@newbuild-kollektiv.com`). Nimmt Anmeldungen vom Event-Formular entgegen, trägt sie automatisch in Google Sheets ein und verschickt eine Bestätigungsmail.

> [!warning] Code.gs im Repo ist nur eine Kopie
> Der tatsächlich laufende Code liegt im Google-Apps-Script-Editor selbst (im Google-Account "newbuild kollektiv") — das hier im Repo ist die Referenzkopie. Nach jeder Änderung an dieser Datei muss der Code manuell in den Apps-Script-Editor kopiert und dort neu bereitgestellt werden (siehe unten), es gibt keine automatische Synchronisation.

- Das Frontend-Formular (`src/event-form.ts`) sendet an die Web-App-URL (endet auf `/exec`) mit `Content-Type: text/plain` statt `application/json` — bewusst so, weil Apps-Script-Web-Apps den CORS-Preflight nicht beantworten, den JSON auslöst (das Skript liest den Body trotzdem als JSON).
- **Ordnerstruktur in Google Drive:** Hauptordner "NewBuild Kollektiv — Event-Anmeldungen" → darin Unterordner **"Events"** (ein Sheet pro Event) und die Datei **"History Anmeldungen"** (alle Personen, die sich je angemeldet haben, dedupliziert per E-Mail-Adresse — bei erneuter Anmeldung wird nur "Letztes Event"/Zähler aktualisiert statt einer neuen Zeile).
- **Wichtig:** Bei jeder Code-Änderung an `Code.gs` im Apps-Script-Editor muss erneut **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Neue Version → Bereitstellen** gemacht werden — sonst läuft die Web-App weiter mit der alten Version.
- Noch nicht gebaut: automatisierte Erinnerungs-E-Mail vor dem Event-Datum.

## Struktur

```
index.html                        Startseite
impressum.html, datenschutz...    Rechtliche Seiten (statisch, Inhalte per JS aus content/*.json)
scripts/event-page.template.html  Vorlage für Event-Anmeldeseiten
scripts/generate-event-pages.mjs  Erzeugt events/<slug>/index.html aus events.json (nicht eingecheckt)
scripts/check-cms-schema.mjs      Build-Vorcheck: Pflichtfelder aus .pages.yml vollständig?
src/main.ts                       App-Logik Startseite
src/event-form.ts                 Anmeldeformular → Google Apps Script
src/legal-pages.ts                Rendert Impressum/Datenschutz/Widerrufsrecht
src/nav.ts                        Geteilte Sticky-Nav-Logik
src/footer.ts                     Geteilte, global editierbare Fußzeile
src/sponsors-marquee.ts           Geteiltes Sponsoren-Laufband
src/content/*.json                CMS-gepflegte Inhalte (siehe .pages.yml)
src/styles/tokens.css             Design-System: Grid, Spacing, Typografie, Farben
.pages.yml                        Pages-CMS-Schema (manuell pflegen, siehe oben)
google-apps-script/                Code.gs (Referenzkopie) + Setup-Anleitung
docs/                              Grid-Tabelle, Anmeldesystem-Anforderungen
```

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Lokaler Dev-Server mit Hot Reload |
| `npm run build` | Schema-Check + Produktions-Build nach `dist/` |
| `npm run preview` | Lokale Vorschau des Builds |

## Weitere Dokumentation (in diesem Repo)

- `docs/grid-tabelle.md` — Spalten-/Balkensystem und Element-Positionen aus den Referenz-PDFs (Homepage)
- `docs/anmeldeseite-grid-tabelle.md` — Element-Tabelle der Event-Anmeldeseite (aus `Anmeldeseite_Spaltensystem.pdf`)
- `docs/event-anmeldesystem-anforderungen.md` — Anforderungen ans Anmeldesystem, Umsetzungsstand
- `google-apps-script/README.md` — Setup-Anleitung für Code.gs (Bereitstellung im Apps-Script-Editor)

Die großen Referenz-PDFs (Grid-Vorlagen, teils 150MB+) sind bewusst **nicht** im Git-Repo (Repo-Größe, GitHub-Limits) — die Werte daraus stecken schon in `docs/grid-tabelle.md` und im Code. Bei Bedarf über das gemeinsame Google-Drive-Backup teilen.
