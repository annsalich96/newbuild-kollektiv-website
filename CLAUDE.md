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

## Google Apps Script: Event-Anmeldungen

`google-apps-script/Code.gs` (liegt im Vault unter `04-projects/newbuild-kollektiv-website/google-apps-script/`, nicht Teil dieses Git-Repos) läuft als Web-App unter dem Google-Account **"newbuild kollektiv"** (Alias `request@newbuild-kollektiv.com`). Nimmt Anmeldungen vom Event-Formular entgegen und trägt sie automatisch in eine Google-Sheets-Tabelle ein + verschickt eine Bestätigungsmail.

- Das Frontend-Formular (`src/event-form.ts`) sendet an die Web-App-URL (endet auf `/exec`).
- **Wichtig:** Bei jeder Code-Änderung an `Code.gs` im Apps-Script-Editor muss erneut **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Neue Version → Bereitstellen** gemacht werden — sonst läuft die Web-App weiter mit der alten Version.

## Struktur

```
index.html                 Einstiegspunkt
src/main.ts                 App-Logik / Markup-Aufbau
src/content/*.json          CMS-gepflegte Inhalte (siehe .pages.yml)
src/event-form.ts           Anmeldeformular → Google Apps Script
src/styles/tokens.css       Design-System: Grid, Spacing, Typografie, Farben
.pages.yml                  Pages-CMS-Schema (manuell pflegen, siehe oben)
scripts/check-cms-schema.mjs   Build-Vorcheck: Pflichtfelder vollständig?
google-apps-script/         (im Vault, nicht hier im Repo) Code.gs + Setup-Anleitung
```

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Lokaler Dev-Server mit Hot Reload |
| `npm run build` | Schema-Check + Produktions-Build nach `dist/` |
| `npm run preview` | Lokale Vorschau des Builds |

## Verwandte Dokumentation im Second-Brain-Vault

- `04-projects/newbuild-kollektiv-website/README.md` — Projekt-Überblick, Referenz-PDFs
- `04-projects/newbuild-kollektiv-website/grid-tabelle.md` — Layout-Vorgaben aus Referenz-PDFs
- `04-projects/newbuild-kollektiv-website/event-anmeldesystem-anforderungen.md` — Anforderungen ans Anmeldesystem
- `04-projects/newbuild-kollektiv-website/google-apps-script/README.md` — Setup-Anleitung für Code.gs
