import './style.css'
import eventsData from './content/events.json'
import teamData from './content/team.json'
import sponsorsData from './content/sponsors.json'
import missionAboutData from './content/mission-about.json'

// --- Content-Rendering aus content/*.json (editierbar via Pages CMS) ---
// Muss vor der Marquee-Logik weiter unten laufen, da diese die bereits
// befuellten Listen im DOM ausliest (Anzahl Elemente, Klassen etc.).

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

const nextEvent = eventsData.events.find((e) => e.isNext) ?? eventsData.events[0]
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
  sessionRow.innerHTML = eventsData.events
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
  type Member = { name: string; image: string }

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

// Sponsoren-Leiste: reine CSS-Marquee ohne JS-Scroll-Handling (siehe unten,
// bewusst ausgenommen), braucht nur 3 identische Kopien fuer den nahtlosen
// Loop (siehe style.css-Kommentar bei .marquee__inner).
const sponsorTrack = document.getElementById('sponsor-track')
if (sponsorTrack && sponsorsData.sponsors.length > 0) {
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
  let stuckOffset = 0

  // Misst den CSS-"top"-Wert von .is-stuck (z.B. 0.125*Balken bei der
  // Desktop-Nav, 0 bei der Mobile-Leiste) live ueber das Layout, statt ihn
  // hier als Zahl zu duplizieren — bleibt so automatisch korrekt, egal was
  // in style.css eingestellt ist. Kurzes synchrones An/Abschalten der
  // Klasse fuer die Messung erzeugt keinen sichtbaren Flackerer, da der
  // Browser erst nach Ende dieses Scripts neu zeichnet.
  const measureStuckOffset = () => {
    const wasStuck = bar.classList.contains('is-stuck')
    if (!wasStuck) bar.classList.add('is-stuck')
    const top = bar.getBoundingClientRect().top
    if (!wasStuck) bar.classList.remove('is-stuck')
    return top
  }

  const update = () => {
    if (!bar.classList.contains('is-stuck')) {
      naturalTop = bar.getBoundingClientRect().top + window.scrollY
    }
    if (naturalTop === null) return
    // Fixiert wird schon, sobald die Leiste an ihrer natuerlichen Position
    // den Sticky-Abstand (stuckOffset) erreichen wuerde — nicht erst wenn
    // sie komplett am oberen Rand ankaeme. So passiert der Wechsel zu
    // position:fixed nahtlos ohne sichtbaren Sprung (Absprache).
    // +2px Toleranz: manche mobile Browser liefern beim Zurueckscrollen an
    // die Seitenspitze einen minimal von 0 abweichenden scrollY (Rundungs-
    // /Adressleisten-Artefakt) — bei der Mobile-Leiste (stuckOffset ~ 0)
    // blieb sie dadurch faelschlich im blurry/sticky Zustand haengen,
    // obwohl man sichtbar ganz oben war.
    const threshold = naturalTop - stuckOffset + 2
    bar.classList.toggle('is-stuck', window.scrollY > threshold)
  }

  stuckOffset = measureStuckOffset()
  update()
  window.addEventListener('scroll', update, { passive: true })

  // Nur bei echter Breitenaenderung zuruecksetzen (z.B. Geraet gedreht),
  // nicht bei jedem 'resize' — mobile Browser feuern 'resize' auch, wenn
  // beim Scrollen die Adressleiste ein-/ausblendet (Hoehenaenderung). Ein
  // Reset genau in diesem Moment konnte eine falsche Ruheposition
  // einfangen (Bug: Leiste blieb nach dem Hochscrollen faelschlich im
  // schwebenden/blurry Zustand haengen).
  let lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return
    lastWidth = window.innerWidth
    bar.classList.remove('is-stuck')
    naturalTop = null
    stuckOffset = measureStuckOffset()
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
