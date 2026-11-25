// Platzstatus eines Events mit Teilnehmerlimit (CMS-Feld "maxTeilnehmer").
// Quelle: /api/platzstatus (Cloudflare-Zwischenspeicher, functions/api/
// platzstatus.js) - antwortet sofort; Fallback direkt beim Apps Script
// (lokale Entwicklung). Zusaetzlich merkt sich der Browser den letzten Stand
// (letzterPlatzStatus), damit der Hinweis bei erneutem Besuch ohne
// Verzoegerung steht. Die Entscheidung Anmeldung/Warteliste trifft immer das
// Skript beim Absenden - das hier steuert nur die Anzeige.
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

export type PlatzStatus = { ok: boolean; max: number; frei: number | null; warteliste: number; ausgebucht: boolean }

const speicherKey = (slug: string) => `nbk-platzstatus-${slug}`

export function letzterPlatzStatus(slug: string): PlatzStatus | null {
  try {
    const roh = localStorage.getItem(speicherKey(slug))
    return roh ? (JSON.parse(roh) as PlatzStatus) : null
  } catch {
    return null
  }
}

async function holeJson(url: string): Promise<PlatzStatus | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as PlatzStatus
    return data.ok ? data : null
  } catch {
    return null
  }
}

export async function ladePlatzStatus(slug: string): Promise<PlatzStatus | null> {
  const s =
    (await holeJson(`/api/platzstatus?slug=${encodeURIComponent(slug)}`)) ??
    (await holeJson(`${APPS_SCRIPT_URL}?action=platzstatus&slug=${encodeURIComponent(slug)}`))
  if (s) {
    try {
      localStorage.setItem(speicherKey(slug), JSON.stringify(s))
    } catch {
      /* privates Fenster o. ae. - egal */
    }
  }
  return s
}
