// Erzeugt pro Event eine Uebersicht aller automatischen Mails, gerendert mit
// dem echten Code aus google-apps-script/Code.gs (Bestaetigung, 1 Woche,
// 1 Tag, 3 Std, Rueckblick "war da" / "nicht da"): Versandzeitpunkt, Betreff,
// Mail mit Eventkarte, enthaltene Links und Kalenderdatei.
//
// Ablage im AI Portal:
//   02-NEWBUILD-KOLLEKTIV/03-projekte/EVENTS/<Event-Ordner>/Mail-Vorlagen.html
// (Ordner vorher mit "npm run event-ordner" anlegen.) Die Eventkarte wird als
// Bild eingebettet, die Datei funktioniert also auch offline.
//
// Aufruf (im Website-Ordner):  npm run mail-vorlagen [slug]
// Ohne slug: alle Events mit vorhandenem Ordner. Liest die Eventdaten live von
// newbuild-kollektiv.com/events.json - genau die Quelle, die auch das Skript nutzt.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repo = join(__dirname, '..')
const EVENTS_DIR = join(repo, '../../03-projekte/EVENTS')
const SITE = 'https://newbuild-kollektiv.com'

// ── Code.gs mit kleinen Platzhaltern fuer die Google-Dienste laden ──────────
const pad = (n) => String(n).padStart(2, '0')
const sandbox = {
  Utilities: {
    formatDate: (d, tz, f) =>
      tz === 'UTC'
        ? `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
        : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    getUuid: () => 'vorschau',
    base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64'),
    newBlob: (content, type, name) => ({ content, type, name }),
  },
  CacheService: { getScriptCache: () => ({ get: () => '1', put: () => {} }) },
  Logger: { log: () => {} },
}
vm.createContext(sandbox)
vm.runInContext(
  readFileSync(join(repo, 'google-apps-script/Code.gs'), 'utf-8') +
    // Top-level const sind sonst nicht von aussen sichtbar.
    '\nthis.AUFBRUCH_VORLAUF_MIN = AUFBRUCH_VORLAUF_MIN; this.SIGNATUR_HTML_FALLBACK = SIGNATUR_HTML_FALLBACK;',
  sandbox,
)
const gs = sandbox

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function links(html) {
  const out = []
  const re = /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, '').trim() || (m[2].includes('<img') ? 'Klick auf die Eventkarte' : '')
    const ziel = m[1].replace(/&amp;/g, '&')
    if (!out.some((l) => l.ziel === ziel && l.text === text)) out.push({ text, ziel })
  }
  return out
}

function zielName(url) {
  if (url.includes('google.com/maps')) return 'Google Maps'
  if (url.includes('do=abmelden')) return 'Abmeldeformular'
  if (url.includes('do=warda')) return '„Ich war da“ – setzt anwesend + schickt Rückblick'
  if (url.includes('do=feedback')) return 'Feedback-Formular'
  if (url.includes('do=referent')) return 'Referent:innen-Formular'
  if (url.includes('/events/')) return 'Eventseite'
  return url
}

async function karteDataUri(slug) {
  const res = await fetch(`${SITE}/mail/${slug}-karte.png`)
  const typ = res.headers.get('content-type') || ''
  if (!res.ok || !typ.startsWith('image/')) return null
  return `data:${typ};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
}

function stufen(e) {
  return [
    { name: 'Anmeldebestätigung', wann: 'Sofort nach der Anmeldung auf der Website', mail: gs.bestaetigungMail_(e) },
    { name: 'Erinnerung 1 Woche', wann: '7 Tage vorher, ab 9 Uhr', vorschau: '8 Tage vorher', mail: gs.mailEineWoche_(e) },
    { name: 'Erinnerung 1 Tag', wann: 'Am Vortag, ab 9 Uhr', vorschau: '2 Tage vorher', mail: gs.mailEinTag_(e) },
    { name: 'Erinnerung 3 Std', wann: 'Am Eventtag, ca. 3 Stunden vor Beginn', vorschau: 'am Vortag', mail: gs.mailDreiStunden_(e) },
    {
      name: 'Rückblick „war da“',
      wann: 'Am Tag nach dem Event, ab 9 Uhr – an alle, die eingecheckt haben (oder an alle, wenn der Check-in nicht genutzt wurde)',
      vorschau: 'am Eventtag',
      mail: gs.nachfassDaMail_(e),
    },
    {
      name: 'Rückblick „nicht da“',
      wann: 'Am Tag nach dem Event, ab 9 Uhr – an alle, die nicht eingecheckt haben',
      vorschau: 'am Eventtag',
      mail: gs.nachfassNichtDaMail_(e),
    },
  ]
}

function seite(ev, liste, karte) {
  const css = `
:root{--bg:#ececea;--ink:#111;--muted:rgba(17,17,17,.6);--line:#111;--paper:#fff;--soft:#f4f4f2;--accent:#3d5a80}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1b1a;--ink:#ececea;--muted:rgba(236,236,234,.6);--line:#ececea;--soft:#262625;--accent:#9db4d6;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1b1b1a;--ink:#ececea;--muted:rgba(236,236,234,.6);--line:#ececea;--soft:#262625;--accent:#9db4d6;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding-inline:20px;padding-block:40px 80px}
.eyebrow,.label{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;color:var(--muted)}
h1{font-weight:500;font-size:clamp(1.6rem,3.5vw,2.4rem);line-height:1.15;margin:.4rem 0 .6rem;text-wrap:balance}
.intro{max-width:68ch;color:var(--muted);margin:0}
.fakten{display:flex;flex-wrap:wrap;gap:8px 28px;margin:22px 0 0;padding:14px 0;border-block:2px solid var(--line)}
.fakten div{display:grid;gap:2px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 8px}
nav a{border:2px solid var(--line);border-radius:999px;padding:6px 14px;color:var(--ink);text-decoration:none;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}
nav a:hover,nav a:focus-visible{background:var(--ink);color:var(--bg);outline:none}
section{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:28px;padding-block:44px;border-top:2px solid var(--line)}
section:first-of-type{margin-top:28px}
@media (max-width:820px){section{grid-template-columns:minmax(0,1fr)}}
.meta{display:grid;gap:18px;align-content:start}
.meta h2{font-weight:500;font-size:1.35rem;margin:0}
.meta p{margin:0}
.betreff{font-weight:600}
ul{margin:4px 0 0;padding-left:18px}
li{margin:3px 0;overflow-wrap:anywhere}
.anhang{background:var(--soft);border-radius:8px;padding:10px 12px}
.anhang summary{cursor:pointer}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.45 ui-monospace,Menlo,monospace;margin:10px 0 0}
.mail{background:var(--paper);color:#111;border-radius:10px;box-shadow:0 1px 0 rgba(0,0,0,.06),0 10px 30px rgba(0,0,0,.08);overflow:hidden}
.mailkopf{padding:12px 18px;border-bottom:1px solid #e6e6e3;font-size:13px;color:#555;display:grid;gap:2px;background:#fafaf8}
.mailkopf b{color:#111}
.mailinhalt{padding:22px 22px 26px;overflow-x:auto}
.mailinhalt img{max-width:100%;height:auto}
.mailinhalt a{color:#3d5a80}
.hinweis{font-size:.85rem;color:var(--muted)}
`
  const nav = liste.map((s, i) => `<a href="#m${i}">${esc(s.name)}</a>`).join('')
  const sections = liste
    .map((s, i) => {
      const html = s.mail.htmlBody.replace(new RegExp(`${SITE}/mail/${ev.slug}-karte\\.png`, 'g'), karte || `${SITE}/mail/${ev.slug}-karte.png`)
      const ln = links(s.mail.htmlBody)
      const ics = (s.mail.attachments || [])[0]
      return `<section id="m${i}">
  <div class="meta">
    <div><div class="label">Mail</div><h2>${esc(s.name)}</h2></div>
    <div><div class="label">Wann</div><p>${esc(s.wann)}</p>${s.vorschau ? `<p class="hinweis">Vorschau an dich: ${esc(s.vorschau)}</p>` : ''}</div>
    <div><div class="label">Betreff</div><p class="betreff">${esc(s.mail.subject)}</p></div>
    <div><div class="label">Links in der Mail</div>${
      ln.length ? `<ul>${ln.map((l) => `<li>${esc(l.text)} → ${esc(zielName(l.ziel))}</li>`).join('')}</ul>` : '<p>keine</p>'
    }</div>
    <div><div class="label">Anhang</div>${
      ics
        ? `<details class="anhang"><summary>${esc(ics.name)} – Kalendereintrag mit Wecker ${gs.AUFBRUCH_VORLAUF_MIN} Min. vorher</summary><pre>${esc(ics.content)}</pre></details>`
        : '<p>keiner</p>'
    }</div>
  </div>
  <div class="mail">
    <div class="mailkopf"><span><b>Von:</b> NewBuild Kollektiv &lt;request@newbuild-kollektiv.com&gt;</span><span><b>An:</b> Beispielperson (Anrede aus der Anmeldung)</span><span><b>Betreff:</b> ${esc(s.mail.subject)}</span></div>
    <div class="mailinhalt">${html}${gs.SIGNATUR_HTML_FALLBACK}</div>
  </div>
</section>`
    })
    .join('\n')
  return `<title>Mail-Vorlagen ${esc(ev.number || '')}</title>
<style>${css}</style>
<div class="wrap">
  <div class="eyebrow">NewBuild Kollektiv · Automatische Mails</div>
  <h1>${esc(gs.kurzTitel_(ev.title))} – so sehen die Mails aus</h1>
  <p class="intro">Alle Mails, die das Anmeldesystem zu diesem Event verschickt, gerendert mit genau dem Code, der live läuft. Absender ist immer request@newbuild-kollektiv.com mit deiner Gmail-Signatur. Einen Tag vor jeder Erinnerung bekommst du sie als „[VORSCHAU]“ an salich@.</p>
  <div class="fakten">
    <div><span class="label">Termin</span><span>${esc(ev.date)} · ${esc(ev.time)}</span></div>
    <div><span class="label">Ort</span><span>${esc(ev.location)}</span></div>
    <div><span class="label">Referent:in</span><span>${esc(gs.referentText_(ev.speakerName, ev.speakerRole, ev.speakerCompany))}</span></div>
  </div>
  <nav>${nav}</nav>
  ${sections}
  <p class="hinweis">Erzeugt am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} mit „npm run mail-vorlagen“ aus google-apps-script/Code.gs.</p>
</div>`
}

function findeOrdner(slug) {
  if (!existsSync(EVENTS_DIR)) return null
  for (const name of readdirSync(EVENTS_DIR)) {
    const md = join(EVENTS_DIR, name, 'event.md')
    if (existsSync(md) && readFileSync(md, 'utf-8').includes(`\nslug: ${slug}\n`)) return join(EVENTS_DIR, name)
  }
  return null
}

const { events } = await (await fetch(`${SITE}/events.json?t=${Date.now()}`)).json()
const nurSlug = process.argv[2]
for (const ev of events) {
  if (nurSlug && ev.slug !== nurSlug) continue
  const ordner = findeOrdner(ev.slug)
  if (!ordner) {
    console.log(`– ${ev.slug}: kein Event-Ordner (erst "npm run event-ordner"), übersprungen`)
    continue
  }
  const start = gs.parseEventDatum_(ev.date, ev.time)
  const e = {
    anrede: gs.anrede_('w', 'Ann-Kathrin'),
    slug: ev.slug,
    sid: 'BEISPIEL',
    email: 'beispiel@newbuild-kollektiv.com',
    titel: ev.title,
    referent: gs.referentText_(ev.speakerName, ev.speakerRole, ev.speakerCompany),
    datum: gs.datumAnzeige_(ev.date),
    zeit: ev.time,
    ort: ev.location,
    start,
    ende: gs.parseEventEnde_(start, ev.time),
    checkinGenutzt: true,
    anwesend: true,
  }
  const datei = join(ordner, 'Mail-Vorlagen.html')
  writeFileSync(datei, seite(ev, stufen(e), await karteDataUri(ev.slug)))
  console.log(`✓ ${datei}`)
}
