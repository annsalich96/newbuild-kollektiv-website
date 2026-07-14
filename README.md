# NewBuild Kollektiv — Website

Statische Website (Vite + TypeScript), kein Framework. Deployment über Cloudflare Pages, verbunden mit diesem GitHub-Repo — jeder Push auf `main` löst automatisch ein neues Deployment aus.

## Struktur

```
index.html              Einstiegspunkt
src/main.ts              App-Logik / Markup-Aufbau
src/style.css            Basis-Styles, importiert tokens.css
src/styles/tokens.css    Design-System: Grid, Spacing, Typografie, Farben
public/                  Statische Assets (Favicon etc.)
```

## Grid-System

12-Spalten-Grid, definiert in `src/styles/tokens.css` über die Klasse `.grid`. Werte für Gutter, Margin und Breakpoints sind zentral als CSS-Variablen gepflegt — nicht hart im Markup verdrahten.

> Aktuell Platzhalterwerte. Werden nach Auswertung des Moodboards final gesetzt.

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
