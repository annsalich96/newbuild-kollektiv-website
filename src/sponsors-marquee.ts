import sponsorsData from './content/sponsors.json'

// Sponsoren-Leiste: reine CSS-Marquee ohne JS-Scroll-Handling, braucht nur 3
// identische Kopien fuer den nahtlosen Loop (siehe style.css-Kommentar bei
// .marquee__inner). Von main.ts (Startseite) UND event-form.ts (Event-
// Unterseiten) genutzt, da beide dieselbe Sponsoren-Leiste zeigen.
export function renderSponsorMarquee() {
  const sponsorTrack = document.getElementById('sponsor-track')
  if (!sponsorTrack || sponsorsData.sponsors.length === 0) return

  const names = sponsorsData.sponsors.map((s) => s.name)
  ;[false, true, true].forEach((hidden) => {
    names.forEach((name) => {
      const li = document.createElement('li')
      li.textContent = name
      if (hidden) li.setAttribute('aria-hidden', 'true')
      sponsorTrack.appendChild(li)
    })
  })
}
