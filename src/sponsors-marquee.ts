import sponsorsData from './content/sponsors.json'

// Sponsoren-Leiste: reine CSS-Marquee ohne JS-Scroll-Handling, braucht nur 3
// identische Kopien fuer den nahtlosen Loop (siehe style.css-Kommentar bei
// .marquee__inner). Von main.ts (Startseite, allgemeine Sponsoren aus
// content/sponsors.json) UND event-form.ts (Event-Unterseiten, jeweils
// eigene Sponsoren aus dem Event selbst) genutzt.
//
// leadingStatement (nur Startseite) laeuft als eigener, breiterer Eintrag
// VOR den Sponsoren in jeder der 3 Kopien mit (Absprache: soll im Laufband
// selbst mitlaufen statt als separate feste Ueberschrift darueber zu
// stehen) - eigene Klasse .marquee__track-statement fuer die abweichende
// (inhaltsbreite statt feste Slotbreite) Groesse, siehe style.css.
export function renderSponsorMarquee(overrideNames?: string[], leadingStatement?: string) {
  const sponsorTrack = document.getElementById('sponsor-track')
  const names = overrideNames ?? sponsorsData.sponsors.map((s) => s.name)
  if (!sponsorTrack || names.length === 0) return

  ;[false, true, true].forEach((hidden) => {
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
  })
}
