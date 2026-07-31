# NewBuild Kollektiv — Grid-System &amp; Element-Tabelle

> Letzte Aktualisierung: 2026-07-15
> Siehe auch: [[README]]

## Grid-Regeln (Referenzbreite 1920px)

**Spaltensystem:**

| Element | Breite | Anzahl |
| --- | --- | --- |
| Margin (M1 links, M2 rechts) | 140px | 2 |
| Spalte (A–L) | 122px | 12 |
| Gutter (nur zwischen Spalten) | 16px | 11 |

Rechnung: 2×140 + 12×122 + 11×16 = 1920px

**Balkensystem:** Horizontale Reihen à 122px Höhe, Anzahl variabel je nach Seitenlänge.

**Notation:** Spalten M1, A–L, M2 · Balken von oben gezählt ab 1

**Responsive (offen/vorgeschlagen):** Breakpoint ~768px, danach Umschaltung auf 4 Spalten mit kleineren Margins/Gutter — noch mit Ann-Kathrin final abzustimmen, ob die bestehende Homepage andere Werte vorgibt.

---

## Typografie

Quelle: Ann-Kathrins handschriftliche Notiz (2026-07-16). Schriftart: **Helvetica**. Werte in **pt**, nicht px (1pt = 1,333px bei 96dpi) — Umrechnung zur Orientierung mit angegeben, pt bleibt die Referenzeinheit.

| Textart | Schriftschnitt | Größe | Zeilenabstand |
| --- | --- | --- | --- |
| Text Capital | Regular | 24pt (≈32px) | — |
| Text Bold | Bold | 48pt (≈64px) | 71pt (≈94,7px) |
| Text Regular | Regular | 36pt (≈48px) | 49pt (≈65,3px) |

**Liniendicke (Kästen/Trennlinien):** 1pt (≈1,33px)

**Logo:** kein Schrifttyp — fertiges Bild, liegt als PNG in `code/public/` (`logo-wordmark.png`, `logo-mark.png`).

---

## Element-Tabelle

**Quelle:** Ann-Kathrins handschriftliche Tabelle (3 Seiten, 2026-07-16) — maßgeblich, ersetzt die vorherige Ableseversion aus den PDF-Overlays. Nr. entspricht ihrer eigenen Nummerierung. Spalten dort als "S1–S12" notiert, hier auf die Buchstaben-Notation (A–L) dieses Dokuments gemappt (S1=A, S2=B, … S12=L). Spalte "Typografie" = bestätigte Zuordnung zu den drei Textarten oben bzw. Liniendicke/Bild.

| Nr | Element | Spalte | Balken | Typografie |
| --- | --- | --- | --- | --- |
| 1 | Logo "NEWBUILD.KOLLEKTIV" | M1–E | B1,4–B3 | Bild (PNG), kein Schrifttyp |
| 2 | Nav-Leiste | A–L | B5 | Text Capital |
| 2b | Kasten um Nav-Leiste | A–L | B5 | Liniendicke 1pt |
| 3 | Bild 1 (Hero-Foto) | M1–M2 | B7–B14 | — (Bild) |
| 4 | Mission Label | B | B17 | Text Capital |
| 5 | Mission Text | E–K | B17–B18 | Text Bold |
| 6 | Trennstrich | A–L | zwischen B20–B21 | Liniendicke 1pt |
| 7 | Fotogalerie 1 (Team) | je Bild 3 Spalten breit, 1 Gutter Abstand zwischen Bildern, Margins nicht beachtet | alle Bilder B22–B27 | — (Bilder); Namen darunter falls vorhanden: Text Capital |
| 8 | Kasten mit dünner Linie (Next-Event-Card) | A–L | B29–B34 | Liniendicke 1pt |
| 9 | Next Event Label | B | B30 | Text Capital |
| 10 | Next Event Überschrift | **E** (bestätigte Abweichung von Original-Tabelle, bündig mit Nr. 11) | B30 | Text Regular (bestätigte Abweichung, war Text Bold) |
| 11 | Next Event Text | E–I | B31–B33 | Text Regular |
| 12 | Anmeldung-Button (Next Event) | J–K | B34, mittig | Text Capital |
| 13 | Trennlinie | A–L | zwischen B35–B36 | Liniendicke 1pt |
| 14 | Session-Kästen (3×) | je 4 Spalten (z.B. Session 01 = A–D), 1 Gutter Abstand zwischen den Kästen | B37–B41 | Liniendicke 1pt |
| 15 | Session-Nummer (zentriert) | mittlere 2 Spalten je Kasten: Session 1 = B–C, Session 2 = F–G, Session 3 = J–K | B37 | Text Bold |
| 16 | Session-Text (zentriert) | identisch wie Nr. 15 | B38–B40 | Text Regular |
| 17 | Anmeldung-Button (zentriert, je Session) | identisch wie Nr. 15 | B41 | Text Capital |
| 18 | Trennlinie | A–L | zwischen B42–B43 | Liniendicke 1pt |
| 19 | Fotogalerie 2 | je Foto 6 Spalten breit (z.B. A–F), 1 Gutter Abstand zwischen Fotos, Margins nicht beachtet, **horizontal scrollbar** | B44–B49 | — (Bilder) |
| 20 | Trennlinie | A–L | zwischen B50–B51 | Liniendicke 1pt |
| 21 | About Überschrift | B | B53 | Text Capital |
| 22 | About Text | E–K | B53–B54 | Text Bold |
| 23 | Trennlinie | A–L | zwischen B56–B57 | Liniendicke 1pt |
| 24 | Sponsoren-Leiste | M1–M2 | B57 | Text Capital (Platzhalter; vermutlich später Logos/Bilder) |

**Funktionale Zusatzanforderungen (kein reines Layout):**

- **Nr. 7 (Fotogalerie Team):** Horizontal scrollbar, wie Nr. 19. Für Entwickler muss es möglich sein, mehr als 4 Bilder einzufügen (nicht auf feste Bildanzahl hartcodieren) — Breite/Anzahl der Bilder in der Galerie ist erweiterbar.
- **Nr. 19 (Fotogalerie 2):** Horizontal scrollbar.
- **Nr. 24 (Sponsoren-Leiste):** Soll sich von links nach rechts bewegen wie ein Werbe-Laufband (Marquee-Animation), nicht statisch.

**Offene Punkte / zu prüfen:**

- Vierter Teamname nicht lesbar (Bildausschnitt), siehe [[project_website_newbuild_kollektiv]]
- Mission- und About-Fließtext sind aktuell identischer Platzhaltertext inkl. Grammatikfehler ("will maker aus resilient") — im Live-Code bereits korrigiert, PDF zeigt noch alten Stand
- Diese Tabelle ersetzt die alte PDF-Ableseversion vollständig (u.a. Team-Fotos jetzt einheitlich 4 Spalten statt asymmetrischem Bleed, Mission-Label bei B17 statt ≈B15) — Code muss entsprechend nachgezogen werden
- **Nr. 7 (Team-Fotos) nachträglich auf 3 Spalten reduziert (2026-07-17):** Bei 4 Spalten (536px) + 3:4-Bildverhältnis war das Foto allein 715px hoch — zu hoch für die 6-Balken-Sektion (732px) inkl. Trennlinien-Abstand und Namenszeile darunter. Mit 3 Spalten (398px) passt alles innerhalb der 6 Balken (~709px Gesamtinhalt).
- **8-Sektionen-System (Block 1–57) im Code als `.page-section--1` bis `--8` umgesetzt**, exakte Balken-Höhen. Next-Event-Kasten (Sektion 5, ursprünglich Block 28–35 = 8 Balken) auf **6 Balken reduziert (2026-07-17)**: Der Kasten braucht nur ~553px/4,5 Balken, bei 8 Balken blieb spürbar mehr Leerraum übrig als z.B. in Sektion 6 (Session-Kästen, 7 Balken, dort passt der Inhalt sichtbar dichter).
- **Marquee-Struktur (Team/Fotogalerie 2/Sponsoren) auf eine flache Liste umgebaut (2026-07-17):** Ursprünglich zwei separate `<ul>`-Tracks verschachtelt in einem Flex-Wrapper mit `width:max-content` — WebKit/Safari berechnete dabei die Breite des ersten Tracks falsch zu klein, wodurch der zweite Track zu früh startete und alle Bilder sich überlappten (mit echter WebKit-Engine reproduziert und verifiziert). Fix: nur noch eine `<ul>` mit echtem Inhalt + identischer Kopie (aria-hidden) als eine flache Liste, keine verschachtelten Flex-Container mehr.
- **Nr. 10 (Next Event Überschrift) bewusst auf Spalte E verschoben (final bestätigt 2026-07-22):** Nachdem kurzzeitig unklar war, ob Label+Titel laut Original-Tabelle beide in Spalte B stehen sollten, wurde per Rückfrage bestätigt: Titel bleibt bündig mit den Meta-Zeilen (Referentin/Zeit/Ort) bei Spalte E, nicht bei Spalte B wie ursprünglich notiert. Zwischenzeitlich wurde testweise Spalte K/11 probiert (bündig mit "About" in der Nav-Leiste, passend zu "Next Event" bündig mit "Mission"/Spalte B) — verworfen, da der Titel dabei auf 4 Zeilen ganz rechts umbrach und die Meta-Zeilen eine große Lücke links bekamen. Spalte E ist die aktuell gültige, finale Version.
