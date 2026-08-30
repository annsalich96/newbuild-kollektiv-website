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
// Haengt automatisch unter JEDE Mail an Teilnehmer:innen (Bestaetigung + alle
// Erinnerungen). NUR HIER anpassen. Fuer eine Signatur mit Logo muss das Bild
// online liegen (z.B. https://newbuild-kollektiv.com/…png) und als
// <img src="…"> eingebunden werden — Anhaenge gehen bei Automatik-Mails nicht.
const SIGNATUR_HTML =
  '<br><br>' +
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#555">' +
  '<strong>Ann-Kathrin Salich</strong><br>' +
  'NewBuild Kollektiv<br>' +
  '<a href="mailto:request@newbuild-kollektiv.com" style="color:#555">request@newbuild-kollektiv.com</a><br>' +
  '<a href="https://newbuild-kollektiv.com" style="color:#555">newbuild-kollektiv.com</a>' +
  '</div>'

const SIGNATUR_TEXT =
  '\n\n--\n' +
  'Ann-Kathrin Salich\n' +
  'NewBuild Kollektiv\n' +
  'request@newbuild-kollektiv.com · newbuild-kollektiv.com'

// Stunde (0–23, Europe/Berlin), ab der die tagesbasierten Erinnerungen
// (1 Woche / 1 Tag / Nachfass) rausgehen. Der Trigger laeuft stuendlich,
// verschickt diese Stufen aber fruehestens ab dieser Uhrzeit.
const ERINNERUNG_SENDESTUNDE = 9

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
  const subject = 'Anmeldebestätigung: ' + data.eventTitle
  const html = wrapMail_(
    '<p>Hallo ' + escapeHtml_(data.firstName) + ',</p>' +
      '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
      eventBox_(data.eventTitle, data.eventDate, data.eventTime, data.eventLocation) +
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

function eventBox_(titel, datum, zeit, ort) {
  return (
    '<p style="margin:16px 0;padding:12px 16px;background:#f4f4f2;border-radius:8px">' +
    '<strong>' +
    escapeHtml_(titel) +
    '</strong><br>' +
    escapeHtml_(datum || '') +
    (zeit ? ' · ' + escapeHtml_(zeit) : '') +
    '<br>' +
    escapeHtml_(ort || '') +
    '</p>'
  )
}

// Verschickt eine Mail an eine:n Teilnehmer:in ueber den verifizierten
// "Senden als"-Alias (GmailApp, damit "from" gesetzt werden kann) und haengt
// automatisch die Signatur an — HTML plus Text-Fallback. Setzt voraus, dass
// SENDER_EMAIL in Gmail unter Einstellungen > Konten > "Senden als" als
// verifizierter Alias hinterlegt ist (sonst "Invalid sender email").
function sendeTeilnehmerMail_(to, subject, htmlBody) {
  GmailApp.sendEmail(to, subject, htmlToPlain_(htmlBody) + SIGNATUR_TEXT, {
    name: SENDER_NAME,
    from: SENDER_EMAIL,
    replyTo: SENDER_EMAIL,
    htmlBody: htmlBody + SIGNATUR_HTML,
  })
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
//  Offen: geschlechtsspezifische Anrede ("Liebe/Lieber"). Dafuer muesste das
//  Anmeldeformular ein Anrede-Feld bekommen — bis dahin: "Hallo {Vorname}".
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

  const kopf = werte[0]
  const iVorname = kopf.indexOf('Vorname')
  const iEmail = kopf.indexOf('E-Mail')
  const iStatus = kopf.indexOf('Status')
  const iDatum = kopf.indexOf('Event-Datum')
  const iZeit = kopf.indexOf('Event-Zeit')
  const iOrt = kopf.indexOf('Event-Ort')
  if (iEmail < 0 || iDatum < 0) return

  // Event-Datum/-Zeit/-Ort stehen in jeder Zeile gleich — aus Zeile 1 lesen.
  const eventStart = parseEventDatum_(werte[1][iDatum], iZeit >= 0 ? werte[1][iZeit] : '')
  if (!eventStart) return

  const m = String(sheetName).match(/^\s*.*?\s+—\s+(.+?)\s*$/)
  const eventTitel = m ? m[1] : String(sheetName).trim()
  const eventDatum = String(werte[1][iDatum] || '')
  const eventZeit = iZeit >= 0 ? String(werte[1][iZeit] || '') : ''
  const eventOrt = iOrt >= 0 ? String(werte[1][iOrt] || '') : ''

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
        vorname: iVorname >= 0 ? String(zeile[iVorname] || '').trim() : '',
        titel: eventTitel,
        datum: eventDatum,
        zeit: eventZeit,
        ort: eventOrt,
      })

      try {
        sendeTeilnehmerMail_(email, inhalt.subject, inhalt.htmlBody)
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

// Ganze Kalendertage zwischen heute und dem Zieltag. Laeuft in der
// Skript-Zeitzone — die muss auf Europe/Berlin stehen (Projekteinstellungen).
function tagesDifferenz_(jetzt, ziel) {
  const a = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
  const b = new Date(ziel.getFullYear(), ziel.getMonth(), ziel.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ── Mailtexte der einzelnen Stufen ────────────────────────────────────────
// Jede Funktion bekommt { vorname, titel, datum, zeit, ort } und gibt
// { subject, htmlBody } zurueck. Texte hier frei anpassbar; die Signatur
// wird automatisch angehaengt.

function mailEineWoche_(e) {
  return {
    subject: 'In einer Woche: NewBuild Kollektiv – ' + e.titel,
    htmlBody: wrapMail_(
      '<p>Hallo ' +
        escapeHtml_(e.vorname) +
        ',</p>' +
        '<p>in einer Woche ist es soweit – unser NewBuild Kollektiv Treffen, ' +
        'für das du dich angemeldet hast.</p>' +
        eventBox_(e.titel, e.datum, e.zeit, e.ort) +
        '<p>Hast du vorab Fragen oder Wünsche zum Thema? Antworte einfach auf diese Mail.</p>' +
        '<p>Bis bald!</p>',
    ),
  }
}

function mailEinTag_(e) {
  return {
    subject: 'Erinnerung NBK Treffen – ' + e.titel,
    htmlBody: wrapMail_(
      '<p>Hallo ' +
        escapeHtml_(e.vorname) +
        ',</p>' +
        '<p>morgen Abend findet unser NewBuild Kollektiv Treffen statt, für das ' +
        'du dich angemeldet hast.</p>' +
        '<p>Hier nochmal die Eckdaten zu deiner Übersicht:</p>' +
        eventBox_(e.titel, e.datum, e.zeit, e.ort) +
        '<p>Ich freue mich sehr auf den gemeinsamen Austausch mit dir.</p>' +
        '<p>Bis morgen!</p>' +
        '<p style="color:#666;font-size:13px;margin-top:24px">P.S.: Falls sich in ' +
        'deinem Terminkalender doch etwas geändert hat, wären wir dir dankbar, ' +
        'wenn du dich kurz abmeldest.</p>',
    ),
  }
}

function mailDreiStunden_(e) {
  return {
    subject: 'Heute Abend: NewBuild Kollektiv – ' + e.titel,
    htmlBody: wrapMail_(
      '<p>Hallo ' +
        escapeHtml_(e.vorname) +
        ',</p>' +
        '<p>in wenigen Stunden geht es los. Kurz das Wichtigste:</p>' +
        eventBox_(e.titel, e.datum, e.zeit, e.ort) +
        '<p>Bis später!</p>',
    ),
  }
}

function mailNachfass_(e) {
  return {
    subject: 'Danke fürs Kommen – NewBuild Kollektiv',
    htmlBody: wrapMail_(
      '<p>Hallo ' +
        escapeHtml_(e.vorname) +
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
