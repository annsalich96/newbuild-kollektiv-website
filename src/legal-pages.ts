import './style.css'
import impressumData from './content/impressum.json'
import datenschutzData from './content/datenschutz.json'
import widerrufsrechtData from './content/widerrufsrecht.json'
import { initMobileNavToggle, initStickyNav } from './nav'
import { renderFooter } from './footer'
import { avoidOrphans } from './no-orphans'

initStickyNav()
initMobileNavToggle()
renderFooter()

// Rechtliche Seiten im Layout der Eventseiten: dunkler Kopf mit Navigation,
// Inhalt im hellen Bereich - je Abschnitt Ueberschrift links (Spalte 2-4),
// Text rechts (Spalte 5-12). Welche Daten, steht als data-legal-page am
// Container (impressum.html / datenschutzerklaerung.html / widerrufsrecht.html).
// Leerzeile im CMS-Text = neuer Absatz, einfacher Zeilenumbruch = <br>.
type Section = { heading: string; body: string }

const container = document.getElementById('legal-sections')
const page = container?.dataset.legalPage
const sections: Section[] =
  page === 'datenschutz'
    ? datenschutzData.sections
    : page === 'impressum'
      ? impressumData.sections
      : page === 'widerrufsrecht'
        ? [{ heading: 'Widerrufsrecht', body: widerrufsrechtData.body }]
        : []

if (container) {
  container.innerHTML = sections
    .map(
      (s) => `
        <section class="grid legal-block">
          <h3 class="legal-block__heading">${escapeHtml(s.heading)}</h3>
          <div class="legal-block__body">${paragraphs(s.body)}</div>
        </section>`,
    )
    .join('')
}

function paragraphs(text: string) {
  return String(text || '')
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replaceAll('\n', '<br />')}</p>`)
    .join('')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

avoidOrphans()
