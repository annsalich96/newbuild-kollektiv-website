import './style.css'
import eventsData from './content/events.json'
import teamData from './content/team.json'
import missionAboutData from './content/mission-about.json'
import heroData from './content/hero.json'
import galleryData from './content/gallery.json'
import sponsorsData from './content/sponsors.json'
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

// Hero-Foto ist optional (`?`), aus demselben Grund wie Team -> image (s.
// CLAUDE.md): Pages CMS laesst ein leer gelassenes optionales Feld komplett
// aus der JSON weg.
type HeroData = { photo?: string; video?: string }
const hero = heroData as HeroData
const heroPhoto = document.getElementById('hero-photo')
if (heroPhoto && hero.video) {
  const posterAttr = hero.photo ? ` poster="${hero.photo}"` : ''
  heroPhoto.innerHTML = `<video src="${hero.video}" autoplay muted loop playsinline${posterAttr}></video>`
} else if (heroPhoto && hero.photo) {
  heroPhoto.innerHTML = `<img src="${hero.photo}" alt="" />`
}

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
  number?: string
  introLabel: string
  title: string
  isNext: boolean
  date: string
  time: string
  location: string
  speakerName?: string
  speakerCompany?: string
  speakerBio?: string
  speakerImage?: string
  description: string
}

const events = eventsData.events as EventItem[]
const nextEvent = events.find((e) => e.isNext) ?? events[0]
if (nextEvent) {
  const speaker = nextEvent.speakerCompany
    ? `${nextEvent.speakerName ?? ''} — ${nextEvent.speakerCompany}`
    : (nextEvent.speakerName ?? '')
  setText(
    'next-event-title',
    nextEvent.number ? `${nextEvent.number} — ${nextEvent.title}` : nextEvent.title,
  )
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
          ${s.number ? `<p class="session-card__number">${s.number}</p>` : ''}
          <div class="session-card__text">
            <p>${s.title}</p>
          </div>
          <div class="session-card__meta-block">
            ${s.speakerName ? `<p>${s.speakerName}</p>` : ''}
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
  // image/role sind optional (`?`), weil Pages CMS ein leer gelassenes
  // optionales Feld komplett weglaesst statt eines leeren Strings - ein
  // Team-Mitglied ohne Foto/Rolle hat also schlicht keinen "image"/"role"-
  // Schluessel in der JSON.
  type Member = { name: string; image?: string; role?: string }

  const memberItem = (member: Member, extraClass: string | null) => {
    const li = document.createElement('li')
    li.className = extraClass ? `team-row__member ${extraClass}` : 'team-row__member'
    if (extraClass) li.setAttribute('aria-hidden', 'true')
    // Solange kein Foto hinterlegt ist, bleibt es beim dunklen Platzhalter-
    // Kasten (siehe .team-row__photo-Hintergrundfarbe) - sobald ueber Pages
    // CMS ein Bild hochgeladen wird, erscheint es hier automatisch, ohne
    // dass main.ts nochmal angefasst werden muss.
    const photo = member.image ? `<img src="${member.image}" alt="" />` : ''
    const role = member.role ? `<span class="team-row__role">${member.role}</span>` : ''
    li.innerHTML = `
      <div class="team-row__photo" aria-hidden="true">
        ${photo}
        <div class="team-row__caption">
          <span class="team-row__name">${member.name}</span>
          ${role}
        </div>
      </div>`
    return li
  }

  const members = teamData.members

  // Volle Kopie der Liste vor UND nach den echten Eintraegen statt nur je
  // einem einzelnen Klon-Element: auf breiten Bildschirmen sind mehrere
  // Karten gleichzeitig sichtbar, mit nur einem Klon-Element waere der
  // erste echte Eintrag (z.B. nach einer Umsortierung) gleichzeitig auch
  // als Wrap-Klon direkt nach dem letzten Eintrag sichtbar - sah aus wie
  // eine Dopplung. Mit einer vollen Kopie an jedem Ende bleibt immer eine
  // komplette echte Runde zwischen zwei Vorkommen desselben Eintrags.
  members.forEach((member) => teamRow.appendChild(memberItem(member, 'is-mobile-wrap-clone')))
  members.forEach((member) => teamRow.appendChild(memberItem(member, null)))
  members.forEach((member) => teamRow.appendChild(memberItem(member, 'is-mobile-wrap-clone')))
}

// Fotogalerie 2: gleiches Klon-Prinzip wie das Team-Marquee (volle Kopie
// vor und nach den echten Eintraegen, siehe Kommentar dort) — aus
// content/gallery.json erzeugt statt statisch im Markup zu stehen.
const galleryRow = document.getElementById('photo-gallery-2')
if (galleryRow && galleryData.photos.length > 0) {
  // photo/alt sind optional (`?`), aus demselben Grund wie Team -> image.
  type GalleryPhoto = { photo?: string; alt?: string }

  const galleryItem = (photo: GalleryPhoto, extraClass: string | null) => {
    const li = document.createElement('li')
    li.className = extraClass ? `photo-gallery-2__slide ${extraClass}` : 'photo-gallery-2__slide'
    li.setAttribute('aria-hidden', 'true')
    li.innerHTML = photo.photo ? `<img src="${photo.photo}" alt="${photo.alt ?? ''}" />` : 'Foto folgt'
    return li
  }

  const photos = galleryData.photos as GalleryPhoto[]

  photos.forEach((photo) => galleryRow.appendChild(galleryItem(photo, 'is-mobile-wrap-clone')))
  photos.forEach((photo) => galleryRow.appendChild(galleryItem(photo, null)))
  photos.forEach((photo) => galleryRow.appendChild(galleryItem(photo, 'is-mobile-wrap-clone')))
}

renderSponsorMarquee(undefined, sponsorsData.statement)
initStickyNav()
initMobileNavToggle()

// Team-Galerie und Fotogalerie 2 (auf jeder Bildschirmgroesse, siehe
// style.css) sind per Pfeil/Wischen navigierbare Galerien, unendlich in
// beide Richtungen (Absprache). scroll-snap uebernimmt das Wischen, keine
// Auto-Scroll-Marquee mehr. Sponsoren-Leiste bewusst ausgenommen (bleibt
// Marquee). .marquee__inner ist der eigentliche Scroll-Container (siehe
// style.css-Kommentar dort) — je eine VOLLE Kopie der Liste vor und nach
// den echten Eintraegen (Klasse is-mobile-wrap-clone, siehe main.ts weiter
// oben) macht den Kreislauf endlos: landet man beim Scrollen in einer der
// beiden Kopien, springt es ohne Animation zur entsprechenden Position in
// der echten mittleren Kopie. Volle Listen-Kopien statt nur je einem
// einzelnen Klon-Element, damit auf breiten Bildschirmen (mehrere Karten
// gleichzeitig sichtbar) nie derselbe Eintrag zeitgleich zweimal im Bild
// auftaucht.
document.querySelectorAll<HTMLElement>('.team-marquee, .gallery-marquee').forEach((marquee) => {
  const inner = marquee.querySelector<HTMLElement>('.marquee__inner')
  const list = inner?.querySelector('ul')
  const prev = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--prev')
  const next = marquee.querySelector<HTMLButtonElement>('.marquee__arrow--next')
  if (!inner || !list) return

  const isScrollable = () => getComputedStyle(inner).overflowX === 'auto'

  const slides = Array.from(list.children) as HTMLElement[]
  const realCount = slides.length / 3 // Klon-Kopie + echte Liste + Klon-Kopie

  // Schrittweite = Abstand zwischen zwei Slides (Kartenbreite + Gap). Bei
  // der mobilen Team-Galerie ist das die volle Containerbreite (ein Bild =
  // ein Bildschirm) - bei der auf Desktop slidbaren Fotogalerie sind
  // mehrere Karten gleichzeitig sichtbar, dort waere inner.clientWidth
  // viel zu groß und die Wrap-Sprungziele wuerden nie exakt getroffen.
  const stepWidth = () =>
    slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : inner.clientWidth

  const jumpTo = (index: number, smooth: boolean) => {
    inner.scrollTo({ left: index * stepWidth(), behavior: smooth ? 'smooth' : 'instant' })
  }

  // Startet am Anfang der echten (mittleren) Kopie - davor liegt die volle
  // Klon-Kopie fuer den Wrap-Around nach links.
  if (realCount > 0 && isScrollable()) {
    jumpTo(realCount, false)
  }
  // Erst jetzt sichtbar machen (siehe style.css-Kommentar bei
  // .marquee__inner) - verhindert den kurzen sichtbaren Sprung, falls der
  // Browser beim Neuladen kurz eine alte Scroll-Position wiederherstellt,
  // bevor obiges jumpTo() sie korrigiert.
  inner.classList.add('is-ready')

  let settleTimer: ReturnType<typeof setTimeout>
  inner.addEventListener(
    'scroll',
    () => {
      if (!isScrollable() || realCount <= 0) return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const index = Math.round(inner.scrollLeft / stepWidth())
        if (index < realCount) {
          jumpTo(index + realCount, false)
        } else if (index >= realCount * 2) {
          jumpTo(index - realCount, false)
        }
      }, 120)
    },
    { passive: true }
  )

  prev?.addEventListener('click', () => {
    inner.scrollBy({ left: -stepWidth(), behavior: 'smooth' })
  })

  next?.addEventListener('click', () => {
    inner.scrollBy({ left: stepWidth(), behavior: 'smooth' })
  })

  // Klick-und-Ziehen mit der Maus: Touch/Trackpad scrollen bereits nativ
  // (overflow-x:auto reicht dafuer), eine Maus ohne Trackpad hat aber
  // keine eingebaute Moeglichkeit, horizontal zu scrollen - nur ueber die
  // Pfeile. pointerType-Check verhindert, dass dieser Handler dem
  // nativen Touch-Scrollen in die Quere kommt (setPointerCapture wuerde
  // sonst z.B. Klicks auf die Pfeil-Buttons waehrend eines Touch-Scrolls
  // stoeren).
  let isDragging = false
  let dragStartX = 0
  let dragStartScrollLeft = 0

  inner.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || !isScrollable()) return
    isDragging = true
    dragStartX = event.clientX
    dragStartScrollLeft = inner.scrollLeft
    inner.setPointerCapture(event.pointerId)
    inner.classList.add('is-dragging')
  })

  inner.addEventListener('pointermove', (event) => {
    if (!isDragging) return
    inner.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX)
  })

  const endDrag = () => {
    isDragging = false
    inner.classList.remove('is-dragging')
  }
  inner.addEventListener('pointerup', endDrag)
  inner.addEventListener('pointercancel', endDrag)

  window.addEventListener('resize', () => {
    if (realCount > 0 && isScrollable()) jumpTo(realCount, false)
  })
})
