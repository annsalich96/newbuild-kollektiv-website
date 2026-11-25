// Cloudflare Pages Function: /api/platzstatus?slug=<event-slug>
// Zwischenspeicher vor dem Apps Script (doGet ?action=platzstatus), damit der
// Ausgebucht-Hinweis auf der Eventseite sofort da ist statt nach 1-3 s
// aufzuploppen (Ann 2026-11-25). Liefert die letzte Antwort sofort aus und
// holt sie im Hintergrund neu, wenn sie aelter als 30 s ist. Nur Zahlen,
// keine Personendaten. Die eigentliche Entscheidung (Anmeldung/Warteliste)
// trifft weiter das Skript beim Absenden.
const GAS =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'
const FRISCH_MS = 30000

const antwort = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export async function onRequestGet({ request, waitUntil }) {
  const slug = new URL(request.url).searchParams.get('slug') || ''
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return antwort('{"ok":false}', 400)
  const cache = caches.default
  const key = new Request(`https://platzstatus.cache/${slug}`)

  const holen = async () => {
    const r = await fetch(`${GAS}?action=platzstatus&slug=${slug}`, { redirect: 'follow' })
    const body = await r.text()
    if (!JSON.parse(body).ok) throw new Error('Skript meldet Fehler')
    await cache.put(
      key,
      new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=604800', 'x-geholt': String(Date.now()) },
      }),
    )
    return body
  }

  const treffer = await cache.match(key)
  if (treffer) {
    if (Date.now() - Number(treffer.headers.get('x-geholt') || 0) > FRISCH_MS) waitUntil(holen().catch(() => {}))
    return antwort(await treffer.text())
  }
  try {
    return antwort(await holen())
  } catch {
    return antwort('{"ok":false}', 502)
  }
}
