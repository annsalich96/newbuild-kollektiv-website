import './style.css'
import eventsData from './content/events.json'
import teamData from './content/team.json'
import missionAboutData from './content/mission-about.json'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'

// --- Content-Rendering aus content/*.json (editierbar via Pages CMS) ---
// Muss vor der Marquee-Logik weiter unten laufen, da diese die bereits
// befuellten Listen im DOM ausliest (Anzahl Elemente, Klassen etc.).

renderFooter()

const setText = (id: string, value: string) => {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

setText('mission-text', missionAboutData.missionText)
setText('about-text', missionAboutData.aboutText)

// Jedes Event bekommt jetzt eine eigene, beim Build generierte Unterseite
// (siehe scripts/generate-event-pages.mjs) - "Anmeldung" verlinkt dorthin
// statt wie zuvor auf "#".
const eventHref = (slug: string) => `/events/${slug}/`

// Explizit typisiert statt die JSON-Struktur roh zu inferieren: Pages CMS
// laesst ein leer gelassenes optionales Feld komplett aus der JSON weg
// (wie bei Team -> image, siehe CLAUDE.md). Ohne eigenen Typ mit `?` bricht
// tsc, sobald ein Event (z.B. durchs Bearbeiten in Pages CMS) als einziges
// die letzte verbliebene Instanz eines Felds verliert - passiert am
// 2026-07-31 genau so mit speakerCompany.
type EventItem = {
  slug: string
  number: string
  introLabel: string
  title: string
  isNext: boolean
  date: string
  time: string
  location: string
  speakerName: string
  speakerCompany?: string
  speakerBio?: string
  speakerImage?: string
  description: string
}

const events = eventsData.events as EventItem[]
const nextEvent = events.find((e) => e.isNext) ?? events[0]
if (nextEvent) {
  const speaker = nextEvent.speakerCompany
    ? `${nextEvent.speakerName} — ${nextEvent.speakerCompany}`
    : nextEvent.speakerName
  setText('next-event-title', `${nextEvent.number} — ${nextEvent.title}`)
  setText('next-event-speaker', speaker)
  setText('next-event-time', `${nextEvent.date}, ${nextEvent.time}`)
  setText('next-event-location', nextEvent.location)
  const nextEventCta = document.getElementById('next-event-cta')
  if (nextEventCta instanceof HTMLAnchorElement) nextEventCta.href = eventHref(nextEvent.slug)
}

const sessionRow = document.getElementById('session-row')
if (sessionRow) {
  sessionRow.innerHTML = events
    .map(
      (s) => `
        <li class="session-card">
          <p class="session-card__number">${s.number}</p>
          <div class="session-card__text">
            <p>${s.title}</p>
          </div>
          <div class="session-card__meta-block">
            <p>${s.speakerName}</p>
            <p>${s.date}</p>
            <p>${s.time}</p>
          </div>
          <a class="button session-card__button" href="${eventHref(s.slug)}">Anmeldung</a>
        </li>`
    )
    .join('')
}

// Team-Marquee: gleiche Klon-Logik wie zuvor fest im HTML (1x Klon des
// letzten Mitglieds vor dem ersten Eintrag fuer den mobilen Wrap-Around,
// 2x volle Duplizierung fuer den nahtloser Desktop-Loop, 1x Klon des ersten
// Mitglieds am Ende) — jetzt aus content/team.json erzeugt statt statisch
// im Markup zu stehen. Funktioniert unabhaengig von der Mitgliederanzahl.
const teamRow = document.getElementById('team-row')
if (teamRow && teamData.members.length > 0) {
  // image ist optional (`?`), weil Pages CMS ein leer gelassenes optionales
  // Feld komplett weglaesst statt eines leeren Strings - ein Team-Mitglied
  // ohne Foto hat also schlicht keinen "image"-Schluessel in der JSON.
  type Member = { name: string; image?: string }

  const memberItem = (member: Member, extraClass: string | null) => {
    const li = document.createElement('li')
    li.className = extraClass ? `team-row__member ${extraClass}` : 'team-row__member'
    if (extraClass) li.setAttribute('aria-hidden', 'true')
    // Solange kein Foto hinterlegt ist, bleibt es beim dunklen Platzhalter-
    // Kasten (siehe .team-row__photo-Hintergrundfarbe) - sobald ueber Pages
    // CMS ein Bild hochgeladen wird, erscheint es hier automatisch, ohne
    // dass main.ts nochmal angefasst werden muss.
    const photo = member.image ? `<img src="${member.image}" alt="" />` : ''
    li.innerHTML = `
      <div class="team-row__photo" aria-hidden="true">
        ${photo}
        <span class="team-row__name">${member.name}</span>
      </div>`
    return li
  }

  const members = teamData.members
  const first = members[0]
  const last = members[members.length - 1]

  teamRow.appendChild(memberItem(last, 'is-mobile-wrap-clone'))
  members.forEach((member) => teamRow.appendChild(memberItem(member, null)))
  members.forEach((member) => teamRow.appendChild(memberItem(member, 'is-desktop-duplicate')))
  members.forEach((member) => teamRow.appendChild(memberItem(member, 'is-desktop-duplicate')))
  teamRow.appendChild(memberItem(first, 'is-mobile-wrap-clone'))
}

renderSponsorMarquee()
initStickyNav()
initMobileNavToggle()

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
