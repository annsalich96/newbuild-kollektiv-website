import './style.css'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'

renderSponsorMarquee()
initStickyNav()
initMobileNavToggle()
renderFooter()

// Web-App-URL des Google Apps Script (google-apps-script/Code.gs),
// deployed von Xavi am 2026-07-30.
const REGISTRATION_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

const form = document.getElementById('event-form')
const status = form?.querySelector<HTMLParagraphElement>('.event-form__status')

if (form instanceof HTMLFormElement && status) {
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
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      company: formData.get('company'),
      companyAddress: formData.get('companyAddress'),
      phone: formData.get('phone'),
      newsletter: formData.get('newsletter') === 'on',
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
