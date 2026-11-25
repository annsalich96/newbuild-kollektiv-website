import './style.css'
import eventsData from './content/events.json'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'
import { initEventGallery } from './event-gallery'
import { initCarousel } from './carousel'
import { avoidOrphans } from './no-orphans'
import { snapToBalken } from './balken-snap'
import { APPS_SCRIPT_URL, ladePlatzStatus, letzterPlatzStatus } from './platz-status'

// sponsors ist optional (`?`), aus demselben Grund wie Team -> image (s.
// CLAUDE.md): Pages CMS laesst eine leer gelassene Liste komplett aus der
// JSON weg. Ohne eigene Sponsoren traegt renderSponsorMarquee() automatisch
// die allgemeine Sponsoren-Leiste aus content/sponsors.json nach (Fallback).
type EventWithSponsors = {
  slug: string
  maxTeilnehmer?: number
  sponsors?: { name: string }[]
  partners?: { name: string }[]
}
const eventSlug = document.getElementById('event-form')?.getAttribute('data-event-slug')
const currentEvent = (eventsData.events as EventWithSponsors[]).find((e) => e.slug === eventSlug)
// Ohne eigene Sponsoren laufen die Partner des Events (CMS-Feld "partners")
// im Laufband, erst danach die allgemeine Sponsoren-Leiste.
const eventSponsorNames = currentEvent?.sponsors?.length
  ? currentEvent.sponsors.map((s) => s.name)
  : currentEvent?.partners?.length
    ? currentEvent.partners.map((p) => p.name)
    : // Noch keine Sponsoren: Aufruf statt des allgemeinen Startseiten-Satzes
      // (Ann 2026-11-16).
      ['Werde Sponsor für dieses Event. Melde dich bei uns.']

renderSponsorMarquee(eventSponsorNames)
initStickyNav()
initMobileNavToggle()
renderFooter()

// Mehrere Speaker: Slider (Markup aus generate-event-pages.mjs).
document.querySelectorAll<HTMLElement>('.speaker-marquee').forEach((m) => initCarousel(m))

// Web-App-URL des Google Apps Script (google-apps-script/Code.gs),
// deployed von Xavi am 2026-07-30.
const REGISTRATION_ENDPOINT = APPS_SCRIPT_URL

const form = document.getElementById('event-form')
const status = form?.querySelector<HTMLParagraphElement>('.event-form__status')

// Kommt die Person vom Check-in-Aufsteller (Name war nicht auf der Liste),
// leitet das Skript hierher weiter: ?checkin=1&vorname=…&nachname=…&foto=1
const params = new URLSearchParams(window.location.search)
const fromCheckin = params.get('checkin') === '1'

initEventGallery(form?.getAttribute('data-event-date') ?? '', fromCheckin)

if (form instanceof HTMLFormElement && status) {
  const prefill = (name: string, value: string | null) => {
    if (!value) return
    const field = form.elements.namedItem(name)
    if (field instanceof HTMLInputElement) field.value = value
  }
  prefill('firstName', params.get('vorname'))
  prefill('lastName', params.get('nachname'))

  // Teilnehmerlimit (CMS "maxTeilnehmer"): ist es erreicht, wird das Formular
  // zur Warteliste. Wer vom Check-in-Aufsteller kommt, ist schon vor Ort und
  // meldet sich normal an. Ob jemand auf die Warteliste kommt, entscheidet
  // beim Absenden immer das Skript (Antwort "warteliste: true").
  let warteliste = false
  const note = document.getElementById('event-form-note')
  const submitLabel = form.querySelector<HTMLButtonElement>('.event-form__submit')
  if (fromCheckin && note) {
    note.textContent =
      'Schön, dass du da bist! Trag hier kurz deine Daten ein – damit bist du automatisch eingecheckt.'
    note.hidden = false
  }
  const zeigePlaetze = (text: string, mitLink: boolean) => {
    const row = document.getElementById('event-plaetze')
    const dd = row?.querySelector('dd')
    if (!row || !dd) return
    dd.textContent = text
    if (mitLink) {
      const a = document.createElement('a')
      a.href = '#event-form-section'
      a.textContent = 'Trag dich auf die Warteliste ein'
      dd.append(' ', a)
    }
    row.hidden = false
  }
  // Erste Textzeile des Hinweises buendig mit der ersten Formularlinie
  // (Unterkante des Anrede-Felds). Nur Desktop - mobil steht der Hinweis
  // ueber dem Formular.
  const alignNoteToFirstLine = () => {
    const select = form.querySelector('select')
    if (!note || note.hidden || !select) return
    if (!window.matchMedia('(min-width: 769px)').matches) {
      note.style.marginTop = ''
      return
    }
    const cs = getComputedStyle(note)
    // Oberkante der Schrift statt Oberkante der Zeile (halber Zeilenabstand).
    const halbLeading = (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2
    note.style.marginTop = '0px'
    const linie = select.getBoundingClientRect().bottom
    const oben = note.getBoundingClientRect().top
    note.style.marginTop = `${Math.max(0, linie - oben - halbLeading)}px`
  }
  window.addEventListener('resize', alignNoteToFirstLine)
  void document.fonts?.ready.then(alignNoteToFirstLine)

  const wartelisteModus = () => {
    if (warteliste) return
    warteliste = true
    zeigePlaetze('Ausgebucht:', true)
    if (submitLabel) submitLabel.textContent = 'Auf die Warteliste'
    if (note) {
      note.innerHTML =
        '<span class="event-form__note-text">Dieser Abend ist leider schon ausgebucht. Trag dich gern auf ' +
        'die Warteliste ein: Wird ein Platz frei, rückst du automatisch nach.</span>' +
        '<span class="event-form__note-text">Trag dich zusätzlich in unseren Newsletter ein, damit du über ' +
        'bevorstehende Events rechtzeitig informiert wirst.</span>' +
        '<a class="button event-form__note-button" href="/newsletter/">Newsletter</a>'
      note.hidden = false
      alignNoteToFirstLine()
    }
  }
  if (currentEvent?.maxTeilnehmer && !fromCheckin) {
    // Letzten bekannten Stand sofort zeigen, dann aktualisieren.
    if (letzterPlatzStatus(currentEvent.slug)?.ausgebucht) wartelisteModus()
    void ladePlatzStatus(currentEvent.slug).then((s) => {
      if (!s) return
      // Keine Anzeige freier Plaetze (Ann 2026-11-25) - nur "Ausgebucht".
      if (s.ausgebucht) wartelisteModus()
    })
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const submitButton = form.querySelector<HTMLButtonElement>('.event-form__submit')
    submitButton?.setAttribute('disabled', 'true')
    status.textContent = 'Wird gesendet …'

    const formData = new FormData(form)
    const payload = {
      eventSlug: form.dataset.eventSlug ?? '',
      eventNumber: form.dataset.eventNumber ?? '',
      eventTitle: form.dataset.eventTitle ?? '',
      eventDate: form.dataset.eventDate ?? '',
      eventTime: form.dataset.eventTime ?? '',
      eventLocation: form.dataset.eventLocation ?? '',
      speakerName: form.dataset.speakerName ?? '',
      speakerRole: form.dataset.speakerRole ?? '',
      speakerCompany: form.dataset.speakerCompany ?? '',
      anrede: formData.get('anrede'),
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      company: formData.get('company'),
      companyAddress: formData.get('companyAddress'),
      phone: formData.get('phone'),
      newsletter: formData.get('newsletter') === 'on',
      checkin: fromCheckin,
      foto: params.get('foto') === '1',
    }

    try {
      // Content-Type bewusst "text/plain" statt "application/json": Apps-
      // Script-Web-Apps beantworten den CORS-Preflight (OPTIONS), den
      // "application/json" ausloest, nicht - der Request wuerde im Browser
      // scheitern, bevor er ueberhaupt ankommt. "text/plain" gilt als CORS-
      // "simple request" (kein Preflight), das Skript liest den Body aber
      // trotzdem ganz normal als JSON-Text (e.postData.contents) aus.
      const response = await fetch(REGISTRATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Server antwortete mit Status ${response.status}`)
      const result = await response.json()
      if (!result.ok) throw new Error(result.error ?? 'Unbekannter Fehler')
      if (result.warteliste) {
        // Waehrend des Ausfuellens voll geworden -> Formular umstellen.
        wartelisteModus()
        status.textContent = wartelisteText(result)
      } else {
        status.textContent = 'Danke für deine Anmeldung! Du bekommst gleich eine Bestätigung per E-Mail.'
      }
      form.reset()
    } catch (error) {
      status.textContent = warteliste
        ? 'Der Eintrag auf die Warteliste konnte nicht gesendet werden. Bitte versuch es später nochmal oder schreib uns direkt.'
        : 'Die Anmeldung konnte nicht gesendet werden. Bitte versuch es später nochmal oder schreib uns direkt.'
      console.error('Event-Anmeldung fehlgeschlagen', error)
    } finally {
      submitButton?.removeAttribute('disabled')
    }
  })
}

// Rueckmeldung nach dem Eintrag auf die Warteliste (Code.gs wartelisteEintragen_).
function wartelisteText(r: { platz?: number; anzahl?: number; schon?: boolean }) {
  const anzahl = Number(r.anzahl) || 0
  const personen = anzahl === 1 ? '1 Person' : `${anzahl} Personen`
  const platz = Number(r.platz) || anzahl
  return (
    (r.schon ? 'Du stehst schon auf der Warteliste: ' : 'Danke, du stehst jetzt auf der Warteliste: ') +
    `Platz ${platz}, insgesamt ${anzahl === 1 ? 'steht' : 'stehen'} gerade ${personen} darauf. ` +
    'Sagt jemand ab, rückst du automatisch nach und bekommst sofort eine E-Mail.'
  )
}

avoidOrphans()

// Speaker-Band auf ganze Balken (Hoehengrid, Ann 2026-11-19).
snapToBalken('.speaker-band')
