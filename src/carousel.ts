// Team-Galerie und Fotogalerie 2 (auf jeder Bildschirmgroesse, siehe
// style.css) sind per Pfeil/Wischen navigierbare Galerien, unendlich in
// beide Richtungen (Absprache). scroll-snap uebernimmt das Wischen, keine
// Auto-Scroll-Marquee mehr. Sponsoren-Leiste bewusst ausgenommen (bleibt
// Marquee). .marquee__inner ist der eigentliche Scroll-Container (siehe
// style.css-Kommentar dort) — je eine VOLLE Kopie der Liste vor und nach
// den echten Eintraegen (Klasse is-mobile-wrap-clone, erzeugt in main.ts bzw.
// generate-event-pages.mjs) macht den Kreislauf endlos: landet man beim Scrollen in einer der
// beiden Kopien, springt es ohne Animation zur entsprechenden Position in
// der echten mittleren Kopie. Volle Listen-Kopien statt nur je einem
// einzelnen Klon-Element, damit auf breiten Bildschirmen (mehrere Karten
// gleichzeitig sichtbar) nie derselbe Eintrag zeitgleich zweimal im Bild
// auftaucht.
// Wird von der Startseite (main.ts) und der Event-Galerie (event-gallery.ts)
// genutzt - erwartet je eine volle Klon-Kopie vor und nach den echten Slides.
export function initCarousel(marquee: HTMLElement) {
  const inner = marquee.querySelector<HTMLElement>('.marquee__inner')
  const list = inner?.querySelector('ul')
  const prev = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--prev')
  const next = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--next')
  if (!inner || !list) return

  const isScrollable = () => getComputedStyle(inner).overflowX === 'auto'

  const slides = Array.from(list.children) as HTMLElement[]
  const realCount = slides.length / 3 // Klon-Kopie + echte Liste + Klon-Kopie

  // Schrittweite = Abstand zwischen zwei Slides (Kartenbreite + Gap). Bei
  // der mobilen Team-Galerie ist das die volle Containerbreite (ein Bild =
  // ein Bildschirm) - bei der auf Desktop slidbaren Fotogalerie sind
  // mehrere Karten gleichzeitig sichtbar, dort waere inner.clientWidth
  // viel zu groß und die Wrap-Sprungziele wuerden nie exakt getroffen.
  const stepWidth = () =>
    slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : inner.clientWidth

  const jumpTo = (index: number, smooth: boolean) => {
    inner.scrollTo({ left: index * stepWidth(), behavior: smooth ? 'smooth' : 'instant' })
  }

  // Startet am Anfang der echten (mittleren) Kopie - davor liegt die volle
  // Klon-Kopie fuer den Wrap-Around nach links.
  if (realCount > 0 && isScrollable()) {
    jumpTo(realCount, false)
  }
  // Erst jetzt sichtbar machen (siehe style.css-Kommentar bei
  // .marquee__inner) - verhindert den kurzen sichtbaren Sprung, falls der
  // Browser beim Neuladen kurz eine alte Scroll-Position wiederherstellt,
  // bevor obiges jumpTo() sie korrigiert.
  inner.classList.add('is-ready')

  let settleTimer: ReturnType<typeof setTimeout>
  inner.addEventListener(
    'scroll',
    () => {
      if (!isScrollable() || realCount <= 0) return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const index = Math.round(inner.scrollLeft / stepWidth())
        if (index < realCount) {
          jumpTo(index + realCount, false)
        } else if (index >= realCount * 2) {
          jumpTo(index - realCount, false)
        }
      }, 120)
    },
    { passive: true }
  )

  prev?.addEventListener('click', () => {
    inner.scrollBy({ left: -stepWidth(), behavior: 'smooth' })
  })

  next?.addEventListener('click', () => {
    inner.scrollBy({ left: stepWidth(), behavior: 'smooth' })
  })

  // Klick-und-Ziehen mit der Maus: Touch/Trackpad scrollen bereits nativ
  // (overflow-x:auto reicht dafuer), eine Maus ohne Trackpad hat aber
  // keine eingebaute Moeglichkeit, horizontal zu scrollen - nur ueber die
  // Pfeile. pointerType-Check verhindert, dass dieser Handler dem
  // nativen Touch-Scrollen in die Quere kommt (setPointerCapture wuerde
  // sonst z.B. Klicks auf die Pfeil-Buttons waehrend eines Touch-Scrolls
  // stoeren).
  let isDragging = false
  let dragStartX = 0
  let dragStartScrollLeft = 0

  inner.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || !isScrollable()) return
    isDragging = true
    dragStartX = event.clientX
    dragStartScrollLeft = inner.scrollLeft
    inner.setPointerCapture(event.pointerId)
    inner.classList.add('is-dragging')
  })

  inner.addEventListener('pointermove', (event) => {
    if (!isDragging) return
    inner.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX)
  })

  const endDrag = () => {
    isDragging = false
    inner.classList.remove('is-dragging')
  }
  inner.addEventListener('pointerup', endDrag)
  inner.addEventListener('pointercancel', endDrag)

  window.addEventListener('resize', () => {
    if (realCount > 0 && isScrollable()) jumpTo(realCount, false)
  })
}
