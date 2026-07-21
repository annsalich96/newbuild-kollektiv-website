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
    const shouldStick = naturalTop !== null && window.scrollY >= naturalTop
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
// Galerien (scroll-snap uebernimmt das Wischen), keine Auto-Scroll-Marquee
// mehr. Sponsoren-Leiste bewusst ausgenommen (bleibt Marquee).
document.querySelectorAll<HTMLElement>('.team-marquee, .gallery-marquee').forEach((marquee) => {
  const prev = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--prev')
  const next = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--next')

  prev?.addEventListener('click', () => {
    marquee.scrollBy({ left: -marquee.clientWidth, behavior: 'smooth' })
  })

  next?.addEventListener('click', () => {
    marquee.scrollBy({ left: marquee.clientWidth, behavior: 'smooth' })
  })
})
