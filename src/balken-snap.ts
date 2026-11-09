// Hoehengrid (Ann, 2026-11-09): Kaesten, deren Hoehe vom Text abhaengt,
// auf ganze Balken aufrunden - sonst rutscht durch eine andere Schrift-
// groesse oder einen laengeren Titel alles darunter auf halbe Balken.
// Nur Desktop; Mobile hat ein eigenes, festes Raster (tokens.css).

const BALKEN_REF = 122 // px bei 1920px Breite, wie --balken in tokens.css
const MOBILE = window.matchMedia('(max-width: 768px)')

export function snapToBalken(selector: string) {
  const run = () => {
    const els = document.querySelectorAll<HTMLElement>(selector)
    els.forEach((el) => (el.style.minHeight = ''))
    if (MOBILE.matches) return
    const balken = (window.innerWidth * BALKEN_REF) / 1920
    els.forEach((el) => {
      const height = el.getBoundingClientRect().height
      // Kleine Toleranz, damit 3,001 Balken nicht auf 4 springen.
      el.style.minHeight = `${Math.ceil(height / balken - 0.02) * balken}px`
    })
  }
  run()
  document.fonts.ready.then(run)
  let frame = 0
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(run)
  })
}
