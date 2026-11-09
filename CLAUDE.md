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
- **Galerie nach dem Event** (seit 2026-11-02): CMS-Feld `gallery` (Liste von Bildpfaden). Ab dem Tag nach dem Event (Prüfung im Browser, `src/event-date.ts`, gleiche Logik wie „View Past“) ersetzt sie das Formular (`src/event-gallery.ts`); ohne Fotos bleibt das Formular, mit `?checkin=1` ebenfalls. Fotos: 20–25 aus `Photos` des Events (Originale ohne Wasserzeichen, Ann 02.11.) (Drive „NewBuild Kollektiv/Events/<Event>/“) auswählen und mit `python3 scripts/galerie-bilder.py <slug> <fotos…>` verkleinern → `public/galerie/<slug>/`, trägt `gallery` in events.json ein.

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
- Event-Tabelle wird über den **Slug** (`eventSlug`) gefunden, nicht über den Titel — Titeländerung im CMS legt keine zweite Tabelle mehr an (Slug→Datei-ID in den Script-Properties gemerkt).
- **Automatische Erinnerungs-E-Mails** (`sendeErinnerungen`, stündlicher Trigger): 1 Woche / 1 Tag / ~3 h vorher + 1 Tag danach. Je Stufe eine Status-Spalte in der Event-Tabelle, keine Doppelversände. Trigger einmalig per `erinnerungenTriggerEinrichten` im Editor anlegen. Details in `google-apps-script/README.md` (Update 2026-08-30).
- **Eventkarten in den Mails (automatisch):** Der Build erzeugt für jedes Event in `events.json` eine Karte im Codex-Stil der Session-01-Grafik unter `/mail/<slug>-karte.png`, Übersicht aller Karten unter `https://newbuild-kollektiv.com/mail/` (`scripts/generate-mail-cards.mjs`, satori + resvg, Schrift TeX Gyre Heros in `scripts/fonts/`). Code.gs nimmt sie per Namenskonvention (`automatischeKarte_`); ein Eintrag in `GRAFIKEN` ist nur für eigens gestaltete Grafiken nötig (Session 01). Bei langen Texten verkleinert der Generator Schrift/Abstände automatisch. **Zwei Varianten pro Event:** `<slug>-karte.png` (Button GOOGLE MAPS → Bestätigung + Erinnerungen, Vortag mit ICS) und `<slug>-karte-anmeldung.png` (Button ANMELDUNG → Einladungs-/Teaser-Mails, Klick führt zur Eventseite).
- **Eventfarbe:** Feld `color` (Hex, optional) pro Event in Pages CMS. `scripts/event-farbe.mjs` leitet daraus die Töne ab für den Verlauf der Eventseite (`--event-farbe` am `.event-hero`) und die Mail-Karte (Schrift schaltet bei dunklen Farben automatisch auf Weiß). Leer = NewBuild-Orange mit exakt den Originaltönen.
- **Termin-Quelle für Erinnerungen = Pages CMS** (seit 2026-09-29): Der Build veröffentlicht `src/content/events.json` unter `https://newbuild-kollektiv.com/events.json` (Plugin in `vite.config.ts`). `sendeErinnerungen` liest Datum/Zeit/Ort/Titel/Referent von dort, nicht aus den Anmeldezeilen (die veralten bei Terminänderungen — Session 03 bekam deshalb am 29.09. die Wochen-Erinnerung zum alten 06.10.). Ist events.json nicht erreichbar oder passt kein Event zur Tabelle, wird nichts verschickt. Zuordnung Tabelle→Event: Slug-Spalte, sonst Session-Nummer im Tabellennamen — URL-Kürzel-Änderungen im CMS legen daher keine zweite Tabelle mehr an.
- **Mail-Kontingent** (seit 2026-09-30): Rundmails über die Mail-Schnittstelle laufen über dasselbe Konto request@ und verbrauchen dasselbe Gmail-Tageskontingent. Ist es leer, wird die Anmeldung trotzdem gespeichert und als erfolgreich gemeldet; die Bestätigung bekommt in der Spalte „Bestätigung" den Wert `offen` und wird von `sendeErinnerungen` nachgeholt. Erneute Anmeldung mit derselben E-Mail aktualisiert die bestehende Zeile statt eine Dublette anzulegen; Erinnerungen gehen je E-Mail nur einmal raus.
- **Kalenderdatei (.ics)** hängt seit 2026-10-08 auch an der Anmeldebestätigung (nicht mehr nur an der „1 Tag vorher“-Mail). UID ist pro Event fest (`<slug>@newbuild-kollektiv.com`), SEQUENCE = Zeitstempel — eine spätere .ics aktualisiert denselben Kalendereintrag statt einen zweiten anzulegen.
- **Signatur** unter allen Teilnehmer-Mails: Konstanten `SIGNATUR_HTML` / `SIGNATUR_TEXT` oben in `Code.gs`.
- **Newsletter-Anmeldung mit Prüfung** (seit 2026-11-02): Seite `/newsletter/` (`newsletter/index.html`, `src/newsletter-form.ts`) → Code.gs `newsletterAnmelden_` → Tabelle „Newsletter-Anfragen“ (General) + Eingangsmail mit Bestätigungslink (Double-Opt-in, `NEWSLETTER_DOI`) → nach Bestätigung Prüf-Mail an `NEWSLETTER_PRUEFER` mit Aufnehmen/Ablehnen (Links über `/f/?do=nlbestaetigen|nlfreigabe&t=…`) → Aufnehmen: Zusage-Mail (BCC Ann) + Eintrag in „History Anmeldungen“ (Newsletter = Ja, Spalten Quelle/Berufsstand/Profil). Ablehnen: keine Mail.
- **Mehrere Speaker** (seit 2026-11-02): CMS-Liste `speakers` (name/role/company/bio/image) pro Event; ab 2 Einträgen wird der Speaker-Bereich zum Slider (gleiches Karussell `src/carousel.ts`). Ohne Liste gelten die Einzelfelder `speakerName` usw. – die bleiben auch für Mails/Karten maßgeblich. Fotos als `public/speaker-<name>.jpg`, Hochformat 3:4.
- **Speaker-Galerie Startseite** (seit 2026-11-09): das Karussell unter „Mission“ zeigt zuerst `team.json`, danach automatisch alle Speaker aller Events (Liste `speakers`, sonst Einzelfelder `speakerName`/`speakerCompany`/`speakerImage`), dedupliziert per Name (`src/main.ts`), alle Fotos dort schwarz-weiß (CSS-Filter, Originale bleiben farbig). Neue Speaker also nur im Event pflegen, nicht zusätzlich im Team. Feld `url` (bzw. `speakerUrl`) = Website des Unternehmens: Klick aufs Foto öffnet sie in neuem Tab. Karussell (`src/carousel.ts`) startet Maus-Ziehen erst ab 5px, damit Klicks durchgehen.
- **Typo-System** (seit 2026-11-09, angelehnt an eine Inspo von Ann): 1 Schrift (Helvetica Neue; ohne sie – Windows/Android – selbst gehostete Inter Tight 300/400 via `@fontsource/inter-tight` statt Arial), 2 Stärken (Light für große Texte und alle Lesetexte in 28, Regular für Labels/Versalien, Navigation, Buttons und kleine Zwischentitel wie „Session 01“/Programmpunkte), 5 Größen bei 1920px: 54 (Statements/Eventtitel, Zeilenabstand 70) / 36 (Next-Event-Titel) / 28 (Fließtext) / 20 (Labels und Navigation in Versalien, Namen, Footer) / 16 (Nebeninfos, Button-Schrift). Alles in `src/styles/tokens.css`; keine neuen Größen/Stärken einführen. Buttons: Form/Größe unverändert, Versalien. Alle Linien (Buttons, Kästen, Trenner) 1,5px, Mobile 1px. Alle Texte voll weiß (kein gedämpftes Weiß mehr), keine Text-Schatten. Footer Versalien in Light.
- **Höhengrid** (Ann 2026-11-09: immer beachten): Abstände zwischen Elementen in ganzen Balken; Kästen mit Text (Next Event, Sessions) werden von `src/balken-snap.ts` auf ganze Balken aufgerundet (Desktop), damit Linien/Kanten auf dem Raster bleiben, auch wenn sich Schrift oder Text ändert. Vor jedem Push Positionen bei 1920px nachmessen.
- **Eventseite** (seit 2026-11-09): Zeit/Ort/Eckdaten (`event-detail__meta`) stehen unter der Beschreibung, oberhalb der Linie zu den Speakern. Speaker: Name 36 Light, darunter Position/Firma als Versal-Label (oben bündig mit dem Foto), Bio unten bündig mit dem Foto. Speaker-Galerie Startseite: schwarzer Verlauf unten im Bild für die Namen.
- **Zweiteilige Eventtitel** („Teil 1: Teil 2“ oder „Teil 1 - Teil 2“): zweiter Teil automatisch in eigener Zeile (Eventseite + Session-Kärtchen; Bindestrich entfällt, Doppelpunkt bleibt). Titel im CMS nicht in Versalien schreiben. Trennzeichen zwischen zwei Teilen immer Doppelpunkt statt Gedankenstrich (Ann 2026-11-09), auch bei Nummer/Titel und in Website-Texten; Name/Firma mit Komma.
- **Weitere Event-Bereiche** (optional, CMS): `facts` (Zeilen unter Zeit/Ort), `program` (Uhrzeit/Titel/Text), `hosts` („Präsentiert von“, Foto/Rolle/Link), `partners` (nach `category` gruppiert; ohne eigene Sponsoren laufen sie im Laufband). Erstmals beim DAZ-Event (Quelle: oblik.media/events/architecture-intelligence).
- **Fotogalerien**: jedes Foto im Originalformat (aspect-ratio beim Build via `scripts/image-orientation.mjs`), gleiche Höhe.
- **Hintergrund-Rauschen**: `src/assets/noise.png` (512px, angezeigt 256px, nie hochskaliert) per Overlay über `public/background-smooth.jpg` (Startseite) bzw. den Verlauf von `.event-hero` – kein eingebackenes Korn mehr.
- **Rechtsseiten** im Eventseiten-Layout, Inhalte in `src/content/{impressum,datenschutz,widerrufsrecht}.json` (Leerzeile = neuer Absatz).
- **Next Event** auf der Startseite: angepinntes Event nur, solange es nicht vorbei ist, sonst nächstes kommendes; gibt es keins → „Stay tuned“ + Button zur Newsletter-Seite.
- Noch offen: geschlechtsspezifische Anrede („Liebe/Lieber") — braucht ein Anrede-Feld im Anmeldeformular.

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
- `docs/Anmeldeseite_Position_der_Elemente.md` — **maßgebliche** Element-Tabelle der Event-Anmeldeseite (Ann-Kathrins korrigierte Version, 2026-07-31), gilt für alle aktuellen und zukünftigen Events
- `docs/anmeldeseite-grid-tabelle.md` — ältere Version derselben Tabelle (aus `Anmeldeseite_Spaltensystem.pdf`, vor der Korrektur), nur noch als Historie
- `docs/event-anmeldesystem-anforderungen.md` — Anforderungen ans Anmeldesystem, Umsetzungsstand
- `google-apps-script/README.md` — Setup-Anleitung für Code.gs (Bereitstellung im Apps-Script-Editor)

Die großen Referenz-PDFs (Grid-Vorlagen, teils 150MB+) sind bewusst **nicht** im Git-Repo (Repo-Größe, GitHub-Limits) — die Werte daraus stecken schon in `docs/grid-tabelle.md` und im Code. Bei Bedarf über das gemeinsame Google-Drive-Backup teilen.
