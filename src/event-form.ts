import './style.css'
import eventsData from './content/events.json'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'

// sponsors ist optional (`?`), aus demselben Grund wie Team -> image (s.
// CLAUDE.md): Pages CMS laesst eine leer gelassene Liste komplett aus der
// JSON weg. Ohne eigene Sponsoren traegt renderSponsorMarquee() automatisch
// die allgemeine Sponsoren-Leiste aus content/sponsors.json nach (Fallback).
type EventWithSponsors = { slug: string; sponsors?: { name: string }[] }
const eventSlug = document.getElementById('event-form')?.getAttribute('data-event-slug')
const currentEvent = (eventsData.events as EventWithSponsors[]).find((e) => e.slug === eventSlug)
const eventSponsorNames = currentEvent?.sponsors?.length
  ? currentEvent.sponsors.map((s) => s.name)
  : undefined

renderSponsorMarquee(eventSponsorNames)
initStickyNav()
initMobileNavToggle()
renderFooter()

// Web-App-URL des Google Apps Script (google-apps-script/Code.gs),
// deployed von Xavi am 2026-07-30.
const REGISTRATION_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

const form = document.getElementById('event-form')
const status = form?.querySelector<HTMLParagraphElement>('.event-form__status')

// Kommt die Person vom Check-in-Aufsteller (Name war nicht auf der Liste),
// leitet das Skript hierher weiter: ?checkin=1&vorname=…&nachname=…&foto=1
const params = new URLSearchParams(window.location.search)
const fromCheckin = params.get('checkin') === '1'

if (form instanceof HTMLFormElement && status) {
  const prefill = (name: string, value: string | null) => {
    if (!value) return
    const field = form.elements.namedItem(name)
    if (field instanceof HTMLInputElement) field.value = value
  }
  prefill('firstName', params.get('vorname'))
  prefill('lastName', params.get('nachname'))

  if (fromCheckin) {
    const note = document.getElementById('event-form-note')
    if (note) {
      note.textContent =
        'Schön, dass du da bist! Trag hier kurz deine Daten ein – damit bist du automatisch eingecheckt.'
      note.hidden = false
    }
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
      eventSpeaker: form.dataset.eventSpeaker ?? '',
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
      status.textContent = 'Danke für deine Anmeldung! Du bekommst gleich eine Bestätigung per E-Mail.'
      form.reset()
    } catch (error) {
      status.textContent =
        'Die Anmeldung konnte nicht gesendet werden. Bitte versuch es später nochmal oder schreib uns direkt.'
      console.error('Event-Anmeldung fehlgeschlagen', error)
    } finally {
      submitButton?.removeAttribute('disabled')
    }
  })
}
