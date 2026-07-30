// Generiert eine statische HTML-Seite pro Event aus src/content/events.json.
// Wird synchron beim Laden von vite.config.ts aufgerufen (fuer "vite dev"
// und "vite build" gleichermassen), damit Rollup die Dateien als Entries
// findet. Ausgabe liegt unter events/<slug>/index.html und wird NICHT
// eingecheckt (siehe .gitignore) - entsteht bei jedem Start/Build neu aus
// den aktuellen CMS-Daten.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Platzhalter landen sowohl in Text als auch in Attributwerten (data-event-*)
// - deshalb generell HTML-escapen, nicht nur fuer Text.
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function generateEventPages() {
  const eventsData = JSON.parse(readFileSync(join(root, 'src/content/events.json'), 'utf-8'))
  const template = readFileSync(join(root, 'scripts/event-page.template.html'), 'utf-8')

  const outDir = join(root, 'events')
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true })
  }
  mkdirSync(outDir, { recursive: true })

  const entries = {}

  for (const event of eventsData.events) {
    const speaker = event.speakerCompany
      ? `${event.speakerName} — ${event.speakerCompany}`
      : event.speakerName

    // description ist ein mehrzeiliges Textfeld im CMS - jede Zeile wird ein
    // eigener Absatz, wie im PDF-Layout vorgegeben.
    const descriptionParagraphs = String(event.description || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p class="event-detail__description">${escapeHtml(line)}</p>`)
      .join('\n')

    // speakerBio/speakerImage sind optionale Felder - Pages CMS laesst den
    // Schluessel komplett weg, wenn sie leer bleiben (daher || '' zur
    // Absicherung). Ohne Bio/Foto wird der jeweilige Block einfach nicht
    // ausgegeben statt einer leeren Zeile/einem leeren Bild.
    const speakerBioBlock = event.speakerBio
      ? `<p class="event-detail__speaker-bio">${escapeHtml(event.speakerBio)}</p>`
      : ''
    const speakerPhoto = event.speakerImage
      ? `<img src="${escapeHtml(event.speakerImage)}" alt="" />`
      : ''

    const html = template
      .replaceAll('__TITLE__', escapeHtml(event.title))
      .replaceAll('__NUMBER__', escapeHtml(event.number))
      .replaceAll('__DATE__', escapeHtml(event.date))
      .replaceAll('__TIME__', escapeHtml(event.time))
      .replaceAll('__LOCATION__', escapeHtml(event.location))
      .replaceAll('__SPEAKER__', escapeHtml(speaker))
      .replaceAll('__DESCRIPTION_PARAGRAPHS__', descriptionParagraphs)
      .replaceAll('__SPEAKER_BIO_BLOCK__', speakerBioBlock)
      .replaceAll('__SPEAKER_PHOTO__', speakerPhoto)
      .replaceAll('__SLUG__', escapeHtml(event.slug))

    const eventDir = join(outDir, event.slug)
    mkdirSync(eventDir, { recursive: true })
    const filePath = join(eventDir, 'index.html')
    writeFileSync(filePath, html, 'utf-8')

    entries[`event-${event.slug}`] = filePath
  }

  return entries
}
