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

  // Slides koennen unterschiedlich breit sein (Fotogalerie: Hoch-/Querformat),
  // deshalb wird nicht mit fester Schrittweite gerechnet, sondern mit der
  // tatsaechlichen Position jedes Slides im Scroll-Container.
  const posOf = (index: number) => slides[index].offsetLeft - slides[0].offsetLeft
  const setWidth = () => posOf(realCount) // Breite einer kompletten Kopie

  const currentIndex = () => {
    let best = 0
    slides.forEach((_, i) => {
      if (Math.abs(posOf(i) - inner.scrollLeft) < Math.abs(posOf(best) - inner.scrollLeft)) best = i
    })
    return best
  }

  const jumpTo = (index: number, smooth: boolean) => {
    inner.scrollTo({ left: posOf(index), behavior: smooth ? 'smooth' : 'instant' })
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
        pending = null
        // In einer Klon-Kopie gelandet -> um eine volle Kopie zurueck in die
        // echte Mitte springen (ohne Animation, sieht identisch aus).
        const width = setWidth()
        if (inner.scrollLeft < width - 1) {
          inner.scrollTo({ left: inner.scrollLeft + width, behavior: 'instant' })
        } else if (inner.scrollLeft >= 2 * width - 1) {
          inner.scrollTo({ left: inner.scrollLeft - width, behavior: 'instant' })
        }
      }, 120)
    },
    { passive: true }
  )

  // Ziel des letzten Klicks merken, damit schnelles Mehrfachklicken waehrend
  // der Animation keinen Schritt verschluckt (wird nach dem Einrasten verworfen).
  let pending: number | null = null
  const step = (delta: number) => {
    const from = pending ?? currentIndex()
    pending = Math.min(slides.length - 1, Math.max(0, from + delta))
    jumpTo(pending, true)
  }
  prev?.addEventListener('click', () => step(-1))
  next?.addEventListener('click', () => step(1))

  // Klick-und-Ziehen mit der Maus: Touch/Trackpad scrollen bereits nativ
  // (overflow-x:auto reicht dafuer), eine Maus ohne Trackpad hat aber
  // keine eingebaute Moeglichkeit, horizontal zu scrollen - nur ueber die
  // Pfeile. pointerType-Check verhindert, dass dieser Handler dem
  // nativen Touch-Scrollen in die Quere kommt (setPointerCapture wuerde
  // sonst z.B. Klicks auf die Pfeil-Buttons waehrend eines Touch-Scrolls
  // stoeren).
  // Ziehen startet erst ab ein paar Pixeln Bewegung - sonst schluckt die
  // Pointer-Capture jeden Klick, und verlinkte Bilder (Speaker-Galerie)
  // liessen sich mit der Maus nicht anklicken. Nach echtem Ziehen wird der
  // folgende Klick verworfen, damit das Loslassen keinen Link oeffnet.
  const DRAG_THRESHOLD = 5
  let isPointerDown = false
  let isDragging = false
  let suppressClick = false
  let dragStartX = 0
  let dragStartScrollLeft = 0

  inner.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || !isScrollable()) return
    isPointerDown = true
    isDragging = false
    dragStartX = event.clientX
    dragStartScrollLeft = inner.scrollLeft
  })

  inner.addEventListener('pointermove', (event) => {
    if (!isPointerDown) return
    const dx = event.clientX - dragStartX
    if (!isDragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      isDragging = true
      inner.setPointerCapture(event.pointerId)
      inner.classList.add('is-dragging')
    }
    inner.scrollLeft = dragStartScrollLeft - dx
  })

  const endDrag = () => {
    if (isDragging) suppressClick = true
    isPointerDown = false
    isDragging = false
    inner.classList.remove('is-dragging')
  }
  inner.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
  inner.addEventListener('pointerup', endDrag)
  inner.addEventListener('pointercancel', endDrag)

  window.addEventListener('resize', () => {
    if (realCount > 0 && isScrollable()) jumpTo(realCount, false)
  })
}
