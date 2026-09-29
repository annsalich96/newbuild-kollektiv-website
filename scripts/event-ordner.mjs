// Legt im AI Portal pro Event einen Ordner an bzw. haelt ihn aktuell:
//   02-NEWBUILD-KOLLEKTIV/03-projekte/EVENTS/<Datum> <Nummer> — <Titel>/
//     event.md            Eckdaten + Links (aus Pages CMS erzeugt, NICHT von Hand pflegen)
//     mail-karte.png      die Karte aus den Mails (live von der Website)
//     Fotos/              Originale
//     Fotos - Watermarked/ Exporte mit Wasserzeichen
//
// Quelle bleibt Pages CMS (src/content/events.json) - der Ordner ist zum
// Sammeln und Nachschlagen. Aendert sich im CMS Titel/Datum, wird der Ordner
// beim naechsten Lauf umbenannt (erkannt ueber den Slug in event.md), Fotos
// bleiben erhalten.
//
// Aufruf (im Website-Ordner):  npm run event-ordner

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eventFarbe } from './event-farbe.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repo = join(__dirname, '..')
const EVENTS_DIR = join(repo, '../../03-projekte/EVENTS')
const SITE = 'https://newbuild-kollektiv.com'

const { events } = JSON.parse(readFileSync(join(repo, 'src/content/events.json'), 'utf-8'))

function isoDatum(date) {
  const m = String(date || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : 'ohne-datum'
}

function kurzTitel(title) {
  const t = String(title || '').trim()
  // Kurzform: bis zum ersten ":" bzw. " - " ("ARCHITECTURE INTELLIGENCE - Dialog ...")
  const k = t.split(/:| - /)[0].trim()
  return k.length > 60 ? k.slice(0, 57).trim() + '…' : k
}

function ordnerName(e) {
  const teile = [isoDatum(e.date), String(e.number || '').trim()].filter(Boolean).join(' ')
  // Zeichen, die in Datei-/Ordnernamen Aerger machen, raus.
  return `${teile} — ${kurzTitel(e.title)}`.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
}

// Bestehenden Ordner zu einem Slug finden (Slug steht in event.md).
function findeOrdner(slug) {
  if (!existsSync(EVENTS_DIR)) return null
  for (const name of readdirSync(EVENTS_DIR)) {
    const md = join(EVENTS_DIR, name, 'event.md')
    if (existsSync(md) && readFileSync(md, 'utf-8').includes(`\nslug: ${slug}\n`)) return name
  }
  return null
}

function eventMd(e) {
  const referent = [e.speakerName, [e.speakerRole, e.speakerCompany].map((s) => String(s || '').trim()).filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' — ')
  return `---
slug: ${e.slug}
datum: ${isoDatum(e.date)}
farbe: "${eventFarbe(e)}"
---

# ${e.number ? e.number + ' — ' : ''}${e.title}

> Automatisch erzeugt aus Pages CMS (\`npm run event-ordner\` im Website-Ordner).
> **Hier nichts ändern** — Datum, Ort, Texte und Farbe werden nur in Pages CMS gepflegt,
> sonst gibt es zwei Stände (so kam es am 29.09.2026 zur Erinnerung mit falschem Termin).

| | |
|---|---|
| Datum | ${e.date || ''} |
| Zeit | ${e.time || ''} |
| Ort | ${e.location || ''} |
| Referent:in | ${referent} |
| Farbe | ${eventFarbe(e)} |

## Links

- Eventseite: ${SITE}/events/${e.slug}/
- Mail-Karte: ${SITE}/mail/${e.slug}-karte.png
- Alle Mail-Karten: ${SITE}/mail/
- Inhalte bearbeiten: https://app.pagescms.org (Events (Seite) → ${e.number || e.title})
- Anmeldungen: Google Drive des Accounts „newbuild kollektiv“ → „NewBuild Kollektiv — Event-Anmeldungen“ → Events

## Beschreibung

${String(e.description || '').trim()}
`
}

let neu = 0
let umbenannt = 0
for (const e of events) {
  if (!e || !e.slug) continue
  const soll = ordnerName(e)
  const ist = findeOrdner(e.slug)
  const pfad = join(EVENTS_DIR, soll)
  if (ist && ist !== soll) {
    renameSync(join(EVENTS_DIR, ist), pfad)
    umbenannt++
    console.log(`umbenannt: ${ist} -> ${soll}`)
  } else if (!ist) {
    neu++
    console.log(`neu: ${soll}`)
  }
  for (const sub of ['', 'Fotos', 'Fotos - Watermarked']) mkdirSync(join(pfad, sub), { recursive: true })
  writeFileSync(join(pfad, 'event.md'), eventMd(e), 'utf-8')

  try {
    const res = await fetch(`${SITE}/mail/${e.slug}-karte.png?t=${Date.now()}`)
    if (res.ok) writeFileSync(join(pfad, 'mail-karte.png'), Buffer.from(await res.arrayBuffer()))
    else console.log(`  (Karte fuer ${e.slug} noch nicht online: HTTP ${res.status})`)
  } catch (err) {
    console.log(`  (Karte fuer ${e.slug} nicht ladbar: ${err.message})`)
  }
}
console.log(`Fertig: ${events.length} Events, ${neu} neu, ${umbenannt} umbenannt -> ${EVENTS_DIR}`)
