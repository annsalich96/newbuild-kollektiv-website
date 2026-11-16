// Allgemeine Einladungsmail pro Event zum Weiterleiten (Ann 2026-11-16):
// "eine allgemeine E-Mail, die ich anderen Leuten schicken kann, die sie
// dann in andere Verteiler teilen". Vorlage in Pages CMS
// (src/content/einladung.json, Platzhalter siehe .pages.yml), pro Event
// automatisch gefuellt:
//   /einladung/<slug>/   fertige Mail mit Karte + Kopier-Buttons fuer Gmail
//   /einladung/          Uebersicht (kommende Events zuerst)
// Kein Versand - Ann kopiert die Mail und schickt sie selbst.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mailKarteDateiname } from './generate-mail-cards.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://newbuild-kollektiv.com'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const titelTeile = (title) => {
  const t = String(title || '').trim()
  const i = t.indexOf(':')
  return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : [t, '']
}
const person = (name, firma) => [name, firma].map((s) => String(s || '').trim()).filter(Boolean)
const personText = ([name, firma]) => (firma ? `${name} (${firma})` : name || '')
const istModeration = (sp) => /moderation/i.test(String(sp.role || ''))
const zeitText = (t) => String(t || '').trim().replace(/\s*[-–—]\s*/g, '–')
const ersterSatz = (text) => {
  const absatz = String(text || '').trim().split(/\n\s*\n/)[0] || ''
  const m = absatz.match(/^.+?[.?!](?=\s|$)/s)
  return (m ? m[0] : absatz).trim()
}
// "Di., 20.10.2026" -> Date (fuer die Sortierung)
const datumWert = (d) => {
  const m = String(d || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0
}

function platzhalter(event) {
  const [kurz, unter] = titelTeile(event.title)
  const liste = Array.isArray(event.speakers) && event.speakers.length ? event.speakers : null
  let speaker, moderation
  if (liste && liste.length > 3) {
    speaker = liste.map((sp) => sp.name).filter(Boolean).join(', ')
    moderation = ''
  } else if (liste) {
    const join = (arr) => arr.map((sp) => personText(person(sp.name, sp.company))).filter(Boolean).join(' und ')
    speaker = join(liste.filter((sp) => !istModeration(sp)))
    moderation = join(liste.filter(istModeration))
  } else {
    speaker = personText(person(event.speakerName, event.speakerCompany))
    moderation = ''
  }
  return {
    Titel: String(event.title || '').trim(),
    Kurztitel: kurz,
    Untertitel: unter,
    Datum: String(event.date || '').trim(),
    Zeit: zeitText(event.time),
    Ort: String(event.location || '').trim(),
    Speaker: speaker,
    Moderation: moderation,
    Einstieg: ersterSatz(event.description),
    Link: `${SITE}/events/${event.slug}/`,
  }
}

// Zeilen, in denen ein Platzhalter leer bleibt, fallen weg (z.B.
// "Moderation: {Moderation}" bei Events ohne Moderation).
function fuellen(vorlage, werte) {
  return String(vorlage || '')
    .split('\n')
    .filter((zeile) => !/\{(\w+)\}/.test(zeile) || [...zeile.matchAll(/\{(\w+)\}/g)].every(([, k]) => k === 'Karte' || (werte[k] ?? '') !== ''))
    .map((zeile) => zeile.replace(/\{(\w+)\}/g, (m, k) => (k === 'Karte' ? m : (werte[k] ?? m))))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#111111">${u}</a>`)

function mailHtml(text, event) {
  const karte = `${SITE}/${mailKarteDateiname(event.slug, 'anmeldung')}`
  const link = `${SITE}/events/${event.slug}/`
  return text
    .split(/\n\s*\n/)
    .map((absatz) =>
      absatz.trim() === '{Karte}'
        ? `<p style="margin:0 0 16px"><a href="${link}"><img src="${karte}" alt="Einladung: ${esc(event.title)}, Anmeldung" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></p>`
        : `<p style="margin:0 0 16px">${absatz.split('\n').map(linkify).join('<br>')}</p>`,
    )
    .join('\n')
}

const mailText = (text, event) =>
  text.replace(/^\{Karte\}$/m, `Anmeldung und Infos: ${SITE}/events/${event.slug}/`).replace(/\n{3,}/g, '\n\n')

const SEITE_CSS = `body{margin:0;padding:32px 16px;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#ececea;color:#111}
main{max-width:680px;margin:0 auto}h1{font-weight:500;font-size:1.5rem;margin:0 0 6px}.hinweis{color:#555;margin:0 0 24px;line-height:1.5}
.box{background:#fff;border-radius:12px;padding:20px 22px;margin:0 0 20px}.label{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:0 0 6px}
.betreff{font-size:1.05rem;margin:0}.mail{font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5}
.knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}button{font:inherit;font-size:.9rem;padding:10px 16px;border-radius:999px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
button.zwei{background:#fff;color:#111}.ok{color:#2a7a3a;font-size:.9rem;min-height:1.2em;margin:0 0 12px}
ul{padding:0;list-style:none}li{margin:0 0 10px}a{color:#111}`

export function generateInvitations() {
  const { events } = JSON.parse(readFileSync(join(root, 'src/content/events.json'), 'utf-8'))
  const vorlage = JSON.parse(readFileSync(join(root, 'src/content/einladung.json'), 'utf-8'))
  const dateien = []
  const eintraege = []
  for (const event of events) {
    if (!event?.slug) continue
    const werte = platzhalter(event)
    const betreff = fuellen(vorlage.betreff, werte).replace(/\n/g, ' ').trim()
    const text = fuellen(vorlage.text, werte).trim()
    const html = mailHtml(text, event)
    const plain = mailText(text, event)
    eintraege.push({ event, betreff })
    dateien.push({
      fileName: `einladung/${event.slug}/index.html`,
      source: `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Einladung — ${esc(event.title)}</title><style>${SEITE_CSS}</style></head>
<body><main>
<p class="hinweis"><a href="/einladung/">← Alle Einladungen</a></p>
<h1>Einladungsmail zum Weiterleiten</h1>
<p class="hinweis">Automatisch aus Pages CMS erzeugt (Event + Vorlage „Einladungsmail“). „Mail kopieren“ und in Gmail einfügen – Text, Karte und Links bleiben erhalten. Die Karte ist auf die Anmeldeseite verlinkt.</p>
<div class="knoepfe"><button id="k-betreff" class="zwei">Betreff kopieren</button><button id="k-mail">Mail kopieren</button><button id="k-text" class="zwei">Nur Text kopieren</button></div>
<p class="ok" id="ok" aria-live="polite"></p>
<div class="box"><p class="label">Betreff</p><p class="betreff" id="betreff">${esc(betreff)}</p></div>
<div class="box"><div class="mail" id="mail">${html}</div></div>
</main>
<script>
const ok = document.getElementById('ok')
const zeige = (t) => { ok.textContent = t; setTimeout(() => (ok.textContent = ''), 2500) }
const plain = ${JSON.stringify(plain)}
const html = document.getElementById('mail').innerHTML
const kopiereText = (t, msg) => navigator.clipboard.writeText(t).then(() => zeige(msg), () => zeige('Kopieren nicht möglich – bitte markieren und kopieren.'))
document.getElementById('k-betreff').onclick = () => kopiereText(document.getElementById('betreff').textContent, 'Betreff kopiert.')
document.getElementById('k-text').onclick = () => kopiereText(plain, 'Text kopiert.')
document.getElementById('k-mail').onclick = async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })])
    zeige('Mail kopiert – jetzt in Gmail einfügen.')
  } catch (e) {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('mail'))
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    zeige(document.execCommand('copy') ? 'Mail kopiert – jetzt in Gmail einfügen.' : 'Bitte markierte Mail mit Cmd+C kopieren.')
  }
}
</script></body></html>`,
    })
  }
  const heute = new Date().setHours(0, 0, 0, 0)
  eintraege.sort((a, b) => {
    const da = datumWert(a.event.date), db = datumWert(b.event.date)
    const ka = da >= heute, kb = db >= heute
    return ka !== kb ? (ka ? -1 : 1) : ka ? da - db : db - da
  })
  dateien.push({
    fileName: 'einladung/index.html',
    source: `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Einladungen — NewBuild Kollektiv</title><style>${SEITE_CSS}</style></head>
<body><main><h1>Einladungsmails</h1>
<p class="hinweis">Pro Event eine fertige Mail zum Weiterleiten. Text ändern: Pages CMS → „Einladungsmail“ (gilt für alle Events).</p>
<div class="box"><ul>${eintraege
      .map(({ event, betreff }) => `<li><a href="/einladung/${event.slug}/">${esc(event.number ? event.number + ': ' : '')}${esc(event.title)}</a><br><span style="color:#555;font-size:.9rem">${esc(event.date)} · ${esc(betreff)}</span></li>`)
      .join('')}</ul></div></main></body></html>`,
  })
  return dateien
}
