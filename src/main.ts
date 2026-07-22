import './style.css'

// Floating Nav (Desktop .site-nav / Mobile .mobile-nav-bar): bleibt an der
// normalen Position, bis sie beim Runterscrollen oben aus dem Viewport
// laufen wuerde — erst dann wird sie fixiert. position:sticky allein reicht
// nicht, da beide Leisten im DOM innerhalb von .hero sitzen (nur 6 Balken
// hoch) und sich dadurch schon nach kurzer Scrolldistanz wieder loesen
// wuerden. Die urspruengliche Position wird einmalig gemessen (vor jedem
// Fixieren neu, falls sich die Seite/Schriftgroessen aendern), damit es bei
// jeder Viewport-Breite (Desktop/Mobile-Umschaltung) korrekt bleibt.
document.querySelectorAll<HTMLElement>('.site-nav, .mobile-nav-bar').forEach((bar) => {
  let naturalTop: number | null = null

  const update = () => {
    if (!bar.classList.contains('is-stuck')) {
      naturalTop = bar.getBoundingClientRect().top + window.scrollY
    }
    // ">" statt ">=": .mobile-nav-bar sitzt ganz oben (naturalTop ~ 0), mit
    // ">=" war sie dadurch schon bei scrollY=0 (Seitenanfang) faelschlich
    // "stuck" — der transparente Ruhezustand (Absprache) war so nie
    // sichtbar, da sofort das Glas-Aussehen griff.
    const shouldStick = naturalTop !== null && window.scrollY > naturalTop
    bar.classList.toggle('is-stuck', shouldStick)
  }

  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', () => {
    bar.classList.remove('is-stuck')
    naturalTop = null
    update()
  })
})

const navToggle = document.querySelector<HTMLButtonElement>('.mobile-nav-toggle')
const navPanel = document.querySelector<HTMLElement>('.mobile-nav-panel')

if (navToggle && navPanel) {
  navToggle.addEventListener('click', () => {
    const isOpen = !navPanel.hidden
    navPanel.hidden = isOpen
    navToggle.setAttribute('aria-expanded', String(!isOpen))
  })

  navPanel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navPanel.hidden = true
      navToggle.setAttribute('aria-expanded', 'false')
    })
  })
}

// Mobile: Team-/Fotogalerie sind statische, per Pfeil/Swipe navigierbare
// Galerien, unendlich in beide Richtungen (Absprache). scroll-snap
// uebernimmt das Wischen, keine Auto-Scroll-Marquee mehr. Sponsoren-Leiste
// bewusst ausgenommen (bleibt Marquee). .marquee__inner ist der eigentliche
// Scroll-Container (siehe style.css-Kommentar dort) — die Klone mit Klasse
// is-mobile-wrap-clone (ein Klon des letzten Bildes vor dem ersten, ein
// Klon des ersten Bildes nach dem letzten) machen den Kreislauf endlos:
// landet man beim Scrollen auf einem Klon, springt es ohne Animation
// unbemerkt zum echten Gegenstueck.
document.querySelectorAll<HTMLElement>('.team-marquee, .gallery-marquee').forEach((marquee) => {
  const inner = marquee.querySelector<HTMLElement>('.marquee__inner')
  const list = inner?.querySelector('ul')
  const prev = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--prev')
  const next = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--next')
  if (!inner || !list) return

  const isMobileScrollable = () => getComputedStyle(inner).overflowX === 'auto'

  const mobileSlides = Array.from(list.children).filter(
    (el) => !el.classList.contains('is-desktop-duplicate')
  )
  const realCount = mobileSlides.length - 2 // minus die zwei Wrap-Klone

  const jumpTo = (index: number, smooth: boolean) => {
    inner.scrollTo({ left: index * inner.clientWidth, behavior: smooth ? 'smooth' : 'instant' })
  }

  // Startet beim ersten echten Bild (Index 1) — Index 0 ist der Klon des
  // letzten Bildes, fuer den Wrap-Around nach links beim ersten Bild.
  if (realCount > 0 && isMobileScrollable()) {
    jumpTo(1, false)
  }

  let settleTimer: ReturnType<typeof setTimeout>
  inner.addEventListener(
    'scroll',
    () => {
      if (!isMobileScrollable() || realCount <= 0) return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const index = Math.round(inner.scrollLeft / inner.clientWidth)
        if (index === 0) {
          jumpTo(realCount, false)
        } else if (index === realCount + 1) {
          jumpTo(1, false)
        }
      }, 120)
    },
    { passive: true }
  )

  prev?.addEventListener('click', () => {
    inner.scrollBy({ left: -inner.clientWidth, behavior: 'smooth' })
  })

  next?.addEventListener('click', () => {
    inner.scrollBy({ left: inner.clientWidth, behavior: 'smooth' })
  })

  window.addEventListener('resize', () => {
    if (realCount > 0 && isMobileScrollable()) jumpTo(1, false)
  })
})
