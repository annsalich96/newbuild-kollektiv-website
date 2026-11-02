// Generiert eine statische HTML-Seite pro Event aus src/content/events.json.
// Wird synchron beim Laden von vite.config.ts aufgerufen (fuer "vite dev"
// und "vite build" gleichermassen), damit Rollup die Dateien als Entries
// findet. Ausgabe liegt unter events/<slug>/index.html und wird NICHT
// eingecheckt (siehe .gitignore) - entsteht bei jedem Start/Build neu aus
// den aktuellen CMS-Daten.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eventFarbe } from './event-farbe.mjs'
import { imageRatio } from './image-orientation.mjs'

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
    // number/speakerName sind optional (nicht jedes Event hat eine
    // Session-Nummer oder genau eine:n Referent:in - z.B. Multi-Speaker-
    // Events wie "Architecture Intelligence", die alle Namen stattdessen in
    // der Kurzbeschreibung auflisten) - ohne "|| ''" wuerde String(undefined)
    // als sichtbarer Text "undefined" auf der Seite landen.
    // Referent:in kommt als drei getrennte CMS-Felder (Name / Position /
    // Firma), damit derselbe Datensatz auch fuer die E-Mails und die
    // Grafiken taugt. Die Satzzeichen setzt der Code, nicht das CMS:
    //   Website:  "Name — Position, Firma"
    //   E-Mail:   "Name, Position Firma"  (siehe Code.gs -> referentText_)
    const speakerLine = (name, role, company) => {
      const extra = [role, company]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(', ')
      return extra ? `${name || ''} — ${extra}` : name || ''
    }
    const speaker = speakerLine(event.speakerName, event.speakerRole, event.speakerCompany)

    // description ist ein mehrzeiliges Textfeld im CMS - jede Zeile wird ein
    // eigener Absatz, wie im PDF-Layout vorgegeben.
    const descriptionParagraphs = String(event.description || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p class="event-detail__description">${escapeHtml(line)}</p>`)
      .join('\n')

    // Referent:innen-Bereich: Name + Bio links, Foto rechts. Liste "speakers"
    // im CMS (mehrere Speaker) hat Vorrang vor den Einzelfeldern
    // speakerName/-Role/-Company/-Bio/-Image (die bleiben fuer die Mails
    // massgeblich). Ab 2 Speakern wird der Bereich zum Slider - gleiches
    // Karussell wie die Fotogalerie (src/carousel.ts, je eine volle
    // Klon-Kopie davor und danach fuer den Endlos-Loop). Optionale Felder
    // laesst Pages CMS ganz weg, wenn sie leer bleiben - daher || ''.
    const speakers = (event.speakers || []).filter((s) => s && s.name)
    const speakerList = speakers.length
      ? speakers.map((s) => ({ line: speakerLine(s.name, s.role, s.company), bio: s.bio, image: s.image }))
      : [{ line: speaker, bio: event.speakerBio, image: event.speakerImage }]
    const speakerBlock = (s) => `<div class="event-detail__speaker-info">
          <h3 class="event-detail__speaker-name">${escapeHtml(s.line)}</h3>
          ${s.bio ? `<p class="event-detail__speaker-bio">${escapeHtml(s.bio)}</p>` : ''}
        </div>
        <figure class="event-detail__speaker-photo">${s.image ? `<img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.line.split(' — ')[0])}" loading="lazy" />` : ''}</figure>`

    // Datum/Uhrzeit/Ort unter der Referent:innen-Beschreibung, gleiche
    // dt/dd-Struktur wie die "Next Event"-Karte auf der Startseite
    // (.event-card__meta). Beim Slider fest unter den Slides.
    const eventMetaBlock = `<dl class="event-detail__speaker-meta">
        <div>
          <dt>Zeit</dt>
          <dd>${escapeHtml(event.date)}, ${escapeHtml(event.time)}</dd>
        </div>
        <div>
          <dt>Ort</dt>
          <dd>${escapeHtml(event.location)}</dd>
        </div>
      </dl>`

    const speakerSlides = (extraClass) =>
      speakerList
        .map(
          (s) => `<li class="speaker-slide${extraClass}"${extraClass ? ' aria-hidden="true"' : ''}>
        <div class="grid event-detail__speaker">
        ${speakerBlock(s)}
        </div>
      </li>`,
        )
        .join('\n')
    const speakerSection =
      speakerList.length > 1
        ? `<div class="marquee speaker-marquee" aria-label="Speaker">
        <div class="marquee__inner">
          <ul class="speaker-track">
      ${speakerSlides(' is-mobile-wrap-clone')}
      ${speakerSlides('')}
      ${speakerSlides(' is-mobile-wrap-clone')}
          </ul>
        </div>
        <button type="button" class="marquee__arrow marquee__arrow--prev" aria-label="Vorherige:r Speaker:in">‹</button>
        <button type="button" class="marquee__arrow marquee__arrow--next" aria-label="Nächste:r Speaker:in">›</button>
      </div>
      <div class="grid event-detail__speaker-after">
        <div class="event-detail__speaker-info">${eventMetaBlock}</div>
      </div>`
        : `<section class="grid event-detail__speaker">
        ${speakerBlock(speakerList[0]).replace(
          /(<\/div>\s*<figure)/,
          `${eventMetaBlock}\n        $1`,
        )}
      </section>`

    // Galerie (CMS-Feld "gallery", optional): gleiches Bauteil wie die
    // Fotogalerie auf der Startseite (.gallery-marquee, Logik in
    // src/carousel.ts) - je eine volle Kopie vor und nach den echten Bildern
    // fuer den Endlos-Loop. Wird immer mitgeneriert, aber versteckt -
    // event-gallery.ts blendet sie erst ein und das Formular aus, wenn das
    // Event vorbei ist (Pruefung im Browser, wie "View Past" auf der
    // Startseite). Ohne Fotos bleibt alles wie bisher.
    const gallery = (event.gallery || []).filter(Boolean)
    const gallerySlides = (extraClass) =>
      gallery
        .map(
          (src) =>
            `<li class="photo-gallery-2__slide${extraClass}" style="aspect-ratio: ${imageRatio(src)}" aria-hidden="true"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></li>`
        )
        .join('\n            ')
    const gallerySection = gallery.length
      ? `<section class="event-gallery-section" id="event-gallery" hidden>
        <div class="grid divider-row divider-row--before-gallery2"><hr class="divider" /></div>
        <div class="marquee gallery-marquee" aria-label="Impressionen vom Event">
          <div class="marquee__inner">
            <ul class="photo-gallery-2">
            ${gallerySlides(' is-mobile-wrap-clone')}
            ${gallerySlides('')}
            ${gallerySlides(' is-mobile-wrap-clone')}
            </ul>
          </div>
          <button type="button" class="marquee__arrow marquee__arrow--prev" aria-label="Vorheriges Bild">‹</button>
          <button type="button" class="marquee__arrow marquee__arrow--next" aria-label="Nächstes Bild">›</button>
        </div>
      </section>`
      : ''

    const html = template
      .replaceAll('__TITLE__', escapeHtml(event.title))
      .replaceAll('__NUMBER__', escapeHtml(event.number || ''))
      .replaceAll('__INTRO_LABEL__', escapeHtml(event.introLabel))
      .replaceAll('__DATE__', escapeHtml(event.date))
      .replaceAll('__TIME__', escapeHtml(event.time))
      .replaceAll('__LOCATION__', escapeHtml(event.location))
      .replaceAll('__SPEAKER_NAME__', escapeHtml(event.speakerName || ''))
      .replaceAll('__SPEAKER_ROLE__', escapeHtml(event.speakerRole || ''))
      .replaceAll('__SPEAKER_COMPANY__', escapeHtml(event.speakerCompany || ''))
      .replaceAll('__DESCRIPTION_PARAGRAPHS__', descriptionParagraphs)
      .replaceAll('__SLUG__', escapeHtml(event.slug))
      .replaceAll('__GALLERY_SECTION__', gallerySection)
      .replaceAll('__SPEAKER_SECTION__', speakerSection)
      // Eventfarbe aus Pages CMS (Feld "Farbe") -> Hintergrund-Verlauf der
      // Seite (.event-hero), dieselbe Farbe wie auf der Mail-Karte.
      .replaceAll('__EVENT_FARBE__', eventFarbe(event))

    const eventDir = join(outDir, event.slug)
    mkdirSync(eventDir, { recursive: true })
    const filePath = join(eventDir, 'index.html')
    writeFileSync(filePath, html, 'utf-8')

    entries[`event-${event.slug}`] = filePath
  }

  return entries
}
