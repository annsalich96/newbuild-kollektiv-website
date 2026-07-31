# NewBuild Kollektiv — Website

Statische Website (Vite + TypeScript), kein Framework. Deployment über Cloudflare Pages, verbunden mit diesem GitHub-Repo — jeder Push auf `main` löst automatisch ein neues Deployment aus.

> **Vollständigen Projekt-Kontext (Hosting, CMS-Workflow, Anmeldesystem, bekannte Stolpersteine) gibt's in [`CLAUDE.md`](./CLAUDE.md).** Diese Datei hier ist nur der kurze Einstieg.

## Struktur

Siehe [`CLAUDE.md`](./CLAUDE.md) für die vollständige, aktuelle Übersicht.

## Grid-System

12-Spalten-Grid, definiert in `src/styles/tokens.css` über die Klasse `.grid`. Werte für Gutter, Margin und Breakpoints sind zentral als CSS-Variablen gepflegt — nicht hart im Markup verdrahten. Details/Element-Positionen: [`docs/grid-tabelle.md`](./docs/grid-tabelle.md).

## Workflow

1. Lokal entwickeln: `npm run dev`
2. Änderungen committen und auf `main` pushen
3. Cloudflare Pages baut automatisch (`npm run build` → `dist/`) und deployed

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Lokaler Dev-Server mit Hot Reload |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run preview` | Lokale Vorschau des Builds |
