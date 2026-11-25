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
  // Korn (Rauschen) als oberste Hintergrund-Ebene ueber den Farbflecken,
  // damit es ueberall gleich stark bleibt (Ann 2026-11-25); das Korn im
  // Grund-Hintergrund entfaellt dann (Klasse has-verlauf, style.css).
  const korn = document.createElement('div')
  korn.className = 'verlauf-korn'
  korn.setAttribute('aria-hidden', 'true')
  host.prepend(licht)
  licht.after(korn)
  host.classList.add('has-verlauf')
}
