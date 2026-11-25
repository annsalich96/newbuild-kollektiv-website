// Schwarz-weisse Fotos werden unter der Maus farbig (Klasse is-farbig, CSS
// in style.css). Ergaenzt :hover, weil Safari :hover nicht aktualisiert,
// wenn das Foto unter der stehenden Maus durchlaeuft (Auto-Lauf der
// Galerien) oder die Seite mit stehender Maus gescrollt wird (Ann
// 2026-11-25). Mausposition seitenweit, auch aus dem wheel-Ereignis;
// geprueft bei Maus-/Scrollbewegung und alle 150 ms (fuer den Auto-Lauf).
// Gilt fuer: Speaker-Fotos Startseite, Fotogalerie Startseite,
// Speaker-Fotos und "Praesentiert von" auf den Eventseiten.
const ZIELE = 'a.team-row__photo, .photo-gallery-2__slide, .event-detail__speaker-photo, img.event-hosts__photo'

let maus: { x: number; y: number } | null = null
let aktuell: Element | null = null
let gestartet = false

function pruefen() {
  const unter = maus ? document.elementFromPoint(maus.x, maus.y) : null
  const ziel = unter ? unter.closest(ZIELE) : null
  if (ziel === aktuell) return
  aktuell?.classList.remove('is-farbig')
  ziel?.classList.add('is-farbig')
  aktuell = ziel
}

export function initFarbeUnterMaus() {
  if (gestartet || !window.matchMedia('(hover: hover)').matches) return
  gestartet = true
  const merke = (e: MouseEvent) => {
    if ((e as PointerEvent).pointerType && (e as PointerEvent).pointerType !== 'mouse') return
    maus = { x: e.clientX, y: e.clientY }
    pruefen()
  }
  window.addEventListener('pointermove', merke, { passive: true })
  window.addEventListener('wheel', merke, { passive: true })
  window.addEventListener('scroll', pruefen, { passive: true, capture: true })
  document.documentElement.addEventListener('mouseleave', () => {
    maus = null
    pruefen()
  })
  window.setInterval(() => {
    if (maus || aktuell) pruefen()
  }, 150)
}
