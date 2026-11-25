// Platzstatus eines Events mit Teilnehmerlimit (CMS-Feld "maxTeilnehmer"),
// live aus dem Apps Script (google-apps-script/Code.gs, doGet
// ?action=platzstatus). Die Entscheidung Anmeldung/Warteliste trifft
// trotzdem immer das Skript beim Absenden - das hier steuert nur die Anzeige.
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

export type PlatzStatus = { ok: boolean; max: number; frei: number | null; warteliste: number; ausgebucht: boolean }

export async function ladePlatzStatus(slug: string): Promise<PlatzStatus | null> {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=platzstatus&slug=${encodeURIComponent(slug)}`)
    if (!res.ok) return null
    const data = (await res.json()) as PlatzStatus
    return data.ok ? data : null
  } catch {
    return null
  }
}
