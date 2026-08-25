import sponsorsData from './content/sponsors.json'

// Sponsoren-Leiste: reine CSS-Marquee ohne JS-Scroll-Handling, braucht nur 3
// identische Kopien fuer den nahtlosen Loop (siehe style.css-Kommentar bei
// .marquee__inner). Von main.ts (Startseite, allgemeine Sponsoren aus
// content/sponsors.json) UND event-form.ts (Event-Unterseiten, jeweils
// eigene Sponsoren aus dem Event selbst) genutzt.
export function renderSponsorMarquee(overrideNames?: string[]) {
  const sponsorTrack = document.getElementById('sponsor-track')
  const names = overrideNames ?? sponsorsData.sponsors.map((s) => s.name)
  if (!sponsorTrack || names.length === 0) return

  ;[false, true, true].forEach((hidden) => {
    names.forEach((name) => {
      const li = document.createElement('li')
      li.textContent = name
      if (hidden) li.setAttribute('aria-hidden', 'true')
      sponsorTrack.appendChild(li)
    })
  })
}
