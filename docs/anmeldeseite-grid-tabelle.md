# NewBuild Kollektiv — Anmeldeseite (Event-Detailseite): Element-Tabelle

> Letzte Aktualisierung: 2026-07-31
> Siehe auch: [[grid-tabelle]] (Homepage-Grid, gleiches Spalten-/Balkensystem), [[README]]

Diese Tabelle war bisher nur im Commit-Text von `a364b18` ("Correct event page grid to match Anmeldeseite_Spaltensystem.pdf") vergraben — hier jetzt als eigene Referenzdatei, analog zu `grid-tabelle.md` für die Homepage. Quelle: `design files/Anmeldeseite_Spaltensystem.pdf`, direkt aus den PDF-Koordinaten ausgemessen (nicht per Augenmaß).

Gilt für: `scripts/event-page.template.html` + zugehörige Regeln in `src/style.css` (Klassen `.event-hero`, `.event-detail__*`, `.event-form-section`, `.event-form`). Spalten-/Balken-Notation identisch zur Homepage-Tabelle (M1, A–L, M2 · Balken von oben gezählt).

## Element-Tabelle

| Element | Spalte | Balken/Position | Typografie/Sonstiges |
| --- | --- | --- | --- |
| Nav-Leiste + Logo | wie Homepage | oben, geteiltes Bauteil (`src/nav.ts`) | identisch zur Homepage-Nav |
| Hero-Hintergrundfoto | M1–M2 | hinter Intro+Speaker-Bereich | `.event-hero` |
| Eyebrow-Label (`introLabel`, Standard "Mission") | wie Titel | Balken 7 (Intro startet ~2 Balken nach Nav) | Text Capital; frei editierbar pro Event über Pages CMS, ersetzt die alte Session-Nummer als Label |
| Event-Titel | 5–11 (E–K) | ab Balken 7 | Text Bold (`.event-detail__title`) |
| Event-Beschreibung | 5–12 (E–L) | Balken 9–16, eigene Zeile unter dem Titel | Text Regular, Abstand zum Titel: 2 Balken |
| Trennlinie | A–L | zwischen Intro und Speaker | 1pt |
| Speaker-Info (Name + Bio) | 2–7 (B–F) | mittig zum Foto | Name: **24pt Text Capital** (korrigiert, war fälschlich 36pt) |
| Speaker-Foto | 9–12 (I–L) | — | Seitenverhältnis 3:4 |
| Trennlinie | A–L | zwischen Speaker und Sponsoren | 1pt |
| Sponsoren-Laufband | M1–M2 | direkt vor Formular-Sektion | ~0 Abstand zum Formular (0,5 Balken oben, korrigiert von vorher 2 Balken) |
| Formular-Label ("Anmeldung") | 2–3 (B–C) | Balken ~27 | Text Capital; war Platzhalter "Markus Kolb" im Design-File, jetzt korrigiert |
| Formular-Felder | 5–12 (E–L) | unterhalb Label | `.event-form` |
| Formular-Sektion Innenabstand | — | 0,5 Balken oben / 2 Balken unten | vorher pauschal 2 Balken oben+unten |

## Mobile (≤768px)

Titel, Beschreibung, Speaker-Info und Speaker-Foto gehen auf volle Breite (`grid-column: 1 / -1`); Speaker-Foto rutscht mit Abstand unter den Text.

## Offene/erledigte Korrekturen (Stand 2026-07-31, Commit `a364b18`)

- Spaltenspannen von Titel/Beschreibung/Speaker-Info/Speaker-Foto korrigiert (siehe Tabelle oben)
- Speaker-Name-Schriftgröße von 36pt auf korrekt 24pt (Text Capital) korrigiert
- Formular-Label-Text von Platzhalter "Markus Kolb" auf "Anmeldung" korrigiert
- Abstand Sponsoren-Leiste → Formular-Sektion von 2 Balken auf ~0 (0,5 Balken) verengt
- Neues Feld `introLabel` pro Event eingeführt (Standard "Mission", frei editierbar über Pages CMS) — ersetzt die Session-Nummer als Eyebrow-Label über dem Titel
