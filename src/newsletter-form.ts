import './style.css'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderSponsorMarquee } from './sponsors-marquee'
import { renderFooter } from './footer'
import sponsorsData from './content/sponsors.json'
import { avoidOrphans } from './no-orphans'

// Wie auf der Startseite: Sponsoring-Spruch + allgemeine Sponsoren-Leiste.
renderSponsorMarquee(undefined, sponsorsData.statement)
initStickyNav()
initMobileNavToggle()
renderFooter()

// Gleiche Web-App wie das Event-Formular (google-apps-script/Code.gs,
// action "newsletter" -> newsletterAnmelden_). Content-Type text/plain aus
// demselben Grund wie in event-form.ts (kein CORS-Preflight).
const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

const form = document.getElementById('newsletter-form')
const status = form?.querySelector<HTMLParagraphElement>('.event-form__status')

if (form instanceof HTMLFormElement && status) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submitButton = form.querySelector<HTMLButtonElement>('.event-form__submit')
    submitButton?.setAttribute('disabled', 'true')
    status.textContent = 'Wird gesendet …'

    const formData = new FormData(form)
    const payload: Record<string, unknown> = { action: 'newsletter' }
    for (const name of ['anrede', 'firstName', 'lastName', 'company', 'companyAddress', 'email', 'phone', 'profession', 'profileUrl']) {
      payload[name] = formData.get(name) ?? ''
    }
    payload.privacy = formData.get('privacy') === 'on'

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Server antwortete mit Status ${response.status}`)
      const result = await response.json()
      if (!result.ok) throw new Error(result.error ?? 'Unbekannter Fehler')
      status.textContent =
        result.message ??
        'Danke! Wir haben dir eine E-Mail geschickt – bitte bestätige darin kurz deine Adresse. Danach prüfen wir deine Anmeldung.'
      form.reset()
    } catch (error) {
      status.textContent =
        'Die Anmeldung konnte nicht gesendet werden. Bitte versuch es später nochmal oder schreib uns direkt.'
      console.error('Newsletter-Anmeldung fehlgeschlagen', error)
    } finally {
      submitButton?.removeAttribute('disabled')
    }
  })
}

avoidOrphans()
