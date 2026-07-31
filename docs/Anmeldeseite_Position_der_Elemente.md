# NewBuild Kollektiv — Anmeldeseite: Position der Elemente

> Letzte Aktualisierung: 2026-07-31
> Gilt als verbindliche Vorlage für **alle** Event-Anmeldeseiten (aktuelle und zukünftige Events) — ersetzt [[anmeldeseite-grid-tabelle]] als maßgebliche Quelle.
> Siehe auch: [[grid-tabelle]] (Homepage), [[README]]

Quelle: Ann-Kathrins korrigierte Element-Tabelle (2026-07-31). Notation wie bei der Homepage-Tabelle: Spalten als Zahlen 1–12 (statt Buchstaben A–L), Balken von oben gezählt.

## Element-Tabelle

| Nr | Element | Spalte | Balken | Schrifttyp | Anmerkung |
| --- | --- | --- | --- | --- | --- |
| 1 | Logo + Nav-Leiste (Pill) | ganze Breite | 1–5 | Bild (Logo) + Text Capital (Nav) | Identisch zur Startseite, direkt übernehmen |
| 6 | Eyebrow-Label "Mission" | 2 | 7 | Text Capital (24pt) | Kein Fehler — Mission des Events |
| 7 | Titel | 5–11 | 7 | Text Bold (48pt) | |
| 8 | Beschreibungstext | 5–12 | 9–16 | Text Regular (36pt) | |
| 9 | Trennlinie | 1–12 | zw. 17/18 | Liniendicke | Ohne Margins |
| 10 | Referent:in Name | 2–3 | 19 | Text Capital (24pt) | Eigene Spalte, getrennt von Bio |
| 11 | Referent:in Bio-Text | 2–7 | 20–24 | Text Regular (36pt) | |
| 12 | Referent:in Foto | 9–12 | 19–24 | Bild | |
| 13 | Name nochmal im Foto | — | — | — | Entfällt komplett |
| 14 | Trennlinie | 1–12 | zw. 25/26 | Liniendicke | Ohne Margins |
| 15 | Sponsoren-Laufband | 1–12 | 26 | Text Capital (24pt) | Entscheidung 2026-07-31: wie Startseite, nicht die zwischenzeitlich vermutete 43pt Bold |
| 16 | Label über Formular | 2–3 | 27–28 | Text Capital (24pt) | Text: "Anmeldung" |
| 17 | Feld "Vorname" | 5–8 | 28 | Text Regular (36pt) | |
| 18 | Feld "Nachname" | 9–12 | 28 | Text Regular (36pt) | |
| 19 | Feld "Unternehmen" | 5–8 | 29 | Text Regular (36pt) | |
| 20 | Feld "Adresse" | 9–12 | 29 | Text Regular (36pt) | |
| 21 | Feld "Email" | 5–8 | 30 | Text Regular (36pt) | |
| 22 | Feld "Telefonnummer" | 9–12 | 30 | Text Regular (36pt) | |
| 23 | Checkbox "Events-Newsletter" | 5–12 | 31 | Text Regular (36pt) | |
| 24–27 | Footer (Impressum/Datenschutz/Widerruf/Kontaktzeile) | wie Startseite | 34–39 | Text Capital 26pt / 12pt Kontaktzeile | unverändert |

## Umsetzung (2026-07-31)

- **Nr. 10/11 korrigiert:** Referent:innen-Name und Bio-Text hatten bisher dieselbe Spaltenspanne (2–7, gemeinsamer Wrapper). Jetzt getrennt: Name eigenständig auf Spalte 2–3, Bio auf 2–7 — siehe `src/style.css` (`.event-detail__speaker-name`, `.event-detail__speaker-bio`).
- **Nr. 15 geklärt:** Sponsoren-Laufband bleibt Text Capital 24pt wie auf der Startseite (`.marquee__track li`, gemeinsame Klasse für alle Laufbänder) — keine Änderung nötig, war bereits korrekt.
- Alle anderen Positionen (Titel, Beschreibung, Foto, Formular-Label, Formularfelder, Footer) stimmten bereits mit dieser Tabelle überein, keine weitere Änderung nötig.
