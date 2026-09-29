// Erzeugt beim Build fuer JEDES Event aus src/content/events.json (Pages CMS)
// die Eventkarte fuer die Mails (Anmeldebestaetigung + Erinnerung am Vortag)
// im Stil der ersten, von Codex gestalteten Karte (Session 01): Orange-
// Verlauf, Titel, Untertitel, Referent:in, Zeit, Ort, "Google Maps"-Button.
//
// Ausgabe (vite.config.ts -> emitFile):
//   /mail/<slug>-karte.png   600x450 (Retina: 1200x900 gerendert)
//   /mail/                   Uebersichtsseite mit allen Karten
// Das Apps Script (grafikBlock_) verlinkt /mail/<slug>-karte.png per
// Namenskonvention - fuer neue Events ist also nichts mehr von Hand zu tun.
//
// Schrift: TeX Gyre Heros (freie Helvetica-Nachbildung, GUST Font License),
// liegt in scripts/fonts/ - Helvetica selbst ist nicht frei einbettbar.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { eventFarbe, kartenToene, rgba } from './event-farbe.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const W = 600
const H = 450
const SCALE = 2

const fonts = [
  { name: 'Heros', weight: 400, style: 'normal', data: readFileSync(join(__dirname, 'fonts/texgyreheros-regular.otf')) },
  { name: 'Heros', weight: 700, style: 'normal', data: readFileSync(join(__dirname, 'fonts/texgyreheros-bold.otf')) },
]

// Kleiner Helfer statt JSX: h('div', {style}, ...kinder). Satori verlangt
// fuer jedes div ein explizites display - Standard hier: flex (Spalte bei
// mehreren Kindern), Textblöcke zentriert.
const h = (type, style, ...children) => {
  const kinder = children.flat().filter((c) => c !== null && c !== undefined && c !== '')
  return {
    type,
    props: {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', ...style },
      children: kinder.length === 1 ? kinder[0] : kinder,
    },
  }
}

// "KI belohnt Ordnung: Wie Menschen ..." -> ["KI belohnt Ordnung", "Wie Menschen ..."]
function titelTeile(title) {
  const t = String(title || '').trim()
  const i = t.indexOf(':')
  return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : [t, '']
}

// "Projo Berlin, Chausseestraße 123, 10115 Berlin" -> ["Projo Berlin", "Chausseestraße 123, 10115 Berlin"]
function ortZeilen(location) {
  const l = String(location || '').trim()
  const i = l.indexOf(',')
  return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l]
}

// Grundmasse (px bei 600x450) - werden bei viel Text gemeinsam per Faktor s
// verkleinert, damit nichts in den Button laeuft (siehe passendeSkalierung).
const M = { titel: 29, sub: 21, subAbstand: 12, metaAbstand: 18, label: 16, wert: 21, blockAbstand: 12 }
const TEXTBREITE = 600 - 30 - 56 // Karte minus Rand minus Innenabstand
const VERFUEGBAR = 450 - 31 - 44 - 40 - 34 // Hoehe minus Rand, Innenabstand, Button, Mindestluft (Schaetzung ist knapp)

// Grobe Zeilen-/Hoehenschaetzung (Heros: Zeichen ~0,53 x Schriftgroesse,
// fett ~0,6) - Satori selbst meldet keinen Ueberlauf.
function zeilen(text, groesse, fett, breite = TEXTBREITE) {
  const proZeile = Math.max(1, Math.floor(breite / (groesse * (fett ? 0.6 : 0.53))))
  return Math.max(1, Math.ceil(String(text).length / proZeile))
}

function geschaetzteHoehe(t, s) {
  let hgt = zeilen(t.titel, M.titel * s, true) * M.titel * s * 1.2
  if (t.untertitel) hgt += M.subAbstand * s + zeilen(t.untertitel, M.sub * s, false, 470) * M.sub * s * 1.35
  hgt += M.metaAbstand * s
  for (const block of t.meta) {
    hgt += M.blockAbstand * s + M.label * s * 1.2
    for (const w of block.werte) hgt += zeilen(w, M.wert * s, false) * M.wert * s * 1.3
  }
  return hgt
}

function passendeSkalierung(t) {
  let s = 1
  while (s > 0.6 && geschaetzteHoehe(t, s) > VERFUEGBAR) s -= 0.03
  return s
}

function metaBlock(label, werte, s) {
  if (!werte.length) return null
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: M.blockAbstand * s },
    h('div', { fontSize: M.label * s, fontWeight: 700 }, label),
    ...werte.map((w) => h('div', { fontSize: M.wert * s, lineHeight: 1.3 }, w)),
  )
}

function karte(event) {
  const [titel, untertitel] = titelTeile(event.title)
  const zeit = [event.date, event.time].map((s) => String(s || '').trim()).filter(Boolean).join(' · ')
  const bereinigt = (arr) => arr.map((z) => String(z || '').trim()).filter(Boolean)
  const meta = [
    // Name + Firma (CMS "Referent:in — Firma") als zweite Zeile, Absprache 2026-09-29.
    { label: 'Referent:in:', werte: bereinigt([event.speakerName, event.speakerCompany]) },
    { label: 'Zeit:', werte: bereinigt([zeit]) },
    { label: 'Ort:', werte: bereinigt(ortZeilen(event.location)) },
  ].filter((b) => b.werte.length)
  const s = passendeSkalierung({ titel, untertitel, meta })
  // Eventfarbe aus Pages CMS (Feld "Farbe"), Standard = NewBuild-Orange.
  const t = kartenToene(eventFarbe(event))
  return h(
    'div',
    { width: W, height: H, display: 'flex', padding: '15px 15px 16px', background: '#ffffff', fontFamily: 'Heros', color: '#111111' },
    h(
      'div',
      {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        textAlign: 'center',
        padding: '22px 28px 22px',
        border: `1.5px solid ${t.rand}`,
        color: t.text,
        borderRadius: 22,
        backgroundColor: t.basis,
        backgroundImage:
          `radial-gradient(60% 55% at 22% 100%, ${rgba(t.glanz, 0.85)}, ${rgba(t.glanz, 0)} 70%), ` +
          `radial-gradient(55% 60% at 100% 55%, ${rgba(t.grau, 0.9)}, ${rgba(t.grau, 0)} 70%), ` +
          `linear-gradient(160deg, ${t.dunkel} 0%, ${t.basis} 35%, ${t.mittel} 65%, ${t.hell} 100%)`,
      },
      h('div', { fontSize: M.titel * s, fontWeight: 700, lineHeight: 1.2 }, titel),
      untertitel
        ? h('div', { fontSize: M.sub * s, lineHeight: 1.35, marginTop: M.subAbstand * s, maxWidth: 470 }, untertitel)
        : null,
      h(
        'div',
        { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: M.metaAbstand * s },
        ...meta.map((b) => metaBlock(b.label, b.werte, s)),
      ),
      h(
        'div',
        {
          marginTop: 'auto',
          width: 228,
          padding: '9px 0',
          borderRadius: 999,
          background: '#f8f8f8',
          border: `1px solid ${t.rand}`,
          color: '#111111',
          fontSize: 16,
          letterSpacing: 0.3,
          alignItems: 'center',
        },
        'GOOGLE MAPS',
      ),
    ),
  )
}

export function mailKarteDateiname(slug) {
  return `mail/${slug}-karte.png`
}

export async function generateMailCards() {
  const { events } = JSON.parse(readFileSync(join(root, 'src/content/events.json'), 'utf-8'))
  const dateien = []
  for (const event of events) {
    if (!event || !event.slug) continue
    const svg = await satori(karte(event), { width: W, height: H, fonts })
    const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE } }).render().asPng()
    dateien.push({ fileName: mailKarteDateiname(event.slug), source: png, event })
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Mail-Karten — NewBuild Kollektiv</title>
<style>body{margin:0;padding:32px 16px;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#ececea;color:#111}
h1{font-weight:500;margin:0 0 6px}p{margin:0 0 28px;color:#555}.k{max-width:600px;margin:0 auto 40px}
.k h2{font-size:1rem;font-weight:500;margin:0 0 8px}.k img{width:100%;height:auto;display:block}
.k a{color:#111;font-size:.9rem}main{max-width:600px;margin:0 auto}</style></head>
<body><main><h1>Mail-Karten</h1><p>Automatisch aus Pages CMS erzeugt — ändert sich mit jeder Änderung dort.</p>
${dateien
  .map(
    (d) => `<div class="k"><h2>${esc(d.event.number ? d.event.number + ' — ' : '')}${esc(d.event.title)}</h2>
<img src="/${d.fileName}" alt="" width="600" height="450"><a href="/${d.fileName}" download>PNG herunterladen</a></div>`,
  )
  .join('\n')}
</main></body></html>`
  dateien.push({ fileName: 'mail/index.html', source: html })
  return dateien
}
