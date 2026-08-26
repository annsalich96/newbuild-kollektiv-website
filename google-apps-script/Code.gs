/**
 * NewBuild Kollektiv — Event-Anmeldesystem
 *
 * Nimmt Anmeldungen vom Website-Formular entgegen (POST als JSON), legt bei
 * Bedarf eine eigene Google-Sheets-Datei pro Event an, traegt die Anmeldung
 * dort ein und verschickt eine Bestaetigungsmail.
 *
 * Setup: siehe README.md im selben Ordner.
 */

const DRIVE_FOLDER_NAME = 'NewBuild Kollektiv — Event-Anmeldungen'
const EVENTS_SUBFOLDER_NAME = 'Events'
const HISTORY_SHEET_NAME = 'History Anmeldungen'
const SENDER_EMAIL = 'request@newbuild-kollektiv.com'
const SENDER_NAME = 'NewBuild Kollektiv'
const NOTIFY_EMAIL = 'request@newbuild-kollektiv.com'

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

    const sheet = getOrCreateEventSheet(data.eventNumber, data.eventTitle)
    appendRegistration(sheet, data)
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

function getOrCreateEventSheet(eventNumber, eventTitle) {
  const sheetName = (eventNumber ? eventNumber + ' — ' : '') + eventTitle
  const folder = getOrCreateEventsSubfolder()

  const files = folder.getFilesByName(sheetName)
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next()).getSheets()[0]
  }

  const spreadsheet = SpreadsheetApp.create(sheetName)
  moveFileIntoFolder(DriveApp.getFileById(spreadsheet.getId()), folder)

  const sheet = spreadsheet.getSheets()[0]
  sheet.appendRow(SHEET_HEADERS)
  sheet.setFrozenRows(1)
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
  const subject = 'Anmeldebestätigung: ' + data.eventTitle
  const body =
    'Hallo ' +
    data.firstName +
    ',\n\n' +
    'vielen Dank für deine Anmeldung zu folgendem Event:\n\n' +
    data.eventTitle +
    '\n' +
    'Datum: ' +
    (data.eventDate || '') +
    ', ' +
    (data.eventTime || '') +
    '\n' +
    'Ort: ' +
    (data.eventLocation || '') +
    '\n\n' +
    'Bei Rückfragen oder falls du doch nicht kannst, antworte einfach auf diese E-Mail.\n\n' +
    'Bis bald,\n' +
    'NewBuild Kollektiv'

  // GmailApp statt MailApp, weil nur GmailApp einen "from"-Alias erlaubt -
  // MailApp sendet immer von der Haupt-Kontoadresse. Setzt voraus, dass
  // SENDER_EMAIL in Gmail unter Einstellungen > Konten > "Senden als" als
  // verifizierter Alias hinterlegt ist, sonst wirft dieser Aufruf einen
  // Fehler ("Invalid sender email").
  GmailApp.sendEmail(data.email, subject, body, {
    name: SENDER_NAME,
    from: SENDER_EMAIL,
    replyTo: SENDER_EMAIL,
  })
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
