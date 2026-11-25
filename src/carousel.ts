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
//
// Auto-Lauf (Option autoplay, Ann 2026-11-25: Speaker und Fotogalerie der
// Startseite laufen langsam und IMMER weiter, wie das Sponsoren-Laufband):
// - laeuft auch unter der Maus weiter; das Foto unter der Maus wird farbig
//   (Klasse is-farbig per elementFromPoint - Safari aktualisiert :hover
//   nicht, wenn das Bild unter der stehenden Maus durchlaeuft), Klick
//   oeffnet die Website
// - Pfeil-Klick: kurzer Sprung, danach sofort weiter (AUTOPLAY_NACH_PFEIL_MS)
// - selbst ziehen/wischen/seitlich scrollen: Pause nur waehrend der Geste,
//   danach sofort weiter (AUTOPLAY_NACH_GESTE_MS)
// - senkrechtes Scrollen der Seite ueber der Galerie stoert nicht
// - Einrasten (scroll-snap) bleibt im Auto-Lauf aus (Klasse is-autoplay),
//   sonst springt die Galerie bei jeder Pause
// - stufenlos: ganze Pixel per scrollLeft, Rest per transform (Safari kennt
//   nur ganze Pixel beim Scrollen -> ruckelte bei langsamem Tempo)
// - nur sichtbar, nicht bei "Bewegung reduzieren"
// Mausposition seitenweit (auch beim Scrollen mit stehender Maus: das
// wheel-Ereignis liefert die Position mit). Safari aktualisiert :hover beim
// Scrollen nicht - deshalb faerbt der Auto-Lauf das Foto unter dieser
// Position selbst ein (Klasse is-farbig).
let mausPos: { x: number; y: number } | null = null
const merkeMaus = (e: MouseEvent) => {
  if ((e as PointerEvent).pointerType && (e as PointerEvent).pointerType !== 'mouse') return
  mausPos = { x: e.clientX, y: e.clientY }
}
window.addEventListener('pointermove', merkeMaus, { passive: true })
window.addEventListener('wheel', merkeMaus, { passive: true })
document.documentElement.addEventListener('mouseleave', () => { mausPos = null })

const AUTOPLAY_PX_PRO_S_1920 = 40
const AUTOPLAY_NACH_PFEIL_MS = 900
const AUTOPLAY_NACH_GESTE_MS = 400

export function initCarousel(marquee: HTMLElement, options: { autoplay?: boolean } = {}) {
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
      const left = inner.scrollLeft + snapOffset()
      if (Math.abs(posOf(i) - left) < Math.abs(posOf(best) - left)) best = i
    })
    return best
  }

  // scroll-padding-left = Rasterversatz (Team/Galerie rasten auf einer
  // Spaltenlinie ein statt an der Bildschirmkante, siehe style.css).
  const snapOffset = () => parseFloat(getComputedStyle(inner).scrollPaddingLeft) || 0

  const jumpTo = (index: number, smooth: boolean) => {
    inner.scrollTo({ left: posOf(index) - snapOffset(), behavior: smooth ? 'smooth' : 'instant' })
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
      // Ab hier ziehen - Startwerte neu, weil der Auto-Lauf seit dem
      // Druecken weitergelaufen sein kann (sonst ruckt es zurueck).
      dragStartX = event.clientX
      dragStartScrollLeft = inner.scrollLeft
      inner.setPointerCapture(event.pointerId)
      inner.classList.add('is-dragging')
    }
    inner.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX)
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

  if (options.autoplay && realCount > 0) startAutoplay()

  function startAutoplay() {
    if (!inner || !list || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const track = list as HTMLElement
    let sichtbar = true
    let pauseBis = 0
    let gesteAktiv = false
    let pos = inner.scrollLeft
    let last = 0
    let farbig: Element | null = null

    inner.classList.add('is-autoplay')
    track.style.willChange = 'transform'

    const pause = (ms: number) => {
      pauseBis = Math.max(pauseBis, Date.now() + ms)
      track.style.transform = ''
    }

    prev?.addEventListener('click', () => pause(AUTOPLAY_NACH_PFEIL_MS))
    next?.addEventListener('click', () => pause(AUTOPLAY_NACH_PFEIL_MS))
    inner.addEventListener('touchstart', () => { gesteAktiv = true; pause(AUTOPLAY_NACH_GESTE_MS) }, { passive: true })
    const gesteEnde = () => { gesteAktiv = false; pause(AUTOPLAY_NACH_GESTE_MS) }
    inner.addEventListener('touchend', gesteEnde, { passive: true })
    inner.addEventListener('touchcancel', gesteEnde, { passive: true })
    // Nur seitliches Scrollen (Trackpad) ist ein Eingriff, nicht das normale
    // Hoch-/Runterscrollen der Seite mit der Maus ueber der Galerie.
    inner.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pause(AUTOPLAY_NACH_GESTE_MS)
    }, { passive: true })

    marquee.addEventListener('pointermove', () => {
      if (inner.classList.contains('is-dragging')) pause(AUTOPLAY_NACH_GESTE_MS)
    })
    new IntersectionObserver((e) => { sichtbar = e[0]?.isIntersecting ?? true }).observe(marquee)

    const farbeUnterMaus = () => {
      const unter = mausPos ? document.elementFromPoint(mausPos.x, mausPos.y) : null
      // Speaker-Fotos (verlinkt) und Fotogalerie der Startseite.
      const el = unter && marquee.contains(unter) ? unter.closest('a.team-row__photo, .photo-gallery-2__slide') : null
      if (el === farbig) return
      farbig?.classList.remove('is-farbig')
      el?.classList.add('is-farbig')
      farbig = el
    }

    const frame = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 0
      last = t
      const laeuft = sichtbar && !document.hidden && !gesteAktiv && Date.now() >= pauseBis && isScrollable()
      if (laeuft) {
        // Zwischendurch anders gescrollt (Pfeil, Wischen, Klon-Sprung)? Dort weiter.
        if (Math.abs(inner.scrollLeft - Math.floor(pos)) > 1) pos = inner.scrollLeft
        pos += (AUTOPLAY_PX_PRO_S_1920 * (inner.clientWidth / 1920) * dt) / 1000
        const width = setWidth()
        if (pos >= 2 * width) pos -= width
        if (pos < width) pos += width
        const ganz = Math.floor(pos)
        if (inner.scrollLeft !== ganz) inner.scrollLeft = ganz
        track.style.transform = `translateX(${-(pos - ganz)}px)`
      } else {
        pos = inner.scrollLeft
      }
      if (mausPos || farbig) farbeUnterMaus()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}
