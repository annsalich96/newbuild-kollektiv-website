// Lebendiger Verlauf (Ann 2026-11-25): zwei grosse, weiche Farblichter
// wandern sehr langsam ueber den bestehenden Hintergrund-Verlauf (Startseite:
// body::before, Eventseiten: .event-hero). Nur transform wird animiert ->
// laeuft auf der Grafikkarte, die Seite wird nicht neu gemalt (kein Ruckeln).
// Die Lichter kleben per position:sticky im sichtbaren Bereich, egal wie
// lang die Seite ist. Bei "Bewegung reduzieren" kein Licht.
export function initVerlauf(host: HTMLElement | null) {
  if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const licht = document.createElement('div')
  licht.className = 'verlauf-licht'
  licht.setAttribute('aria-hidden', 'true')
  licht.innerHTML =
    '<div class="verlauf-licht__buehne"><div class="verlauf-licht__a"></div><div class="verlauf-licht__b"></div></div>'
  host.prepend(licht)
}
