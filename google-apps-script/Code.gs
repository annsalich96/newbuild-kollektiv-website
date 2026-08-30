/**
 * NewBuild Kollektiv — Event-Anmeldesystem
 *
 * Nimmt Anmeldungen vom Website-Formular entgegen (POST als JSON), legt bei
 * Bedarf eine eigene Google-Sheets-Datei pro Event an, traegt die Anmeldung
 * dort ein und verschickt eine Bestaetigungsmail.
 *
 * Ausserdem: automatische Erinnerungs-E-Mails vor/nach dem Event
 * (sendeErinnerungen, stuendlicher Zeit-Trigger — EINMALIG einrichten mit
 * erinnerungenTriggerEinrichten).
 *
 * Setup: siehe README.md im selben Ordner.
 */

const DRIVE_FOLDER_NAME = 'NewBuild Kollektiv — Event-Anmeldungen'
const EVENTS_SUBFOLDER_NAME = 'Events'
const HISTORY_SHEET_NAME = 'History Anmeldungen'
const SENDER_EMAIL = 'request@newbuild-kollektiv.com'
const SENDER_NAME = 'NewBuild Kollektiv'
const NOTIFY_EMAIL = 'request@newbuild-kollektiv.com'

// ── Signatur ────────────────────────────────────────────────────────────────
// Die Signatur wird NICHT hier gepflegt, sondern direkt aus Gmail gelesen:
// die "Senden als"-Signatur des Absenders (SENDER_EMAIL) im Konto, unter dem
// das Skript laeuft.
//
// WICHTIG bei mehreren Signaturen: Die Gmail-API kann Signaturen nicht per
// Name abrufen — nur die, die fuer die Adresse request@newbuild-kollektiv.com
// als Standard gesetzt ist. Also in Gmail > Einstellungen > Allgemein >
// Signatur > "Standardeinstellungen" fuer diese Adresse "CEO" auswaehlen
// (neue Mails UND Antworten/Weiterleitungen).
//
// Voraussetzung: erweiterter Dienst "Gmail API" im Apps-Script-Editor
// hinzufuegen (Services + -> Gmail API). Beim naechsten Deploy fragt Google
// zusaetzlich die Berechtigung "Gmail-Einstellungen lesen" ab.
//
// Falls das Auslesen fehlschlaegt/leer ist, greift dieser Fallback. Er ist die
// CEO-Signatur aus dem NBK-Postfach (Stand 30.08.2026) — bei Aenderung dort
// bitte auch hier nachziehen.
const SIGNATUR_HTML_FALLBACK =
  '<br><br>' +
  '<div style="font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#222222">' +
  '<p style="margin:0;font-size:20px"><b>Ann-Kathrin Salich</b></p>' +
  '<p style="margin:0;font-size:13px">Architektin - Berlin</p>' +
  '<p style="margin:0;font-size:13px">Inhaberin An(n) Architecture Solution</p>' +
  '<p style="margin:0;font-size:13px">Geschäftsführerin NewBuild Kollektiv</p>' +
  '<p style="margin:0;font-size:13px">&nbsp;</p>' +
  '<p style="margin:0;font-size:13px"><b>NewBuild Kollektiv</b></p>' +
  '<p style="margin:0;font-size:13px">Wilmersdorfer Str. 108-111</p>' +
  '<p style="margin:0;font-size:13px">10627 Berlin</p>' +
  '<p style="margin:0;font-size:13px">&nbsp;</p>' +
  '<p style="margin:0;font-size:13px"><a href="mailto:request@newbuild-kollektiv.com" style="color:#1155cc">request@newbuild-kollektiv.com</a></p>' +
  '<p style="margin:0;font-size:13px"><a href="https://newbuild-kollektiv.com" style="color:#1155cc">newbuild-kollektiv.com</a></p>' +
  '<p style="margin:0;font-size:13px"><a href="https://www.linkedin.com/company/newbuild-kollektiv/" style="color:#1155cc">LinkedIn</a></p>' +
  '</div>'
const SIGNATUR_TEXT_FALLBACK =
  '\n\n--\n' +
  'Ann-Kathrin Salich\n' +
  'Architektin - Berlin\n' +
  'Inhaberin An(n) Architecture Solution\n' +
  'Geschäftsführerin NewBuild Kollektiv\n\n' +
  'NewBuild Kollektiv\n' +
  'Wilmersdorfer Str. 108-111\n' +
  '10627 Berlin\n\n' +
  'request@newbuild-kollektiv.com\n' +
  'newbuild-kollektiv.com\n' +
  'https://www.linkedin.com/company/newbuild-kollektiv/'

// Liest die in Gmail hinterlegte Signatur des Absender-Alias. Ergebnis wird
// 1 h gecacht. Leerer String = keine Signatur / Lesen nicht moeglich.
function gmailSignaturRoh_() {
  const cache = CacheService.getScriptCache()
  const cached = cache.get('sendAsSignature')
  if (cached) return cached
  try {
    const eintraege = (Gmail.Users.Settings.SendAs.list('me').sendAs) || []
    const treffer =
      eintraege.filter(function (s) { return s.sendAsEmail === SENDER_EMAIL })[0] ||
      eintraege.filter(function (s) { return s.isDefault })[0]
    const sig = (treffer && treffer.signature) || ''
    if (sig) cache.put('sendAsSignature', sig, 3600)
    return sig
  } catch (err) {
    Logger.log('Gmail-Signatur nicht lesbar (Gmail-API-Dienst aktiviert?): ' + err)
    return ''
  }
}

function signaturHtml_() {
  const g = gmailSignaturRoh_()
  return g ? '<br><br>' + g : SIGNATUR_HTML_FALLBACK
}

function signaturText_() {
  const g = gmailSignaturRoh_()
  return g ? '\n\n--\n' + htmlToPlain_(g) : SIGNATUR_TEXT_FALLBACK
}

// Stunde (0–23, Europe/Berlin), ab der die tagesbasierten Erinnerungen
// (1 Woche / 1 Tag / Nachfass) rausgehen. Der Trigger laeuft stuendlich,
// verschickt diese Stufen aber fruehestens ab dieser Uhrzeit.
const ERINNERUNG_SENDESTUNDE = 9

// Vorlauf in Minuten fuer den "Zeit zum Aufbrechen"-Wecker in der
// Kalenderdatei (.ics), die der "1 Tag vorher"-Mail anhaengt.
const AUFBRUCH_VORLAUF_MIN = 90

const SHEET_HEADERS = [
  'Vorname',
  'Nachname',
  'E-Mail',
  'Unternehmen',
  'Unternehmensadresse',
  'Telefonnummer',
  'Newsletter',
  'Anmeldedatum',
  'Anmeldezeit',
  'Status',
  'Event-Datum',
  'Event-Zeit',
  'Event-Ort',
  'Erinnerung gesendet',
]

const HISTORY_HEADERS = [
  'Vorname',
  'Nachname',
  'E-Mail',
  'Unternehmen',
  'Unternehmensadresse',
  'Telefonnummer',
  'Newsletter',
  'Erste Anmeldung',
  'Letztes Event',
  'Anzahl Anmeldungen',
]

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)
    validateRegistration(data)
    data.phone = normalizePhone(data.phone)

    const sheet = getOrCreateEventSheet(data.eventSlug, data.eventNumber, data.eventTitle)
    appendRegistration(sheet, data)
    schreibeZusatzfelder_(sheet, data)
    upsertHistoryEntry(data)
    sendConfirmationEmail(data)
    sendAdminNotificationEmail(data)

    return jsonResponse({ ok: true })
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) })
  }
}

function validateRegistration(data) {
  const required = ['eventTitle', 'firstName', 'lastName', 'email']
  const missing = required.filter((key) => !data[key])
  if (missing.length > 0) {
    throw new Error('Fehlende Felder: ' + missing.join(', '))
  }
}

// Vereinheitlicht Telefonnummern unabhaengig vom Eingabeformat: entfernt
// Leerzeichen/Klammern/Bindestriche, wandelt "00" und fuehrende "0" (deutsche
// Nummern) in die "+"-Landesvorwahl-Schreibweise um. Damit landet im Sheet
// immer dasselbe Format, egal wie die Person es eingetippt hat.
function normalizePhone(rawPhone) {
  if (!rawPhone) return ''
  let phone = String(rawPhone).trim().replace(/[\s\-/().]/g, '')
  if (phone.startsWith('00')) {
    phone = '+' + phone.slice(2)
  } else if (phone.startsWith('0')) {
    phone = '+49' + phone.slice(1)
  }
  return phone
}

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME)
  if (folders.hasNext()) return folders.next()
  return DriveApp.createFolder(DRIVE_FOLDER_NAME)
}

// Unterordner "Events" innerhalb von DRIVE_FOLDER_NAME - dort liegen alle
// einzelnen Session-Tabellen. "History Anmeldungen" bleibt bewusst direkt im
// Hauptordner, nicht in diesem Unterordner (Absprache 2026-07-30).
function getOrCreateEventsSubfolder() {
  const parent = getOrCreateFolder()
  const subfolders = parent.getFoldersByName(EVENTS_SUBFOLDER_NAME)
  if (subfolders.hasNext()) return subfolders.next()
  return parent.createFolder(EVENTS_SUBFOLDER_NAME)
}

function moveFileIntoFolder(file, folder) {
  folder.addFile(file)
  DriveApp.getRootFolder().removeFile(file) // aus "Meine Ablage" raus, nur noch im Zielordner
}

// Findet die Event-Tabelle stabil ueber den Slug (aendert sich nie), NICHT
// mehr ueber den Anzeigenamen "Nummer — Titel". Frueher: sobald der Titel im
// CMS geaendert wurde, fand das Skript die alte Tabelle nicht mehr und legte
// eine zweite an. Jetzt wird Slug -> Datei-ID in den Skript-Eigenschaften
// gemerkt; der Dateiname wird bei Titelaenderung nur noch nachgezogen.
function getOrCreateEventSheet(eventSlug, eventNumber, eventTitle) {
  const folder = getOrCreateEventsSubfolder()
  const niceName = (eventNumber ? eventNumber + ' — ' : '') + eventTitle
  const props = PropertiesService.getScriptProperties()
  const propKey = eventSlug ? 'sheetId_' + eventSlug : null

  // 1. Bekannte Datei-ID fuer diesen Slug?
  if (propKey) {
    const knownId = props.getProperty(propKey)
    if (knownId) {
      try {
        const ss = SpreadsheetApp.openById(knownId)
        if (niceName && ss.getName() !== niceName) ss.rename(niceName)
        return ss.getSheets()[0]
      } catch (err) {
        props.deleteProperty(propKey) // Datei geloescht -> unten neu anlegen
      }
    }
  }

  // 2. Migration / Fallback: Datei mit dem Anzeigenamen existiert schon
  //    (aus der Zeit vor der Slug-Logik oder wenn kein Slug mitgeschickt wird).
  const byName = folder.getFilesByName(niceName)
  if (byName.hasNext()) {
    const file = byName.next()
    if (propKey) props.setProperty(propKey, file.getId())
    return SpreadsheetApp.open(file).getSheets()[0]
  }

  // 3. Neu anlegen.
  const spreadsheet = SpreadsheetApp.create(niceName)
  moveFileIntoFolder(DriveApp.getFileById(spreadsheet.getId()), folder)
  const sheet = spreadsheet.getSheets()[0]
  sheet.appendRow(SHEET_HEADERS)
  sheet.setFrozenRows(1)
  if (propKey) props.setProperty(propKey, spreadsheet.getId())
  return sheet
}

function getOrCreateHistorySpreadsheet() {
  const folder = getOrCreateFolder()

  const files = folder.getFilesByName(HISTORY_SHEET_NAME)
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next())
  }

  const spreadsheet = SpreadsheetApp.create(HISTORY_SHEET_NAME)
  moveFileIntoFolder(DriveApp.getFileById(spreadsheet.getId()), folder)

  const sheet = spreadsheet.getSheets()[0]
  sheet.appendRow(HISTORY_HEADERS)
  sheet.setFrozenRows(1)
  return spreadsheet
}

// Traegt eine Person in "History Anmeldungen" ein oder aktualisiert sie,
// falls die E-Mail-Adresse dort schon vorkommt (Gross-/Kleinschreibung und
// Leerzeichen werden dabei ignoriert) - so bleibt jede Person nur einmal
// gelistet, auch wenn sie sich fuer mehrere Events oder mehrfach fuer
// dasselbe Event angemeldet hat.
function upsertHistoryEntry(data) {
  const sheet = getOrCreateHistorySpreadsheet().getSheets()[0]
  const email = String(data.email).trim().toLowerCase()
  const eventLabel = (data.eventNumber ? data.eventNumber + ' — ' : '') + data.eventTitle

  const values = sheet.getDataRange().getValues()
  const emailCol = HISTORY_HEADERS.indexOf('E-Mail')
  const countCol = HISTORY_HEADERS.indexOf('Anzahl Anmeldungen')
  const lastEventCol = HISTORY_HEADERS.indexOf('Letztes Event')

  for (let row = 1; row < values.length; row++) {
    if (String(values[row][emailCol]).trim().toLowerCase() === email) {
      const sheetRow = row + 1 // 1-basiert + Header-Zeile
      sheet.getRange(sheetRow, lastEventCol + 1).setValue(eventLabel)
      sheet.getRange(sheetRow, countCol + 1).setValue((Number(values[row][countCol]) || 0) + 1)
      return
    }
  }

  const now = new Date()
  sheet.appendRow([
    data.firstName,
    data.lastName,
    data.email,
    data.company || '',
    data.companyAddress || '',
    data.phone || '',
    data.newsletter ? 'Ja' : 'Nein',
    Utilities.formatDate(now, 'Europe/Berlin', 'dd.MM.yyyy'),
    eventLabel,
    1,
  ])
}

function appendRegistration(sheet, data) {
  const now = new Date()
  sheet.appendRow([
    data.firstName,
    data.lastName,
    data.email,
    data.company || '',
    data.companyAddress || '',
    data.phone || '',
    data.newsletter ? 'Ja' : 'Nein',
    Utilities.formatDate(now, 'Europe/Berlin', 'dd.MM.yyyy'),
    Utilities.formatDate(now, 'Europe/Berlin', 'HH:mm'),
    'angemeldet',
    data.eventDate || '',
    data.eventTime || '',
    data.eventLocation || '',
    'Nein',
  ])
}

function sendConfirmationEmail(data) {
  const subject = 'Anmeldebestätigung: ' + kurzTitel_(data.eventTitle)
  const html = wrapMail_(
    grafikBlock_(data.eventSlug, 'erinnerung') +
      '<p>' + escapeHtml_(anrede_(data.anrede, data.firstName)) + ',</p>' +
      '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
      eventBox_(data.eventTitle, data.eventSpeaker, data.eventDate, data.eventTime, data.eventLocation) +
      '<p>Bei Rückfragen oder falls du doch nicht kannst, antworte einfach auf diese E-Mail.</p>' +
      '<p>Bis bald,<br>NewBuild Kollektiv</p>',
  )
  sendeTeilnehmerMail_(data.email, subject, html)
}

// Alle Anmeldungen fuer dasselbe Event landen in einem einzigen Mail-Thread
// statt in einer neuen Mail pro Anmeldung: existiert schon ein Thread mit
// diesem Betreff, wird als Antwort hineingehaengt (thread.reply setzt die
// noetigen References/In-Reply-To-Header fuer sauberes Threading);
// andernfalls startet die erste Anmeldung den Thread.
// Braucht GmailApp.search(), also einen groesseren Autorisierungs-Scope als
// nur "E-Mails senden" - beim naechsten Deploy erscheint dafuer ggf. erneut
// die Berechtigungs-Abfrage, das ist normal.
function sendAdminNotificationEmail(data) {
  const subject = 'Neue Anmeldung: ' + data.eventTitle
  const body =
    data.firstName +
    ' ' +
    data.lastName +
    '\n' +
    'E-Mail: ' +
    data.email +
    '\n' +
    (data.company ? 'Unternehmen: ' + data.company + '\n' : '') +
    (data.phone ? 'Telefon: ' + data.phone + '\n' : '') +
    'Newsletter: ' +
    (data.newsletter ? 'Ja' : 'Nein') +
    '\n\n' +
    'Termin: ' +
    (data.eventDate || '') +
    ', ' +
    (data.eventTime || '')

  const escapedSubject = subject.replace(/"/g, '')
  const threads = GmailApp.search('to:' + NOTIFY_EMAIL + ' subject:"' + escapedSubject + '"', 0, 1)

  if (threads.length > 0) {
    threads[0].reply(body, { name: SENDER_NAME, from: SENDER_EMAIL })
  } else {
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, {
      name: SENDER_NAME,
      from: SENDER_EMAIL,
    })
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIL-BAUSTEINE (Signatur, HTML-Rahmen)
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Grober HTML->Text-Fallback fuer Mailclients ohne HTML-Darstellung.
function htmlToPlain_(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function wrapMail_(innerHtml) {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
    'line-height:1.6;color:#111">' +
    innerHtml +
    '</div>'
  )
}

function eventBox_(titel, referent, datum, zeit, ort) {
  return (
    '<p style="margin:16px 0;padding:12px 16px;background:#f4f4f2;border-radius:8px">' +
    '<strong>' +
    escapeHtml_(titel) +
    '</strong><br>' +
    (referent ? 'Referent:in: ' + escapeHtml_(referent) + '<br>' : '') +
    escapeHtml_(datum || '') +
    (zeit ? ' · ' + escapeHtml_(zeit) : '') +
    '<br>' +
    escapeHtml_(ort || '') +
    (ort ? '<br><a href="' + mapsLink_(ort) + '" style="color:#3d5a80">In Google Maps öffnen</a>' : '') +
    '</p>'
  )
}

function mapsLink_(ort) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(ort || ''))
}

// ── Eventgrafiken (von Codex, Quelle: assets/mail/manifest.json) ──────────────
// Beim Veroeffentlichen einer neuen Grafik hier den Eintrag ergaenzen:
//   slug -> variant -> { url: oeffentliche PNG-URL, href: Klickziel (z.B. Maps) }
const GRAFIKEN = {
  'session-01-ki-belohnt-ordnung': {
    erinnerung: {
      url: 'https://newbuild-kollektiv.com/mail/session-01-ki-belohnt-ordnung-erinnerung-maps.png',
      href: 'https://www.google.com/maps/search/?api=1&query=Projo%20Berlin%2C%20Chausseestra%C3%9Fe%20123%2C%2010115%20Berlin',
    },
  },
}

// Klickbarer Grafikblock (ganzes Bild -> href) fuer eine Mailstufe.
// Leerer String, wenn fuer slug/variant keine Grafik hinterlegt ist.
function grafikBlock_(slug, variant) {
  const g = GRAFIKEN[String(slug || '')] && GRAFIKEN[String(slug || '')][variant]
  if (!g || !g.url) return ''
  const img =
    '<img src="' + g.url + '" width="600" alt="Eventgrafik" ' +
    'style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:12px">'
  return (
    '<p style="margin:0 0 18px">' +
    (g.href ? '<a href="' + g.href + '" target="_blank">' + img + '</a>' : img) +
    '</p>'
  )
}

// Kurzform des Titels fuer Betreffzeilen: alles vor dem ersten ":".
function kurzTitel_(t) {
  const s = String(t || '')
  const i = s.indexOf(':')
  return (i > 0 ? s.slice(0, i) : s).trim()
}

// Verschickt eine Mail an eine:n Teilnehmer:in ueber den verifizierten
// "Senden als"-Alias (GmailApp, damit "from" gesetzt werden kann) und haengt
// automatisch die Signatur an — HTML plus Text-Fallback. Optional: attachments
// (Array von Blobs, z.B. die .ics-Datei). Setzt voraus, dass SENDER_EMAIL in
// Gmail unter Einstellungen > Konten > "Senden als" als verifizierter Alias
// hinterlegt ist (sonst "Invalid sender email").
function sendeTeilnehmerMail_(to, subject, htmlBody, attachments) {
  const opts = {
    name: SENDER_NAME,
    from: SENDER_EMAIL,
    replyTo: SENDER_EMAIL,
    htmlBody: htmlBody + signaturHtml_(),
  }
  if (attachments && attachments.length) opts.attachments = attachments
  GmailApp.sendEmail(to, subject, htmlToPlain_(htmlBody) + signaturText_(), opts)
}

// Kalenderdatei (.ics) fuer die "1 Tag vorher"-Mail. Enthaelt einen
// DISPLAY-Wecker AUFBRUCH_VORLAUF_MIN Minuten vor Beginn ("Zeit zum
// Aufbrechen"). Zeiten als UTC (Z) — Apps Script rechnet die Zeitzone korrekt.
function icsDatei_(titel, start, ende, ort) {
  const utc = function (d) { return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'") }
  const esc = function (s) {
    return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n')
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NewBuild Kollektiv//Erinnerung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + Utilities.getUuid() + '@newbuild-kollektiv.com',
    'DTSTAMP:' + utc(new Date()),
    'DTSTART:' + utc(start),
    'DTEND:' + utc(ende),
    'SUMMARY:' + esc('NewBuild Kollektiv – ' + titel),
    'LOCATION:' + esc(ort),
    'DESCRIPTION:' + esc('NewBuild Kollektiv Treffen. Plane deine Anfahrt ein – der Wecker erinnert dich rechtzeitig ans Aufbrechen.'),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + esc('Zeit zum Aufbrechen – NewBuild Kollektiv'),
    'TRIGGER:-PT' + AUFBRUCH_VORLAUF_MIN + 'M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return Utilities.newBlob(lines.join('\r\n'), 'text/calendar; charset=utf-8; method=PUBLISH', 'newbuild-kollektiv.ics')
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTOMATISCHE ERINNERUNGS-E-MAILS
//
//  sendeErinnerungen() laeuft stuendlich (Zeit-Trigger — EINMALIG einrichten
//  mit erinnerungenTriggerEinrichten). Geht jede Event-Tabelle im Unterordner
//  "Events" durch und verschickt pro Anmeldung:
//     1 Woche vorher · 1 Tag vorher · ~3 Stunden vorher · 1 Tag danach
//  Jede Stufe hat ihre eigene Status-Spalte in der Tabelle; keine Mail geht
//  doppelt raus. Fehlt eine Status-Spalte, wird sie automatisch angelegt.
//
//  Anrede: "Liebe/Lieber" kommt aus der Spalte "Anrede" (w/m) der Tabelle;
//  ist sie leer, wird "Hallo {Vorname}" verwendet. Die Spalte fuellst du von
//  Hand (Spalten einmalig anlegen mit zusatzspaltenJetztAnlegen) — oder spaeter
//  automatisch, sobald das Anmeldeformular ein Anrede-Feld mitschickt.
// ═══════════════════════════════════════════════════════════════════════════

// EINMALIG im Editor ausfuehren: richtet den stuendlichen Trigger fuer
// sendeErinnerungen ein (ein evtl. vorhandener gleicher Trigger wird ersetzt).
function erinnerungenTriggerEinrichten() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'sendeErinnerungen'
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t)
    })
  ScriptApp.newTrigger('sendeErinnerungen').timeBased().everyHours(1).create()
  Logger.log('OK — "sendeErinnerungen" laeuft ab jetzt stuendlich.')
}

// EINMALIG im Editor ausfuehren: legt in jeder bestehenden Event-Tabelle die
// Spalten "Anrede" und "Referent" an. "Anrede" fuellst du mit w / m (leer ->
// "Hallo {Vorname}"), "Referent" mit dem Namen der Referentin / des Referenten
// (ein Wert pro Tabelle genuegt).
function zusatzspaltenJetztAnlegen() {
  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)
  const namen = []
  while (files.hasNext()) {
    const ss = SpreadsheetApp.open(files.next())
    ensureColumn_(ss.getSheets()[0], 'Anrede')
    ensureColumn_(ss.getSheets()[0], 'Referent')
    ensureColumn_(ss.getSheets()[0], 'Slug')
    namen.push(ss.getName())
  }
  Logger.log('Spalten "Anrede" + "Referent" + "Slug" angelegt/geprueft: ' + namen.join(' · '))
}

function sendeErinnerungen() {
  const jetzt = new Date()
  const stunde = Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'H'))
  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)

  while (files.hasNext()) {
    const file = files.next()
    try {
      const ss = SpreadsheetApp.open(file)
      verarbeiteEventTabelle_(ss.getSheets()[0], ss.getName(), jetzt, stunde)
    } catch (err) {
      Logger.log('Erinnerung — Fehler bei "' + file.getName() + '": ' + err)
    }
  }
}

function verarbeiteEventTabelle_(sheet, sheetName, jetzt, stunde) {
  const werte = sheet.getDataRange().getValues()
  if (werte.length < 2) return

  // "Anrede", "Referent", "Slug" pflegst du von Hand — Spalten hier sicherstellen.
  ensureColumn_(sheet, 'Anrede')
  ensureColumn_(sheet, 'Referent')
  ensureColumn_(sheet, 'Slug')

  const kopf = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const iVorname = kopf.indexOf('Vorname')
  const iEmail = kopf.indexOf('E-Mail')
  const iStatus = kopf.indexOf('Status')
  const iDatum = kopf.indexOf('Event-Datum')
  const iZeit = kopf.indexOf('Event-Zeit')
  const iOrt = kopf.indexOf('Event-Ort')
  const iAnrede = kopf.indexOf('Anrede')
  const iReferent = kopf.indexOf('Referent')
  const iSlug = kopf.indexOf('Slug')
  if (iEmail < 0 || iDatum < 0) return

  // Event-Datum/-Zeit/-Ort/-Referent/-Slug sind pro Tabelle gleich — ersten
  // befuellten Wert der jeweiligen Spalte nehmen.
  const eventDatum = ersterWert_(werte, iDatum)
  const eventZeit = ersterWert_(werte, iZeit)
  const eventOrt = ersterWert_(werte, iOrt)
  const eventReferent = ersterWert_(werte, iReferent)
  const eventSlug = ersterWert_(werte, iSlug)

  const eventStart = parseEventDatum_(eventDatum, eventZeit)
  if (!eventStart) return
  const eventEnde = parseEventEnde_(eventStart, eventZeit)

  const m = String(sheetName).match(/^\s*.*?\s+—\s+(.+?)\s*$/)
  const eventTitel = m ? m[1] : String(sheetName).trim()

  const tageBis = tagesDifferenz_(jetzt, eventStart)
  const stundenBis = (eventStart.getTime() - jetzt.getTime()) / 3600000

  ERINNERUNG_STUFEN.forEach(function (stufe) {
    const faellig =
      stufe.modus === 'tage'
        ? tageBis === stufe.wert && stunde >= ERINNERUNG_SENDESTUNDE
        : stundenBis > 0 && stundenBis <= stufe.wert
    if (!faellig) return

    const spalte = ensureColumn_(sheet, stufe.spalte)

    for (let r = 1; r < werte.length; r++) {
      const zeile = werte[r]
      const email = String(zeile[iEmail] || '').trim()
      if (!email) continue
      if (iStatus >= 0 && /abgemeldet|storniert|abgesagt/i.test(String(zeile[iStatus] || ''))) continue
      if (zeile[spalte - 1]) continue // in dieser Stufe schon verschickt
      if (MailApp.getRemainingDailyQuota() < 2) {
        Logger.log('Erinnerung — Tageskontingent erschoepft, Rest folgt beim naechsten Lauf.')
        return
      }

      const inhalt = stufe.bauen({
        anrede: anrede_(
          iAnrede >= 0 ? zeile[iAnrede] : '',
          iVorname >= 0 ? zeile[iVorname] : '',
        ),
        slug: eventSlug,
        titel: eventTitel,
        referent: eventReferent,
        datum: eventDatum,
        zeit: eventZeit,
        ort: eventOrt,
        start: eventStart,
        ende: eventEnde,
      })

      try {
        sendeTeilnehmerMail_(email, inhalt.subject, inhalt.htmlBody, inhalt.attachments)
        sheet
          .getRange(r + 1, spalte)
          .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
        SpreadsheetApp.flush()
        Utilities.sleep(300)
      } catch (err) {
        sheet.getRange(r + 1, spalte).setValue('FEHLER: ' + err)
      }
    }
  })
}

// "Erinnerung 1 Tag" -> Spaltennummer (1-basiert); legt die Spalte an, falls
// sie in dieser Tabelle noch fehlt (aeltere Tabellen kennen sie noch nicht).
function ensureColumn_(sheet, headerName) {
  const letzte = Math.max(1, sheet.getLastColumn())
  const kopf = sheet.getRange(1, 1, 1, letzte).getValues()[0]
  const idx = kopf.indexOf(headerName)
  if (idx >= 0) return idx + 1
  const neu = letzte + 1
  sheet.getRange(1, neu).setValue(headerName)
  SpreadsheetApp.flush()
  return neu
}

// Baut aus "Di., 04.03.2026" + "18:30–20:00" ein Date-Objekt: nimmt die erste
// TT.MM.JJJJ- und die erste HH:MM-Angabe. Ohne Uhrzeit: 18:00 Uhr.
function parseEventDatum_(datumText, zeitText) {
  const d = String(datumText || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!d) return null
  const t = String(zeitText || '').match(/(\d{1,2}):(\d{2})/)
  return new Date(
    Number(d[3]),
    Number(d[2]) - 1,
    Number(d[1]),
    t ? Number(t[1]) : 18,
    t ? Number(t[2]) : 0,
    0,
  )
}

// Endzeitpunkt: zweite HH:MM-Angabe in "18:30–20:00", sonst Start + 2 h.
function parseEventEnde_(start, zeitText) {
  const alle = String(zeitText || '').match(/(\d{1,2}):(\d{2})/g)
  if (alle && alle.length >= 2) {
    const p = alle[1].split(':')
    const ende = new Date(start.getTime())
    ende.setHours(Number(p[0]), Number(p[1]), 0, 0)
    if (ende.getTime() <= start.getTime()) ende.setDate(ende.getDate() + 1)
    return ende
  }
  return new Date(start.getTime() + 2 * 3600000)
}

// Erster nicht-leerer Wert einer Spalte (ueber alle Datenzeilen). -1 -> "".
function ersterWert_(werte, col) {
  if (col < 0) return ''
  for (let r = 1; r < werte.length; r++) {
    const v = String(werte[r][col] == null ? '' : werte[r][col]).trim()
    if (v) return v
  }
  return ''
}

// Ganze Kalendertage zwischen heute und dem Zieltag. Laeuft in der
// Skript-Zeitzone — die muss auf Europe/Berlin stehen (Projekteinstellungen).
function tagesDifferenz_(jetzt, ziel) {
  const a = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
  const b = new Date(ziel.getFullYear(), ziel.getMonth(), ziel.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ── Anrede ────────────────────────────────────────────────────────────────
// Normalisiert den Wert der Spalte "Anrede" auf 'w' / 'm' / '' (leer).
function anredeCode_(roh) {
  const a = String(roh || '').trim().toLowerCase()
  if (a === 'w' || a === 'f' || a === 'frau' || a === 'weiblich') return 'w'
  if (a === 'm' || a === 'herr' || a === 'maennlich' || a === 'männlich') return 'm'
  return ''
}

// "Liebe Maria" / "Lieber Markus" / "Hallo Alex" je nach Anrede-Code.
function anrede_(roh, vorname) {
  const v = String(vorname || '').trim()
  const c = anredeCode_(roh)
  if (c === 'w') return 'Liebe ' + v
  if (c === 'm') return 'Lieber ' + v
  return 'Hallo ' + v
}

// Schreibt Zusatzfelder (Anrede-Code, Referent) in die zuletzt angehaengte
// Zeile. Beide Spalten werden bei Bedarf angelegt. Solange das Formular diese
// Felder nicht mitsendet, bleiben die Zellen leer und werden von Hand gepflegt.
function schreibeZusatzfelder_(sheet, data) {
  const row = sheet.getLastRow()
  sheet.getRange(row, ensureColumn_(sheet, 'Anrede')).setValue(anredeCode_(data.anrede))
  if (data.eventSpeaker) {
    sheet.getRange(row, ensureColumn_(sheet, 'Referent')).setValue(String(data.eventSpeaker))
  }
  if (data.eventSlug) {
    sheet.getRange(row, ensureColumn_(sheet, 'Slug')).setValue(String(data.eventSlug))
  }
}

// ── Mailtexte der einzelnen Stufen ────────────────────────────────────────
// Jede Funktion bekommt { anrede, titel, referent, datum, zeit, ort, start,
// ende } und gibt { subject, htmlBody, attachments? } zurueck. Texte hier frei
// anpassbar; die Signatur wird automatisch angehaengt.

// 1 Woche vorher — bewusst schlank: nur Terminzeile, keine volle Eckdaten-Box.
function mailEineWoche_(e) {
  return {
    subject: 'In einer Woche: NewBuild Kollektiv – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>in einer Woche ist es soweit – unser NewBuild Kollektiv Treffen ' +
        '<strong>„' +
        escapeHtml_(e.titel) +
        '“</strong>' +
        (e.datum ? ', am ' + escapeHtml_(e.datum) : '') +
        (e.zeit ? ' um ' + escapeHtml_(e.zeit) + ' Uhr' : '') +
        '.</p>' +
        '<p>Die vollständigen Eckdaten und einen Kalendereintrag bekommst du ' +
        'am Vortag. Falls du vorab Fragen oder Wünsche zum Thema hast: ' +
        'antworte einfach auf diese Mail.</p>' +
        '<p>Bis bald!</p>',
    ),
  }
}

function mailEinTag_(e) {
  return {
    subject: 'Erinnerung NBK Treffen – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      grafikBlock_(e.slug, 'erinnerung') +
        '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>morgen Abend findet unser NewBuild Kollektiv Treffen statt, für das ' +
        'du dich angemeldet hast.</p>' +
        '<p>Hier nochmal die Eckdaten zu deiner Übersicht:</p>' +
        eventBox_(e.titel, e.referent, e.datum, e.zeit, e.ort) +
        '<p>Im Anhang findest du eine Kalenderdatei (.ics). Sie erinnert dich ' +
        AUFBRUCH_VORLAUF_MIN +
        ' Minuten vor Beginn ans Aufbrechen – Anfahrt bitte einplanen.</p>' +
        '<p>Ich freue mich sehr auf den gemeinsamen Austausch mit dir.</p>' +
        '<p>Bis morgen!</p>' +
        '<p style="color:#666;font-size:13px;margin-top:24px">P.S.: Falls sich in ' +
        'deinem Terminkalender doch etwas geändert hat, wären wir dir dankbar, ' +
        'wenn du dich kurz abmeldest.</p>',
    ),
    attachments: [icsDatei_(e.titel, e.start, e.ende, e.ort)],
  }
}

// ~3 h vorher — kurzer Absprung: Termin, Ort + Maps, Kalenderdatei.
function mailDreiStunden_(e) {
  return {
    subject: 'Gleich geht’s los: NewBuild Kollektiv – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>in wenigen Stunden geht es los' +
        (e.zeit ? ' – heute um ' + escapeHtml_(e.zeit) + ' Uhr' : '') +
        '.</p>' +
        (e.ort
          ? '<p><strong>' +
            escapeHtml_(e.ort) +
            '</strong><br>' +
            '<a href="' +
            mapsLink_(e.ort) +
            '" style="color:#3d5a80">In Google Maps öffnen</a></p>'
          : '') +
        '<p>Der Kalendereintrag hängt nochmal an. Bis gleich!</p>',
    ),
    attachments: [icsDatei_(e.titel, e.start, e.ende, e.ort)],
  }
}

function mailNachfass_(e) {
  return {
    subject: 'Danke fürs Kommen – NewBuild Kollektiv',
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>danke, dass du gestern beim NewBuild Kollektiv Treffen dabei warst – ' +
        'schön war es!</p>' +
        '<p>Wenn du magst: Über kurzes Feedback freuen wir uns sehr – antworte ' +
        'einfach auf diese Mail.</p>' +
        '<p>Bis zum nächsten Mal!</p>',
    ),
  }
}

const ERINNERUNG_STUFEN = [
  { spalte: 'Erinnerung 1 Woche', modus: 'tage', wert: 7, bauen: mailEineWoche_ },
  { spalte: 'Erinnerung 1 Tag', modus: 'tage', wert: 1, bauen: mailEinTag_ },
  { spalte: 'Erinnerung 3 Std', modus: 'stunden', wert: 3, bauen: mailDreiStunden_ },
  { spalte: 'Nachfass E-Mail', modus: 'tage', wert: -1, bauen: mailNachfass_ },
]

// ─────────────────────────────────────────────────────────────────────────────
//  TEST: schickt alle 5 Mails (Bestaetigung + 4 Erinnerungen) einmal an
//  TEST_EMPFAENGER. Aendert NICHTS an Tabellen oder Triggern. Betreff mit
//  "[TEST]" markiert. Funktion im Editor auswaehlen -> Ausfuehren.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_EMPFAENGER = 'salich@annarchitecture-studio.com'

function testErinnerungsmails() {
  const start = new Date(2026, 8, 1, 18, 30, 0) // 01.09.2026, 18:30
  const e = {
    anrede: anrede_('w', 'Ann-Kathrin'),
    slug: 'session-01-ki-belohnt-ordnung',
    titel: 'KI belohnt Ordnung: Wie Menschen und KI-Agenten in Planungsbüros zusammenarbeiten',
    referent: 'Markus Kolb, Bräunlin Kolb Architekten',
    datum: 'Di., 01.09.2026',
    zeit: '18:30–20:00',
    ort: 'Projo Berlin, Chausseestraße 123, 10115 Berlin',
    start: start,
    ende: new Date(start.getTime() + 90 * 60000),
  }

  const bestHtml = wrapMail_(
    grafikBlock_(e.slug, 'erinnerung') +
      '<p>' + escapeHtml_(e.anrede) + ',</p>' +
      '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
      eventBox_(e.titel, e.referent, e.datum, e.zeit, e.ort) +
      '<p>Bei Rückfragen oder falls du doch nicht kannst, antworte einfach auf diese E-Mail.</p>' +
      '<p>Bis bald,<br>NewBuild Kollektiv</p>',
  )
  sendeTeilnehmerMail_(TEST_EMPFAENGER, '[TEST] Anmeldebestätigung: ' + kurzTitel_(e.titel), bestHtml)
  Utilities.sleep(600)

  ERINNERUNG_STUFEN.forEach(function (stufe) {
    const m = stufe.bauen(e)
    sendeTeilnehmerMail_(TEST_EMPFAENGER, '[TEST] ' + m.subject, m.htmlBody, m.attachments)
    Utilities.sleep(600)
  })

  Logger.log('5 Test-Mails an ' + TEST_EMPFAENGER + ' verschickt.')
}
