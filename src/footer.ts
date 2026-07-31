import footerData from './content/footer.json'

// Fusszeile ist global identisch auf jeder Seite (Startseite, Event-Seiten,
// rechtliche Seiten) - eine Quelle in content/footer.json statt 5x
// hartcodiertem Markup. IDs muessen im HTML jeder Seite vorhanden sein
// (siehe index.html, scripts/event-page.template.html, impressum.html etc.).
export function renderFooter() {
  const addressEl = document.getElementById('footer-address')
  if (addressEl) addressEl.textContent = footerData.address

  const phoneEl = document.getElementById('footer-phone')
  if (phoneEl instanceof HTMLAnchorElement) {
    phoneEl.textContent = footerData.phone
    phoneEl.href = `tel:${footerData.phone.replace(/\s+/g, '')}`
  }

  const emailEl = document.getElementById('footer-email')
  if (emailEl instanceof HTMLAnchorElement) {
    emailEl.textContent = footerData.email
    emailEl.href = `mailto:${footerData.email}`
  }

  const setLabel = (id: string, value: string) => {
    const el = document.getElementById(id)
    if (el) el.textContent = value
  }
  setLabel('footer-impressum-label', footerData.impressumLabel)
  setLabel('footer-datenschutz-label', footerData.datenschutzLabel)
  setLabel('footer-widerrufsrecht-label', footerData.widerrufsrechtLabel)
}
