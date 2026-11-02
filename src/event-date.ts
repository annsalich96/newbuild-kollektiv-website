// Vergangen = Event-Tag ist komplett vorbei. Wird im Browser beim Laden
// geprueft (nicht beim Build), damit Startseite ("View Past") und Eventseite
// (Galerie statt Anmeldung) am Tag nach dem Event von selbst umspringen, ohne
// neues Deployment. Datum kommt aus dem CMS-Feld "date" im Format
// "Di., 01.09.2026".
export const isPastEvent = (date: string) => {
  const match = date.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!match) return false
  const [, day, month, year] = match
  const dayAfter = new Date(Number(year), Number(month) - 1, Number(day) + 1)
  return Date.now() >= dayAfter.getTime()
}
