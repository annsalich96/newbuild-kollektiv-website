// Eventfarbe aus Pages CMS (Feld "color", z. B. "#2f6f8f") -> alle Toene,
// die Eventseite (Hintergrund-Verlauf) und Mail-Karte daraus ableiten.
// Gemeinsam genutzt von generate-event-pages.mjs und generate-mail-cards.mjs,
// damit beide immer exakt dieselbe Farbe zeigen.
//
// Leer oder ungueltig -> STANDARD (das bisherige NewBuild-Orange), so sehen
// Events ohne eigene Farbe aus wie bisher.

export const STANDARD_FARBE = '#d03d0f' // = --color-accent-orange (tokens.css)

export function eventFarbe(event) {
  const roh = String((event && event.color) || '').trim()
  const hex = roh.startsWith('#') ? roh : '#' + roh
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : STANDARD_FARBE
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Mischt Farbe a mit b (anteil 0..1 von b), Ergebnis als #rrggbb.
function mischen(a, b, anteil) {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const m = (x, y) => Math.round(x + (y - x) * anteil).toString(16).padStart(2, '0')
  return '#' + m(r1, r2) + m(g1, g2) + m(b1, b2)
}

export function rgba(hex, alpha) {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

// Toene fuer die Mail-Karte - Verhaeltnisse aus der Codex-Karte (Session 01)
// abgeleitet: dunkler Einstieg oben links, hellere, leicht vergraute Toene
// nach unten rechts.
export function kartenToene(farbe) {
  // Standard: exakt die Toene der Codex-Karte (Session 01), nicht abgeleitet.
  if (farbe === STANDARD_FARBE) {
    return {
      dunkel: '#a9451b', basis: '#c4693f', mittel: '#d58c6a', hell: '#d9a28a',
      glanz: '#ecb092', grau: '#cea092', rand: '#3a2a24', text: '#111111',
    }
  }
  return {
    dunkel: mischen(farbe, '#000000', 0.18),
    basis: mischen(farbe, '#ffffff', 0.12),
    mittel: mischen(mischen(farbe, '#ffffff', 0.35), '#9a9a9a', 0.1),
    hell: mischen(mischen(farbe, '#ffffff', 0.5), '#b0a8a4', 0.2),
    glanz: mischen(farbe, '#ffffff', 0.6),
    grau: mischen(mischen(farbe, '#ffffff', 0.45), '#a0a0a0', 0.35),
    rand: mischen(farbe, '#000000', 0.75),
    // Schrift: die Farbe (schwarz/weiss) mit mehr Kontrast zum mittleren
    // Kartenton - ab Helligkeit 0,18 gewinnt Schwarz (WCAG-Kontrastformel).
    // NewBuild-Orange bleibt damit schwarz beschriftet wie das Original.
    text: helligkeit(mischen(farbe, '#ffffff', 0.3)) > 0.179 ? '#111111' : '#ffffff',
  }
}

// Relative Helligkeit 0..1 (WCAG-Formel).
export function helligkeit(hex) {
  const lin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
