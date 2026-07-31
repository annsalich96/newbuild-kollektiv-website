import './style.css'
import impressumData from './content/impressum.json'
import datenschutzData from './content/datenschutz.json'
import widerrufsrechtData from './content/widerrufsrecht.json'

// Rendert die Abschnitte (Ueberschrift + Text) von Impressum/Datenschutz in
// den jeweiligen Container - welche Daten genutzt werden, steht als
// data-legal-page auf dem Container (siehe impressum.html/
// datenschutzerklaerung.html).
const sectionsContainer = document.getElementById('legal-sections')
if (sectionsContainer) {
  const page = sectionsContainer.dataset.legalPage
  const data = page === 'datenschutz' ? datenschutzData : page === 'impressum' ? impressumData : null

  if (data) {
    sectionsContainer.innerHTML = data.sections
      .map(
        (s) => `
          <h2>${escapeHtml(s.heading)}</h2>
          <p>${escapeHtml(s.body).replaceAll('\n', '<br />')}</p>`
      )
      .join('')
  }
}

const widerrufsrechtBody = document.getElementById('widerrufsrecht-body')
if (widerrufsrechtBody) {
  widerrufsrechtBody.textContent = widerrufsrechtData.body
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
