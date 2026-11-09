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
    //   Website:  Name, darunter "Position, Firma" (roleLine unten)
    //   E-Mail:   "Name, Position Firma"  (siehe Code.gs -> referentText_)

    // Zweiteilige Titel ("Teil 1: Teil 2" oder "Teil 1 - Teil 2"): zweiter
    // Teil in eigener Zeile, erster Teil endet immer mit Doppelpunkt statt
    // Strich (Ann 2026-11-09). Gleiche Regel in src/main.ts.
    const titleParts = (title) => {
      const t = String(title || '').trim()
      const m = t.match(/^(.+?):\s+(.+)$/) || t.match(/^(.+?)\s+[-–—]\s+(.+)$/)
      return m ? [`${m[1]}:`, m[2]] : [t]
    }
    // Zeitspannen einheitlich mit Halbgeviertstrich (wie timeRange in main.ts).
    const time = String(event.time || '').trim().replace(/\s*[-–—]\s*/g, '–')
    const titleHtml = titleParts(event.title).map(escapeHtml).join('<br />')

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
    // Seit 2026-11-09 Name (gross, Light) und Position/Firma (Versal-Label)
    // getrennt - gleiche Kombination wie Label + Statement auf der Startseite.
    const roleLine = (role, company) =>
      [role, company]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(', ')
    const speakers = (event.speakers || []).filter((s) => s && s.name)
    const speakerList = speakers.length
      ? speakers.map((s) => ({ name: s.name, role: roleLine(s.role, s.company), bio: s.bio, image: s.image }))
      : [{ name: event.speakerName || '', role: roleLine(event.speakerRole, event.speakerCompany), bio: event.speakerBio, image: event.speakerImage }]
    const speakerBlock = (s) => `<div class="event-detail__speaker-info">
          <h3 class="event-detail__speaker-name">${escapeHtml(s.name)}</h3>
          ${s.role ? `<p class="event-detail__speaker-role">${escapeHtml(s.role)}</p>` : ''}
          ${s.bio ? `<p class="event-detail__speaker-bio">${escapeHtml(s.bio)}</p>` : ''}
        </div>
        <figure class="event-detail__speaker-photo">${s.image ? `<img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.name)}" loading="lazy" />` : ''}</figure>`

    // Datum/Uhrzeit/Ort/Eckdaten direkt unter der Beschreibung, oberhalb der
    // Linie zu den Speakern (Ann 2026-11-09) - gleiche dt/dd-Struktur wie die
    // "Next Event"-Karte auf der Startseite (.event-card__meta).
    const eventMetaBlock = `<dl class="event-detail__meta">
        <div>
          <dt>Zeit</dt>
          <dd>${escapeHtml(event.date)}, ${escapeHtml(time)}</dd>
        </div>
        <div>
          <dt>Ort</dt>
          <dd>${escapeHtml(event.location)}</dd>
        </div>
        ${(event.facts || [])
          .filter((f) => f && f.label && f.value)
          .map((f) => `<div>
          <dt>${escapeHtml(f.label)}</dt>
          <dd>${escapeHtml(f.value)}</dd>
        </div>`)
          .join('\n        ')}
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
      </div>`
        : `<section class="grid event-detail__speaker">
        ${speakerBlock(speakerList[0])}
      </section>`

    // Weitere optionale Bereiche aus dem CMS (seit 2026-11-02, erstmals fuer
    // das DAZ-Event): Programm, "Praesentiert von" (Gastgeber:innen) und
    // Partner nach Kategorie. Jeder Block nur, wenn Inhalt da ist - Label
    // links (Spalte 2), Inhalt Spalte 5-12, je mit Trennlinie davor.
    const link = (url, text) =>
      url
        ? `<a href="${escapeHtml(/^https?:\/\//.test(url) ? url : 'https://' + url)}" target="_blank" rel="noreferrer">${text}</a>`
        : text
    const block = (label, body) => `<div class="grid divider-row"><hr class="divider" /></div>
      <section class="grid event-detail__block">
        <p class="section__eyebrow">${label}</p>
        <div class="event-detail__block-body">${body}</div>
      </section>`
    const program = (event.program || []).filter((p) => p && p.title)
    const hosts = (event.hosts || []).filter((h) => h && h.name)
    const partners = (event.partners || []).filter((p) => p && p.name)
    const partnerGroups = [...new Set(partners.map((p) => p.category || 'Partner'))]
    const extraSections = [
      program.length
        ? block(
            'Programm',
            `<ol class="event-program">${program
              .map(
                (p) => `<li class="event-program__item">
            ${p.time ? `<p class="event-program__time">${escapeHtml(p.time)}</p>` : ''}
            <h3 class="event-program__title">${escapeHtml(p.title)}</h3>
            ${p.text ? `<p class="event-program__text">${escapeHtml(p.text)}</p>` : ''}
          </li>`,
              )
              .join('')}</ol>`,
          )
        : '',
      hosts.length
        ? block(
            'Präsentiert von',
            `<ul class="event-hosts">${hosts
              .map(
                (h) => `<li class="event-hosts__item">
            ${h.image ? `<img class="event-hosts__photo" src="${escapeHtml(h.image)}" alt="" loading="lazy" />` : ''}
            <div>
              <h3 class="event-hosts__name">${link(h.url, escapeHtml(h.name))}</h3>
              ${h.role ? `<p class="event-hosts__role">${escapeHtml(h.role)}</p>` : ''}
            </div>
          </li>`,
              )
              .join('')}</ul>`,
          )
        : '',
      partners.length
        ? block(
            'Partner',
            `<div class="event-partners">${partnerGroups
              .map(
                (g) => `<div class="event-partners__group">
            <h3 class="event-partners__category">${escapeHtml(g)}</h3>
            <ul class="event-partners__list">${partners
              .filter((p) => (p.category || 'Partner') === g)
              .map((p) => `<li>${link(p.url, escapeHtml(p.name))}</li>`)
              .join('')}</ul>
          </div>`,
              )
              .join('')}</div>`,
          )
        : '',
    ].join('\n')

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
      .replaceAll('__TITLE_HTML__', titleHtml)
      .replaceAll('__TITLE__', escapeHtml(String(event.title || '').trim()))
      .replaceAll('__NUMBER__', escapeHtml(event.number || ''))
      .replaceAll('__INTRO_LABEL__', escapeHtml(event.introLabel))
      .replaceAll('__DATE__', escapeHtml(event.date))
      .replaceAll('__TIME__', escapeHtml(time))
      .replaceAll('__LOCATION__', escapeHtml(event.location))
      .replaceAll('__SPEAKER_NAME__', escapeHtml(event.speakerName || ''))
      .replaceAll('__SPEAKER_ROLE__', escapeHtml(event.speakerRole || ''))
      .replaceAll('__SPEAKER_COMPANY__', escapeHtml(event.speakerCompany || ''))
      .replaceAll('__DESCRIPTION_PARAGRAPHS__', descriptionParagraphs + '\n' + eventMetaBlock)
      .replaceAll('__SLUG__', escapeHtml(event.slug))
      .replaceAll('__GALLERY_SECTION__', gallerySection)
      .replaceAll('__SPEAKER_SECTION__', speakerSection + '\n' + extraSections)
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
