import './style.css'

// TODO: Wird gesetzt, sobald Xavi das Google Apps Script fuer die
// Anmeldungen deployed hat (siehe event-anmeldesystem-anforderungen.md im
// Second-Brain-Vault). Bis dahin zeigt das Formular nur eine Vorschau-
// Meldung statt echt zu senden - es geht absichtlich keine Anmeldung
// verloren, die aussieht als waere sie angekommen, obwohl nichts
// gespeichert wurde.
const REGISTRATION_ENDPOINT = ''

const form = document.getElementById('event-form')
const status = form?.querySelector<HTMLParagraphElement>('.event-form__status')

if (form instanceof HTMLFormElement && status) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (!REGISTRATION_ENDPOINT) {
      status.textContent =
        'Formular-Vorschau: Die Anmeldung ist technisch noch nicht angebunden, es wurde nichts gespeichert.'
      return
    }

    const submitButton = form.querySelector<HTMLButtonElement>('.event-form__submit')
    submitButton?.setAttribute('disabled', 'true')
    status.textContent = 'Wird gesendet …'

    const formData = new FormData(form)
    const payload = {
      eventSlug: form.dataset.eventSlug ?? '',
      eventTitle: form.dataset.eventTitle ?? '',
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      company: formData.get('company'),
      position: formData.get('position'),
    }

    try {
      const response = await fetch(REGISTRATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Server antwortete mit Status ${response.status}`)
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
