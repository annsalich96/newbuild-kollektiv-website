import './style.css'
import eventsData from './content/events.json'
import { isPastEvent } from './event-date'
import teamData from './content/team.json'
import missionAboutData from './content/mission-about.json'
import heroData from './content/hero.json'
import galleryData from './content/gallery.json'
import sponsorsData from './content/sponsors.json'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'
import { initCarousel } from './carousel'
import { avoidOrphans } from './no-orphans'
import { snapToBalken } from './balken-snap'

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
type HeroData = { mode?: 'Foto' | 'Video'; photo?: string; video?: string }
const hero = heroData as HeroData
const heroPhoto = document.getElementById('hero-photo')
const wantsVideo = hero.mode === 'Video' ? !!hero.video : !hero.photo && !!hero.video
if (heroPhoto && wantsVideo) {
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
  speakerUrl?: string
  speakers?: { name: string; role?: string; company?: string; image?: string; url?: string }[]
  description: string
}

const events = eventsData.events as EventItem[]
// Bei mehreren Speakern (CMS-Liste) steht in den Kaesten "Multiple Speakers"
// statt eines Namens (Ann 2026-11-09).
const speakerLabel = (e: EventItem) =>
  (e.speakers?.length ?? 0) > 1 ? 'Multiple Speakers' : (e.speakerName ?? '')
// Zeitspannen einheitlich mit Halbgeviertstrich ("18:30–22:00"), egal welcher
// Strich im CMS getippt wurde (Ann 2026-11-09).
const timeRange = (time: string) => time.trim().replace(/\s*[-–—]\s*/g, '–')
// Angepinntes Event ("Als Next Event zeigen?"), solange es nicht vorbei ist -
// sonst das naechste kommende Event. Gibt es keins (z.B. nach dem letzten
// Event, bevor das naechste im CMS steht), zeigt der Kasten "Stay tuned" und
// verweist auf die Newsletter-Anmeldung statt auf ein abgelaufenes Event.
const upcoming = events.filter((e) => !isPastEvent(e.date))
const nextEvent = upcoming.find((e) => e.isNext) ?? upcoming[0]
const nextEventCta = document.getElementById('next-event-cta')
if (nextEvent) {
  const speaker = nextEvent.speakerCompany
    ? `${speakerLabel(nextEvent)}, ${nextEvent.speakerCompany}`
    : speakerLabel(nextEvent)
  setText(
    'next-event-title',
    nextEvent.number ? `${nextEvent.number}: ${nextEvent.title}` : nextEvent.title,
  )
  setText('next-event-speaker', speaker)
  setText('next-event-time', `${nextEvent.date}, ${timeRange(nextEvent.time)}`)
  setText('next-event-location', nextEvent.location)
  if (nextEventCta instanceof HTMLAnchorElement) nextEventCta.href = eventHref(nextEvent.slug)
} else {
  setText('next-event-title', 'Stay tuned: Das nächste Event wird bald bekanntgegeben.')
  setText(
    'next-event-text',
    'Melde dich für den Newsletter an, damit du über die nächsten Treffen per Mail informiert wirst.',
  )
  document.getElementById('next-event-text')?.removeAttribute('hidden')
  document.querySelector('.event-card--next .event-card__meta')?.setAttribute('hidden', '')
  if (nextEventCta instanceof HTMLAnchorElement) {
    nextEventCta.href = '/newsletter/'
    nextEventCta.textContent = 'Newsletter'
  }
}

// Zweiteilige Titel: Doppelpunkt statt Strich zwischen den Teilen, auch wenn
// im CMS ein Strich steht; Text laeuft normal weiter (Ann 2026-11-09;
// gleiche Regel wie titleText in scripts/generate-event-pages.mjs).
const titleHtml = (title: string) => title.trim().replace(/^(.+?)\s+[-–—]\s+/, '$1: ')

const sessionRow = document.getElementById('session-row')
if (sessionRow) {
  sessionRow.innerHTML = events
    .map(
      (s) => `
        <li class="session-card">
          ${s.number ? `<p class="session-card__number">${s.number}</p>` : ''}
          <div class="session-card__text">
            <p>${titleHtml(s.title)}</p>
          </div>
          <div class="session-card__meta-block">
            ${speakerLabel(s) ? `<p>${speakerLabel(s)}</p>` : ''}
            <p>${s.date}</p>
            <p>${timeRange(s.time)}</p>
          </div>
          <a class="button session-card__button" href="${eventHref(s.slug)}">${isPastEvent(s.date) ? 'View Past' : 'Anmeldung'}</a>
        </li>`
    )
    .join('')
}

// Team-Marquee: gleiche Klon-Logik wie zuvor fest im HTML (1x Klon des
// letzten Mitglieds vor dem ersten Eintrag fuer den mobilen Wrap-Around,
// 2x volle Duplizierung fuer den nahtloser Desktop-Loop, 1x Klon des ersten
// Mitglieds am Ende) — jetzt aus content/team.json erzeugt statt statisch
// im Markup zu stehen. Funktioniert unabhaengig von der Mitgliederanzahl.
// image/role sind optional (`?`), weil Pages CMS ein leer gelassenes
// optionales Feld komplett weglaesst statt eines leeren Strings - ein
// Team-Mitglied ohne Foto/Rolle hat also schlicht keinen "image"/"role"-
// Schluessel in der JSON.
type Member = { name: string; image?: string; role?: string; url?: string }

// Speaker-Galerie: zuerst die Eintraege aus content/team.json, danach
// automatisch jede:r Speaker:in aus allen Events (vergangen und kommend, in
// der Reihenfolge von events.json) - aus der Liste `speakers` bzw. den
// Einzelfeldern `speakerName`/... Wer schon drin ist (gleicher Name), kommt
// nicht doppelt; der erste Eintrag mit Foto gewinnt.
const galleryMembers: Member[] = []
const memberByName = new Map<string, Member>()
const addMember = (member: Member) => {
  const name = member.name?.trim()
  if (!name || /^(multiple )?speakers$/i.test(name)) return
  const key = name.toLowerCase().replace(/\s+/g, ' ')
  const existing = memberByName.get(key)
  if (existing) {
    existing.image ??= member.image
    existing.role ??= member.role
    existing.url ??= member.url
    return
  }
  const entry = { ...member, name }
  memberByName.set(key, entry)
  galleryMembers.push(entry)
}
;(teamData.members as Member[]).forEach(addMember)
events.forEach((e) => {
  const speakers = e.speakers?.length
    ? e.speakers
    : e.speakerName
      ? [{ name: e.speakerName, company: e.speakerCompany, image: e.speakerImage, url: e.speakerUrl }]
      : []
  speakers.forEach((s) =>
    addMember({
      name: s.name,
      image: s.image || undefined,
      role: s.company?.trim() || s.role?.trim() || undefined,
      url: s.url?.trim() || undefined,
    }),
  )
})

const teamRow = document.getElementById('team-row')
if (teamRow && galleryMembers.length > 0) {

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
    const caption = `
        ${photo}
        <div class="team-row__caption">
          <span class="team-row__name">${member.name}</span>
          ${role}
        </div>`
    // Mit Website (Feld "Link" im CMS): ganzes Bild ist ein Link auf die
    // Website des Unternehmens, neuer Tab (Ann 2026-11-09). Klone fuer den
    // Endlos-Loop nicht per Tab erreichbar.
    li.innerHTML = member.url
      ? `<a class="team-row__photo" href="${member.url}" target="_blank" rel="noreferrer" draggable="false"${extraClass ? ' tabindex="-1"' : ''} aria-label="${member.name} – Website">${caption}</a>`
      : `<div class="team-row__photo" aria-hidden="true">${caption}</div>`
    li.querySelector('img')?.setAttribute('draggable', 'false')
    return li
  }

  const members = galleryMembers

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
    // Originalformat des Fotos (beim Build gelesen), siehe style.css.
    if (photo.photo && __GALERIE_FORMATE__[photo.photo]) li.style.aspectRatio = __GALERIE_FORMATE__[photo.photo]
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

document.querySelectorAll<HTMLElement>('.team-marquee, .gallery-marquee').forEach(initCarousel)

avoidOrphans()
snapToBalken('.event-card--next, .session-card')
