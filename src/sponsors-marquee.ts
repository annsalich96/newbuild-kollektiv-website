import sponsorsDataRaw from './content/sponsors.json'

type SponsorsData = { statement?: string; sponsors?: { name: string }[] }
const sponsorsData = sponsorsDataRaw as SponsorsData

// Sponsoren-Leiste: Laufband, Schrift wandert gleichmaessig von rechts nach
// links. Von main.ts (Startseite, allgemeine Sponsoren aus
// content/sponsors.json), event-form.ts (Event-Unterseiten, eigene Sponsoren
// des Events) und newsletter-form.ts genutzt.
//
// leadingStatement (Startseite/Newsletter) laeuft als eigener, breiterer
// Eintrag VOR den Sponsoren in jeder Kopie mit - eigene Klasse
// .marquee__track-statement (inhaltsbreit statt feste Slotbreite), siehe
// style.css.
//
// Seit 2026-11-02 per JS statt fester CSS-Animation: vorher liefen immer
// genau 3 Kopien in 24s um ein Drittel weiter. Das Tempo hing damit an der
// Textlaenge (Startseite ~74 px/s, Eventseite mit nur einem Sponsor ~12 px/s,
// wirkte ruckelig) und bei kurzem Text reichten 3 Kopien nicht ueber den
// Bildschirm (Luecke rechts, Text sprang). Jetzt: so viele Kopien, dass immer
// die volle Breite gefuellt ist, verschoben um genau eine Kopie, mit festem
// Tempo.
const SPEED_PX_PER_S = 60

export function renderSponsorMarquee(overrideNames?: string[], leadingStatement?: string) {
  const sponsorTrack = document.getElementById('sponsor-track')
  const inner = sponsorTrack?.parentElement
  const names = overrideNames ?? (sponsorsData.sponsors ?? []).map((s) => s.name)
  if (!sponsorTrack || !inner || (names.length === 0 && !leadingStatement)) return

  const appendSet = (hidden: boolean) => {
    if (leadingStatement) {
      const statementLi = document.createElement('li')
      statementLi.textContent = leadingStatement
      statementLi.className = 'marquee__track-statement'
      if (hidden) statementLi.setAttribute('aria-hidden', 'true')
      sponsorTrack.appendChild(statementLi)
    }
    names.forEach((name) => {
      const li = document.createElement('li')
      li.textContent = name
      if (hidden) li.setAttribute('aria-hidden', 'true')
      sponsorTrack.appendChild(li)
    })
  }

  let animation: Animation | undefined
  const build = () => {
    animation?.cancel()
    sponsorTrack.replaceChildren()
    appendSet(false)
    const setWidth = sponsorTrack.scrollWidth
    if (!setWidth) return
    // Volle Breite + eine Kopie Vorrat, damit beim Verschieben nie eine Luecke entsteht.
    const copies = Math.max(2, Math.ceil(window.innerWidth / setWidth) + 1)
    for (let i = 1; i < copies; i++) appendSet(true)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    animation = inner.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-setWidth}px)` }],
      { duration: (setWidth / SPEED_PX_PER_S) * 1000, iterations: Infinity },
    )
  }

  build()
  // Schrift kann nach dem ersten Messen noch nachladen und die Breite aendern.
  document.fonts?.ready.then(build)
  let lastWidth = window.innerWidth
  let resizeTimer: ReturnType<typeof setTimeout>
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return // mobile Adressleiste aendert nur die Hoehe
    lastWidth = window.innerWidth
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(build, 200)
  })
}
