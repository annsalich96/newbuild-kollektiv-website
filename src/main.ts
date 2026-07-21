import './style.css'

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
