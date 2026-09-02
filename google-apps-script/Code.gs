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
const ERINNERUNG_SENDESTUNDE = 8

// Vorlauf in Minuten fuer den "Zeit zum Aufbrechen"-Wecker in der
// Kalenderdatei (.ics), die der "1 Tag vorher"-Mail anhaengt.
const AUFBRUCH_VORLAUF_MIN = 90

// Web-App-URL (endet auf /exec) — dieselbe, die das Anmeldeformular nutzt.
// Wird fuer die Abmelde-Links in den Mails gebraucht. Bleibt stabil, solange
// dieselbe Bereitstellung aktualisiert wird (nicht neu angelegt).
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbwEgvSlfjMQSsWu04p6r2lz8Pw4i-F3GOQPjqQGjoAPSDbXjuIGU5ei2I5voMJMBHNzUw/exec'

// Info-/Anmeldeseite eines Events auf der Website.
function eventSeiteUrl_(slug) {
  return slug ? 'https://newbuild-kollektiv.com/events/' + String(slug) + '/' : ''
}

// Formularseite auf der Website (funktioniert unabhaengig vom Google-Login,
// sendet im Hintergrund an dieses Skript). do = abmelden | checkin | feedback
// | referent | fotowiderspruch | fotoinfo
const SITE_FORM_URL = 'https://newbuild-kollektiv.com/f/'

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

    // Formulare von der Website (newbuild-kollektiv.com) — per fetch, damit
    // sie unabhaengig vom Google-Login funktionieren.
    if (data.action) {
      FORM_JSON = true
      try {
        if (data.action === 'abmelden') return jsonResponse(abmeldenVerarbeiten_(data))
        if (data.action === 'checkin') return jsonResponse(checkinVerarbeiten_(data))
        if (data.action === 'warda') return jsonResponse(wardaVerarbeiten_(data))
        if (data.action === 'feedback') return jsonResponse(feedbackVerarbeiten_(data))
        if (data.action === 'referent') return jsonResponse(referentVerarbeiten_(data))
        if (data.action === 'fotowiderspruch') return jsonResponse(fotoWiderspruchVerarbeiten_(data))
        return jsonResponse({ ok: false, html: '<h1>Unbekannt</h1><p>Aktion nicht erkannt.</p>' })
      } finally {
        FORM_JSON = false
      }
    }

    validateRegistration(data)
    data.phone = normalizePhone(data.phone)

    const sheet = getOrCreateEventSheet(data.eventSlug, data.eventNumber, data.eventTitle)
    appendRegistration(sheet, data)
    schreibeZusatzfelder_(sheet, data)
    if (data.checkin) markiereAnwesend_(sheet, data)
    upsertHistoryEntry(data)
    sendConfirmationEmail(data)
    sendAdminNotificationEmail(data)

    return jsonResponse({ ok: true })
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) })
  }
}

// GET-Router: Abmelde-Seite + Referent:innen-Formular (Links in den Mails).
function doGet(e) {
  const p = (e && e.parameter) || {}
  if (p.action === 'abmelden') return abmeldeFormular_(p)
  if (p.action === 'abmelden_ok') return abmeldenVerarbeiten_(p)
  if (p.action === 'referent') return referentFormular_(p)
  if (p.action === 'referent_ok') return referentVerarbeiten_(p)
  if (p.action === 'feedback') return feedbackFormular_(p)
  if (p.action === 'feedback_ok') return feedbackVerarbeiten_(p)
  if (p.action === 'fotowiderspruch') return fotoWiderspruchFormular_(p)
  if (p.action === 'fotowiderspruch_ok') return fotoWiderspruchVerarbeiten_(p)
  if (p.action === 'fotoinfo') return fotoInfoSeite_(p)
  if (p.action === 'checkin') return checkinFormular_(p)
  if (p.action === 'checkin_ok') return checkinVerarbeiten_(p)
  if (p.action === 'warda') return wardaVerarbeiten_(p)
  return HtmlService.createHtmlOutput(
    '<p style="font-family:Arial,Helvetica,sans-serif">NewBuild Kollektiv</p>',
  ).setTitle('NewBuild Kollektiv')
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
  // "Event-Datum"/-Zeit fest als Text formatieren. Sonst macht Sheets aus
  // z. B. "01.09.2026" einen echten Datumswert und der Erinnerungs-Parser
  // (parseEventDatum_) bekam ihn frueher nicht zu fassen -> Tabelle wurde
  // still uebersprungen, keine Erinnerungsmail.
  ;['Event-Datum', 'Event-Zeit'].forEach(function (name) {
    const c = SHEET_HEADERS.indexOf(name) + 1
    if (c > 0) sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@')
  })
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
    '<p>' + escapeHtml_(anrede_(data.anrede, data.firstName)) + ',</p>' +
      '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
      eckdatenBlock_({
        slug: data.eventSlug,
        titel: data.eventTitle,
        referent: data.eventSpeaker,
        datum: data.eventDate,
        zeit: data.eventTime,
        ort: data.eventLocation,
      }) +
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
  // Jeder schlichte <p> bekommt sichtbaren Abstand nach unten (Leerzeile
  // zwischen Absaetzen). Bereits inline gestylte <p style="…"> bleiben unberuehrt.
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
    'line-height:1.6;color:#111">' +
    String(innerHtml).replace(/<p>/g, '<p style="margin:0 0 18px">') +
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
      url: 'https://newbuild-kollektiv.com/mail/session-01-ki-belohnt-ordnung-erinnerung-maps-email-large-600.png',
      href: 'https://www.google.com/maps/search/?api=1&query=Projo%20Berlin%2C%20Chausseestra%C3%9Fe%20123%2C%2010115%20Berlin',
    },
  },
}

// Klickbarer, zentrierter Grafikblock (ganzes Bild -> href) fuer eine
// Mailstufe. Leerer String, wenn fuer slug/variant keine Grafik hinterlegt ist.
function grafikBlock_(slug, variant) {
  const g = GRAFIKEN[String(slug || '')] && GRAFIKEN[String(slug || '')][variant]
  if (!g || !g.url) return ''
  const img =
    '<img src="' + g.url + '" width="520" alt="Eventgrafik" ' +
    'style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;margin:0 auto">'
  return (
    '<div style="text-align:center;margin:16px 0 8px">' +
    (g.href ? '<a href="' + g.href + '" target="_blank">' + img + '</a>' : img) +
    '</div>'
  )
}

// Eckdaten-Block einer Mail: die zentrierte Eventgrafik (wenn vorhanden),
// sonst der graue Text-Kasten. Nach der Grafik eine kleine Zeile mit
// Datum/Ort/Maps als Fallback, falls Bilder im Client blockiert sind.
function eckdatenBlock_(e) {
  const g = grafikBlock_(e.slug, 'erinnerung')
  if (!g) return eventBox_(e.titel, e.referent, e.datum, e.zeit, e.ort)
  return (
    g +
    '<p style="text-align:center;color:#888;font-size:12px;margin:0 0 16px">' +
    escapeHtml_(e.datum || '') +
    (e.ort ? ' · ' + escapeHtml_(e.ort) : '') +
    (e.ort ? ' · <a href="' + mapsLink_(e.ort) + '" style="color:#3d5a80">Google Maps</a>' : '') +
    '</p>'
  )
}

// Kurzform des Titels fuer Betreffzeilen: alles vor dem ersten ":".
function kurzTitel_(t) {
  const s = String(t || '')
  const i = s.indexOf(':')
  return (i > 0 ? s.slice(0, i) : s).trim()
}

// ── Abmelde-Link / -Seite ───────────────────────────────────────────────────
// Link fuer eine Mail: fuehrt auf ein kleines Formular (Vor-/Nachname +
// Newsletter-Haken). sid = ID der Event-Tabelle (aus getParent().getId()),
// damit die Seite die richtige Tabelle sicher findet.
function abmeldeLink_(sid, slug, titel, email, datum) {
  return (
    SITE_FORM_URL +
    '?do=abmelden' +
    '&sid=' + encodeURIComponent(sid || '') +
    '&slug=' + encodeURIComponent(slug || '') +
    '&event=' + encodeURIComponent(kurzTitel_(titel) || 'das Event') +
    '&datum=' + encodeURIComponent(datum || '') +
    '&email=' + encodeURIComponent(email || '')
  )
}

// Link in der "Schade, dass du nicht da warst"-Mail: ein Klick setzt die
// Person (per E-Mail erkannt) auf anwesend und schickt ihr sofort den
// Rueckblick nach.
function wardaLink_(sid, slug, email) {
  return (
    SITE_FORM_URL +
    '?do=warda' +
    '&sid=' + encodeURIComponent(sid || '') +
    '&slug=' + encodeURIComponent(slug || '') +
    '&email=' + encodeURIComponent(email || '')
  )
}

function abmeldeSatz_(e) {
  return (
    '<p style="color:#666;font-size:13px;margin-top:20px">Du kannst doch nicht? ' +
    '<a href="' + abmeldeLink_(e.sid, e.slug, e.titel, e.email, e.datum) +
    '" style="color:#3d5a80">Hier abmelden.</a></p>'
  )
}

// Wenn true, geben die Verarbeiten-Funktionen ihr Ergebnis als Datenobjekt
// zurueck (fuer POST von der Website) statt als HtmlOutput (fuer doGet).
let FORM_JSON = false

// Rahmen im NewBuild-Kollektiv-Look (hellgrauer Formular-Bereich der Website:
// #ececea, Helvetica, schwarze 2px-Linien, Versal-Labels, Pillen-Button).
function abmeldeSeite_(inhaltHtml, titel) {
  if (FORM_JSON) return { ok: true, html: inhaltHtml, titel: titel || 'NewBuild Kollektiv' }
  const css =
    '*{box-sizing:border-box}html,body{margin:0}' +
    "body{background:#ececea;color:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;" +
    'font-weight:400;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh;' +
    'display:flex;align-items:center;justify-content:center;padding:40px 22px}' +
    '.card{width:100%;max-width:520px}' +
    'h1{font-weight:500;font-size:1.6rem;line-height:1.2;margin:0 0 6px}' +
    '.ev{color:rgba(17,17,17,.6);margin:0 0 30px}' +
    'p{margin:0 0 14px}' +
    'label{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;' +
    'color:rgba(17,17,17,.6);margin:22px 0 4px}' +
    'input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea{width:100%;' +
    'background:transparent;border:0;border-bottom:2px solid #111;padding:9px 0;font-size:1rem;' +
    "color:#111;border-radius:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}" +
    'textarea{min-height:88px;resize:vertical;line-height:1.4}' +
    'input:focus,textarea:focus{outline:none}' +
    '.q{margin-top:26px}' +
    '.q>.qt{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;' +
    'color:rgba(17,17,17,.6);margin-bottom:9px}' +
    '.opts{display:flex;flex-wrap:wrap;gap:9px 20px}' +
    '.opts label{display:flex;align-items:center;gap:7px;margin:0;text-transform:none;' +
    'letter-spacing:0;font-size:.95rem;color:#111;cursor:pointer}' +
    '.opts input{width:16px;height:16px;flex:none}' +
    '.cb{display:flex;gap:12px;align-items:flex-start;margin:26px 0 0;font-size:.95rem;' +
    'text-transform:none;letter-spacing:0;color:#111}' +
    '.cb input{margin-top:.2em;width:16px;height:16px;flex:none}' +
    'button{margin-top:32px;background:transparent;border:2px solid #111;border-radius:999px;' +
    'padding:13px 32px;font:inherit;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;' +
    'color:#111;cursor:pointer;transition:background .12s,color .12s}' +
    'button:hover{background:#111;color:#ececea}' +
    '.foot{margin-top:40px;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;' +
    'color:rgba(17,17,17,.45)}'
  // Fragment (kein <!doctype>/<html>/<head>) — HtmlService wickelt selbst ein
  // Dokument darum; ein komplettes Dokument kann in der Sandbox leer rendern.
  const out = HtmlService.createHtmlOutput(
    '<style>' + css + '</style><div class="card">' +
      inhaltHtml +
      '<p class="foot">NewBuild Kollektiv</p></div>',
  )
    .setTitle(titel || 'NewBuild Kollektiv')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
  return out
}

function abmeldeFormular_(p) {
  const event = p.event || 'das Treffen'
  const datum = p.datum || ''
  return abmeldeSeite_(
    '<h1>Vom Treffen abmelden</h1>' +
      '<p class="ev">' + escapeHtml_(event) + (datum ? ' · ' + escapeHtml_(datum) : '') + '</p>' +
      '<form method="get" action="' + WEBAPP_URL + '">' +
      '<input type="hidden" name="action" value="abmelden_ok">' +
      '<input type="hidden" name="sid" value="' + escapeHtml_(p.sid || '') + '">' +
      '<input type="hidden" name="slug" value="' + escapeHtml_(p.slug || '') + '">' +
      '<input type="hidden" name="event" value="' + escapeHtml_(event) + '">' +
      '<input type="hidden" name="datum" value="' + escapeHtml_(datum) + '">' +
      '<input type="hidden" name="email" value="' + escapeHtml_(p.email || '') + '">' +
      '<label>Vorname</label><input type="text" name="vorname" value="' + escapeHtml_(p.vorname || '') + '" required>' +
      '<label>Nachname</label><input type="text" name="nachname" value="' + escapeHtml_(p.nachname || '') + '" required>' +
      '<label class="cb"><input type="checkbox" name="newsletter" value="1">' +
      '<span>Bitte informiere mich über die nächsten Events.</span></label>' +
      '<button type="submit">Abmelden</button>' +
      '</form>',
    'Abmelden – NewBuild Kollektiv',
  )
}

function abmeldenVerarbeiten_(p) {
  let sheet = null
  try {
    if (p.sid) sheet = SpreadsheetApp.openById(p.sid).getSheets()[0]
  } catch (err) {}
  if (!sheet) sheet = findeEventSheetPerSlug_(p.slug)
  if (!sheet) {
    return abmeldeSeite_(
      '<h1>Ups</h1><p>Wir konnten das Event nicht zuordnen. Bitte antworte kurz auf die E-Mail, dann melden wir dich manuell ab.</p>',
    )
  }

  const werte = sheet.getDataRange().getValues()
  const kopf = werte[0]
  const iVorname = kopf.indexOf('Vorname')
  const iNachname = kopf.indexOf('Nachname')
  const iEmail = kopf.indexOf('E-Mail')
  const iStatus = kopf.indexOf('Status')

  const email = String(p.email || '').trim().toLowerCase()
  const vn = String(p.vorname || '').trim().toLowerCase()
  const nn = String(p.nachname || '').trim().toLowerCase()

  let treffer = -1
  for (let r = 1; r < werte.length; r++) {
    const rEmail = iEmail >= 0 ? String(werte[r][iEmail] || '').trim().toLowerCase() : ''
    const rVn = iVorname >= 0 ? String(werte[r][iVorname] || '').trim().toLowerCase() : ''
    const rNn = iNachname >= 0 ? String(werte[r][iNachname] || '').trim().toLowerCase() : ''
    if ((email && rEmail === email) || (vn && nn && rVn === vn && rNn === nn)) {
      treffer = r
      break
    }
  }
  if (treffer < 0) {
    return abmeldeSeite_(
      '<h1>Nicht gefunden</h1><p>Wir haben deine Anmeldung nicht gefunden. Bitte prüfe Vor- und Nachname – oder antworte kurz auf die E-Mail.</p>',
    )
  }

  const zeile = treffer + 1
  if (iStatus >= 0) sheet.getRange(zeile, iStatus + 1).setValue('abgemeldet')
  sheet.getRange(zeile, ensureColumn_(sheet, 'Newsletter')).setValue(p.newsletter ? 'Ja' : 'Nein')
  SpreadsheetApp.flush()

  return abmeldeSeite_(
    '<h1>Du bist abgemeldet</h1>' +
      '<p>Schade, dass es diesmal nicht klappt – „' + escapeHtml_(p.event || 'das Event') + '"' +
      (p.datum ? ' · ' + escapeHtml_(p.datum) : '') + '.</p>' +
      (p.newsletter
        ? '<p>Wir informieren dich über die nächsten Treffen.</p>'
        : '<p>Du bekommst keine weiteren Mails zu diesem Event.</p>'),
    'Abgemeldet – NewBuild Kollektiv',
  )
}

// Findet eine Event-Tabelle nur lesend anhand des Slugs (kein Anlegen):
// erst ueber die gemerkte Datei-ID, sonst ueber die Spalte "Slug".
function findeEventSheetPerSlug_(slug) {
  if (!slug) return null
  const id = PropertiesService.getScriptProperties().getProperty('sheetId_' + slug)
  if (id) {
    try {
      return SpreadsheetApp.openById(id).getSheets()[0]
    } catch (e) {}
  }
  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)
  while (files.hasNext()) {
    try {
      const sh = SpreadsheetApp.open(files.next()).getSheets()[0]
      const werte = sh.getDataRange().getValues()
      const iSlug = werte[0].indexOf('Slug')
      if (iSlug >= 0 && ersterWert_(werte, iSlug) === slug) return sh
    } catch (e) {}
  }
  return null
}

// ── Referent:innen-Vorschläge ───────────────────────────────────────────────
const REFERENTEN_SHEET_NAME = 'Referenten-Vorschläge'
const REFERENTEN_HEADERS = [
  'Datum',
  'Vorname',
  'Nachname',
  'E-Mail',
  'Telefonnummer',
  'Unternehmen',
  'Thema',
]

function getOrCreateReferentenSheet_() {
  const folder = getOrCreateFolder()
  const files = folder.getFilesByName(REFERENTEN_SHEET_NAME)
  if (files.hasNext()) return SpreadsheetApp.open(files.next()).getSheets()[0]
  const ss = SpreadsheetApp.create(REFERENTEN_SHEET_NAME)
  moveFileIntoFolder(DriveApp.getFileById(ss.getId()), folder)
  const sheet = ss.getSheets()[0]
  sheet.appendRow(REFERENTEN_HEADERS)
  sheet.setFrozenRows(1)
  return sheet
}

function referentFormular_(p) {
  return abmeldeSeite_(
    '<h1>Als Referent:in melden</h1>' +
      '<p class="ev">Du hast ein Thema aus der Praxis, das du in der Community vorstellen möchtest? Trag dich ein – wir melden uns.</p>' +
      '<form method="get" action="' + WEBAPP_URL + '">' +
      '<input type="hidden" name="action" value="referent_ok">' +
      '<label>Vorname</label><input type="text" name="vorname" required>' +
      '<label>Nachname</label><input type="text" name="nachname" required>' +
      '<label>E-Mail</label><input type="email" name="email" required>' +
      '<label>Telefonnummer</label><input type="tel" name="phone">' +
      '<label>Unternehmen</label><input type="text" name="company">' +
      '<label>Thema / was möchtest du vorstellen?</label>' +
      '<textarea name="thema" required></textarea>' +
      '<button type="submit">Absenden</button>' +
      '</form>',
    'Referent:in werden – NewBuild Kollektiv',
  )
}

function referentVerarbeiten_(p) {
  const vorname = String(p.vorname || '').trim()
  const nachname = String(p.nachname || '').trim()
  const email = String(p.email || '').trim()
  const thema = String(p.thema || '').trim()
  if (!vorname || !nachname || !email || !thema) {
    return abmeldeSeite_(
      '<h1>Fast geschafft</h1><p>Bitte fülle Vorname, Nachname, E-Mail und Thema aus.</p>',
    )
  }

  getOrCreateReferentenSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'),
    vorname,
    nachname,
    email,
    normalizePhone(p.phone),
    String(p.company || '').trim(),
    thema,
  ])

  try {
    GmailApp.sendEmail(
      NOTIFY_EMAIL,
      'Referent:in-Vorschlag: ' + vorname + ' ' + nachname,
      vorname + ' ' + nachname + '\n' + email + '\n\nThema:\n' + thema,
      { name: SENDER_NAME, from: SENDER_EMAIL, replyTo: email },
    )
  } catch (err) {
    Logger.log('Referent-Benachrichtigung fehlgeschlagen: ' + err)
  }

  return abmeldeSeite_(
    '<h1>Danke!</h1>' +
      '<p>Dein Vorschlag ist bei uns – wir melden uns bei dir.</p>',
    'Danke – NewBuild Kollektiv',
  )
}

function referentLink_() {
  return SITE_FORM_URL + '?do=referent'
}

// ── Feedback-Umfrage (nur Freitext) ────────────────────────────────────────
const FEEDBACK_SHEET_NAME = 'Feedback'
const FEEDBACK_HEADERS = [
  'Datum',
  'Event',
  'Gefallen / gefehlt',
  'Themenwünsche',
  'E-Mail (optional)',
]

function getOrCreateFeedbackSheet_() {
  const folder = getOrCreateFolder()
  const files = folder.getFilesByName(FEEDBACK_SHEET_NAME)
  if (files.hasNext()) return SpreadsheetApp.open(files.next()).getSheets()[0]
  const ss = SpreadsheetApp.create(FEEDBACK_SHEET_NAME)
  moveFileIntoFolder(DriveApp.getFileById(ss.getId()), folder)
  const sheet = ss.getSheets()[0]
  sheet.appendRow(FEEDBACK_HEADERS)
  sheet.setFrozenRows(1)
  return sheet
}

function feedbackLink_(slug, titel) {
  return (
    SITE_FORM_URL +
    '?do=feedback' +
    '&slug=' + encodeURIComponent(slug || '') +
    '&event=' + encodeURIComponent(kurzTitel_(titel) || '')
  )
}

function feedbackFormular_(p) {
  const event = p.event || ''
  return abmeldeSeite_(
    '<h1>Wie war’s?</h1>' +
      '<p class="ev">' + (event ? escapeHtml_(event) + ' — ' : '') +
      'Zwei Fragen, dauert eine Minute.</p>' +
      '<form method="get" action="' + WEBAPP_URL + '">' +
      '<input type="hidden" name="action" value="feedback_ok">' +
      '<input type="hidden" name="event" value="' + escapeHtml_(event) + '">' +
      '<input type="hidden" name="slug" value="' + escapeHtml_(p.slug || '') + '">' +
      '<label>Was hat dir gefallen oder gefehlt?</label><textarea name="frei" required></textarea>' +
      '<label>Themenwünsche fürs nächste Mal?</label><textarea name="themen"></textarea>' +
      '<label>E-Mail (nur, falls wir nachfragen dürfen)</label><input type="email" name="email">' +
      '<button type="submit">Feedback senden</button>' +
      '</form>',
    'Feedback – NewBuild Kollektiv',
  )
}

function feedbackVerarbeiten_(p) {
  if (!String(p.frei || '').trim() && !String(p.themen || '').trim()) {
    return abmeldeSeite_(
      '<h1>Fast</h1><p>Bitte schreib uns wenigstens einen Satz.</p>',
    )
  }
  getOrCreateFeedbackSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'),
    String(p.event || ''),
    String(p.frei || '').trim(),
    String(p.themen || '').trim(),
    String(p.email || '').trim(),
  ])
  return abmeldeSeite_(
    '<h1>Danke!</h1><p>Dein Feedback ist bei uns. Bis zum nächsten Mal.</p>',
    'Danke – NewBuild Kollektiv',
  )
}

// ── Foto-Widerspruch (nur Vor-/Nachname → Häkchen in der Event-Tabelle) ─────
function fotoWiderspruchFormular_(p) {
  const event = p.event || 'die Veranstaltung'
  return abmeldeSeite_(
    '<h1>Keine Fotos von mir</h1>' +
      '<p class="ev">' + escapeHtml_(event) +
      ' — trag deinen Namen ein, dann vermerken wir, dass keine erkennbaren Aufnahmen von dir veröffentlicht oder weitergegeben werden.</p>' +
      '<form method="get" action="' + WEBAPP_URL + '">' +
      '<input type="hidden" name="action" value="fotowiderspruch_ok">' +
      '<input type="hidden" name="sid" value="' + escapeHtml_(p.sid || '') + '">' +
      '<input type="hidden" name="slug" value="' + escapeHtml_(p.slug || '') + '">' +
      '<input type="hidden" name="event" value="' + escapeHtml_(event) + '">' +
      '<label>Vorname</label><input type="text" name="vorname" required>' +
      '<label>Nachname</label><input type="text" name="nachname" required>' +
      '<button type="submit">Widerspruch eintragen</button>' +
      '</form>',
    'Foto-Widerspruch – NewBuild Kollektiv',
  )
}

function fotoWiderspruchVerarbeiten_(p) {
  let sheet = null
  try {
    if (p.sid) sheet = SpreadsheetApp.openById(p.sid).getSheets()[0]
  } catch (err) {}
  if (!sheet) sheet = findeEventSheetPerSlug_(p.slug)
  if (!sheet) {
    return abmeldeSeite_(
      '<h1>Ups</h1><p>Wir konnten die Veranstaltung nicht zuordnen. Bitte gib am Empfang Bescheid.</p>',
    )
  }

  const werte = sheet.getDataRange().getValues()
  const kopf = werte[0]
  const iVorname = kopf.indexOf('Vorname')
  const iNachname = kopf.indexOf('Nachname')
  const vn = String(p.vorname || '').trim().toLowerCase()
  const nn = String(p.nachname || '').trim().toLowerCase()
  const spalte = ensureColumn_(sheet, 'Foto-Einwilligung')

  let treffer = 0
  for (let r = 1; r < werte.length; r++) {
    const rVn = iVorname >= 0 ? String(werte[r][iVorname] || '').trim().toLowerCase() : ''
    const rNn = iNachname >= 0 ? String(werte[r][iNachname] || '').trim().toLowerCase() : ''
    if (vn && nn && rVn === vn && rNn === nn) {
      sheet.getRange(r + 1, spalte).setValue('Nein')
      treffer++
    }
  }
  SpreadsheetApp.flush()

  if (!treffer) {
    return abmeldeSeite_(
      '<h1>Nicht gefunden</h1><p>Wir haben dich nicht in der Anmeldeliste gefunden. Bitte gib am Empfang kurz Bescheid, dann tragen wir es von Hand ein.</p>',
    )
  }
  return abmeldeSeite_(
    '<h1>Eingetragen</h1><p>Danke. Wir achten darauf, dass keine erkennbaren Aufnahmen von dir veröffentlicht oder an Dritte weitergegeben werden.</p>',
    'Eingetragen – NewBuild Kollektiv',
  )
}

function fotoWiderspruchLink_(slug) {
  return SITE_FORM_URL + '?do=fotowiderspruch&slug=' + encodeURIComponent(slug || '')
}

// Info-Seite Foto/Video (Ziel des kleinen QR/Links auf dem Aufsteller).
function fotoInfoSeite_(p) {
  const slug = String((p && p.slug) || '')
  return abmeldeSeite_(
    '<h1>Foto- und Videoaufnahmen</h1>' +
      '<p>Bei Veranstaltungen des NewBuild Kollektiv werden Fotos und Videos aufgenommen. Wir nutzen sie für unsere Öffentlichkeitsarbeit – auf newbuild-kollektiv.com, in sozialen Netzwerken (Instagram, LinkedIn), im Newsletter und in der Presse. Das Material kann außerdem an unsere Sponsoren und Partner der Veranstaltung weitergegeben werden, die es für ihre eigene Berichterstattung nutzen.</p>' +
      '<p>Rechtsgrundlage: unser berechtigtes Interesse an einer aussagekräftigen Darstellung unserer Veranstaltungen (Art. 6 Abs. 1 lit. f DSGVO) und § 23 KUG für Übersichts- und Stimmungsaufnahmen; für erkennbare Einzelaufnahmen deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 22 KUG). Du kannst jederzeit widersprechen bzw. widerrufen (Art. 21 DSGVO).</p>' +
      '<p><strong>Du möchtest nicht erkennbar aufgenommen werden?</strong> Sag am Empfang Bescheid' +
      (slug
        ? ' – oder <a href="' + fotoWiderspruchLink_(slug) + '" style="color:#111">hier eintragen</a>.'
        : '.') +
      '</p>' +
      '<p style="margin-top:24px;font-size:.9rem"><a href="https://newbuild-kollektiv.com/datenschutzerklaerung.html" style="color:#111">Vollständige Datenschutzerklärung</a></p>',
    'Foto & Video – NewBuild Kollektiv',
  )
}

// ── Check-in am Eingang (nur Vor-/Nachname → "Anwesend" in der Event-Tabelle)
function checkinFormular_(p) {
  const event = p.event || 'unser Treffen'
  const slug = String(p.slug || '')
  return abmeldeSeite_(
    '<h1>Herzlich willkommen</h1>' +
      '<p class="ev">' + escapeHtml_(event) + ' — schön, dass du da bist. Trag dich kurz ein.</p>' +
      '<form method="get" action="' + WEBAPP_URL + '">' +
      '<input type="hidden" name="action" value="checkin_ok">' +
      '<input type="hidden" name="sid" value="' + escapeHtml_(p.sid || '') + '">' +
      '<input type="hidden" name="slug" value="' + escapeHtml_(slug) + '">' +
      '<input type="hidden" name="event" value="' + escapeHtml_(event) + '">' +
      '<label>Vorname</label><input type="text" name="vorname" required>' +
      '<label>Nachname</label><input type="text" name="nachname" required>' +
      '<label class="cb"><input type="checkbox" name="foto" value="1">' +
      '<span>Ich bin einverstanden, dass bei dieser Veranstaltung Foto- und Videoaufnahmen von mir ' +
      'gemacht und für die Öffentlichkeitsarbeit des NewBuild Kollektiv (Website, Social Media, ' +
      'Newsletter, Presse) verwendet sowie an Sponsoren und Partner der Veranstaltung weitergegeben werden. ' +
      '<a href="' + WEBAPP_URL + '?action=fotoinfo&slug=' + encodeURIComponent(slug) +
      '" style="color:#111">Mehr dazu</a> · ' +
      '<a href="https://newbuild-kollektiv.com/datenschutzerklaerung.html" style="color:#111">Datenschutz</a>' +
      '</span></label>' +
      '<button type="submit">Ich bin da</button>' +
      '</form>' +
      '<p style="margin-top:22px;font-size:.85rem;color:rgba(17,17,17,.55)">Ohne Häkchen checkst du ' +
      'trotzdem ein — wir vermerken dann, dass keine erkennbaren Aufnahmen von dir veröffentlicht ' +
      'oder weitergegeben werden.</p>',
    'Check-in – NewBuild Kollektiv',
  )
}

function checkinVerarbeiten_(p) {
  let sheet = null
  try {
    if (p.sid) sheet = SpreadsheetApp.openById(p.sid).getSheets()[0]
  } catch (err) {}
  if (!sheet) sheet = findeEventSheetPerSlug_(p.slug)
  if (!sheet) {
    return abmeldeSeite_(
      '<h1>Ups</h1><p>Wir konnten die Veranstaltung nicht zuordnen. Bitte gib am Empfang Bescheid.</p>',
    )
  }

  const vn = String(p.vorname || '').trim()
  const nn = String(p.nachname || '').trim()
  if (!vn || !nn) {
    return abmeldeSeite_('<h1>Fast</h1><p>Bitte Vor- und Nachname eintragen.</p>')
  }

  const werte = sheet.getDataRange().getValues()
  const kopf = werte[0]
  const iVorname = kopf.indexOf('Vorname')
  const iNachname = kopf.indexOf('Nachname')
  const iStatus = kopf.indexOf('Status')
  const spAnwesend = ensureColumn_(sheet, 'Anwesend')
  const spFoto = ensureColumn_(sheet, 'Foto-Einwilligung')
  const stamp = Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm')
  const fotoWert = p.foto ? 'Ja' : 'Nein'

  let treffer = 0
  for (let r = 1; r < werte.length; r++) {
    const rVn = iVorname >= 0 ? String(werte[r][iVorname] || '').trim().toLowerCase() : ''
    const rNn = iNachname >= 0 ? String(werte[r][iNachname] || '').trim().toLowerCase() : ''
    if (rVn === vn.toLowerCase() && rNn === nn.toLowerCase()) {
      sheet.getRange(r + 1, spAnwesend).setValue(stamp)
      sheet.getRange(r + 1, spFoto).setValue(fotoWert)
      treffer++
    }
  }
  if (!treffer) {
    // Name nicht auf der Anmeldeliste -> weiter zur normalen Anmeldung, dort
    // fuellt die Person ihre Daten wie alle anderen aus. Vorname/Nachname/Foto
    // wandern als Parameter mit; die Anmeldung markiert die Person dann auch
    // gleich als anwesend (checkin=1).
    const seite = eventSeiteUrl_(p.slug || '')
    if (seite) {
      const ziel =
        seite + '?checkin=1' +
        '&vorname=' + encodeURIComponent(vn) +
        '&nachname=' + encodeURIComponent(nn) +
        '&foto=' + (p.foto ? '1' : '0') +
        '#event-form'
      return {
        ok: true,
        redirect: ziel,
        html:
          '<h1>Fast geschafft, ' + escapeHtml_(vn) + '</h1>' +
          '<p>Dich haben wir noch nicht auf der Anmeldeliste. Wir leiten dich ' +
          'kurz zur Anmeldung weiter – dort trägst du deine Daten wie alle ' +
          'anderen ein, dann bist du eingecheckt.</p>' +
          '<p style="margin-top:18px"><a href="' + ziel +
          '" style="font-weight:600">Jetzt anmelden →</a></p>',
        titel: 'Weiter zur Anmeldung – NewBuild Kollektiv',
      }
    }
    // Kein Slug bekannt (Notfall): wie bisher als "vor Ort" erfassen.
    const neu = new Array(sheet.getLastColumn()).fill('')
    if (iVorname >= 0) neu[iVorname] = vn
    if (iNachname >= 0) neu[iNachname] = nn
    if (iStatus >= 0) neu[iStatus] = 'vor Ort'
    neu[spAnwesend - 1] = stamp
    neu[spFoto - 1] = fotoWert
    sheet.appendRow(neu)
  }
  SpreadsheetApp.flush()

  return abmeldeSeite_(
    '<h1>Danke, ' + escapeHtml_(vn) + '!</h1><p>Du bist eingecheckt. Viel Spaß beim Treffen.</p>' +
      (p.foto
        ? ''
        : '<p style="font-size:.9rem;color:rgba(17,17,17,.6)">Wir achten darauf, dass keine erkennbaren Aufnahmen von dir veröffentlicht oder weitergegeben werden.</p>'),
    'Eingecheckt – NewBuild Kollektiv',
  )
}

// "Ich war doch da" aus der Nachfass-Mail: Person per E-Mail (oder Name) in der
// Event-Tabelle finden, auf anwesend setzen und ihr sofort die Rueckblick-Mail
// (Variante "war da") schicken.
function wardaVerarbeiten_(p) {
  let sheet = null
  try {
    if (p.sid) sheet = SpreadsheetApp.openById(p.sid).getSheets()[0]
  } catch (err) {}
  if (!sheet) sheet = findeEventSheetPerSlug_(p.slug)
  if (!sheet) {
    return abmeldeSeite_(
      '<h1>Ups</h1><p>Wir konnten das Event nicht zuordnen. Bitte antworte kurz auf die E-Mail.</p>',
    )
  }

  const werte = sheet.getDataRange().getValues()
  const kopf = werte[0]
  const iVorname = kopf.indexOf('Vorname')
  const iNachname = kopf.indexOf('Nachname')
  const iEmail = kopf.indexOf('E-Mail')
  const iAnrede = kopf.indexOf('Anrede')
  const iReferent = kopf.indexOf('Referent')
  const iSlug = kopf.indexOf('Slug')

  const email = String(p.email || '').trim().toLowerCase()
  const vn = String(p.vorname || '').trim().toLowerCase()
  const nn = String(p.nachname || '').trim().toLowerCase()

  let treffer = -1
  for (let r = 1; r < werte.length; r++) {
    const rEmail = iEmail >= 0 ? String(werte[r][iEmail] || '').trim().toLowerCase() : ''
    const rVn = iVorname >= 0 ? String(werte[r][iVorname] || '').trim().toLowerCase() : ''
    const rNn = iNachname >= 0 ? String(werte[r][iNachname] || '').trim().toLowerCase() : ''
    if ((email && rEmail === email) || (vn && nn && rVn === vn && rNn === nn)) {
      treffer = r
      break
    }
  }
  if (treffer < 0) {
    return abmeldeSeite_(
      '<h1>Nicht gefunden</h1><p>Wir haben deine Anmeldung nicht gefunden. Bitte antworte kurz auf die E-Mail, dann tragen wir dich manuell ein.</p>',
    )
  }

  const zeile = werte[treffer]
  const spAnwesend = ensureColumn_(sheet, 'Anwesend')
  if (!String(zeile[spAnwesend - 1] || '').trim()) {
    sheet
      .getRange(treffer + 1, spAnwesend)
      .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
    SpreadsheetApp.flush()
  }

  const zielEmail = iEmail >= 0 ? String(zeile[iEmail] || '').trim() : ''
  if (zielEmail) {
    try {
      const mt = String(sheet.getParent().getName()).match(/^\s*.*?\s+—\s+(.+?)\s*$/)
      const inhalt = nachfassDaMail_({
        anrede: anrede_(
          iAnrede >= 0 ? zeile[iAnrede] : '',
          iVorname >= 0 ? zeile[iVorname] : '',
        ),
        slug: iSlug >= 0 ? String(zeile[iSlug] || '') : String(p.slug || ''),
        titel: mt ? mt[1] : String(sheet.getParent().getName()),
        referent: iReferent >= 0 ? ersterWert_(werte, iReferent) : '',
      })
      sendeTeilnehmerMail_(zielEmail, inhalt.subject, inhalt.htmlBody, inhalt.attachments)
    } catch (err) {
      Logger.log('warda — Rueckblick-Mail fehlgeschlagen: ' + err)
    }
  }

  return abmeldeSeite_(
    '<h1>Alles klar!</h1>' +
      '<p>Wir haben dich als anwesend vermerkt. Die Rückblick-Mail zum Abend ist gerade zu dir unterwegs.</p>',
    'Danke – NewBuild Kollektiv',
  )
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
function icsDatei_(titel, start, ende, ort, slug) {
  const utc = function (d) { return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'") }
  const esc = function (s) {
    return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n')
  }
  const seite = eventSeiteUrl_(slug)
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
    'SUMMARY:' + esc('NewBuild Kollektiv Treffen – ' + kurzTitel_(titel)),
    'LOCATION:' + esc(ort),
    'DESCRIPTION:' + esc(
      'NewBuild Kollektiv Treffen. Plane deine Anfahrt ein – der Wecker erinnert dich rechtzeitig ans Aufbrechen.' +
      (seite ? '\nInfos & Anmeldung: ' + seite : ''),
    ),
  ]
  if (seite) lines.push('URL:' + seite)
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + esc('Zeit zum Aufbrechen – NewBuild Kollektiv'),
    'TRIGGER:-PT' + AUFBRUCH_VORLAUF_MIN + 'M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  )
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

// EINMALIG im Editor ausfuehren: richtet den Zeit-Trigger fuer
// sendeErinnerungen ein (ein evtl. vorhandener gleicher Trigger wird ersetzt).
// Alle 15 Minuten, damit die tagesbasierten Mails zuverlaessig kurz nach
// ERINNERUNG_SENDESTUNDE rausgehen, nicht irgendwann in der Stunde.
function erinnerungenTriggerEinrichten() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'sendeErinnerungen'
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t)
    })
  ScriptApp.newTrigger('sendeErinnerungen').timeBased().everyMinutes(15).create()
  Logger.log('OK — "sendeErinnerungen" laeuft ab jetzt alle 15 Minuten.')
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
    ensureColumn_(ss.getSheets()[0], 'Anwesend')
    ensureColumn_(ss.getSheets()[0], 'Foto-Einwilligung')
    namen.push(ss.getName())
  }
  Logger.log('Zusatzspalten angelegt/geprueft (Anrede, Referent, Slug, Anwesend, Foto-Einwilligung): ' + namen.join(' · '))
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
  const iAnwesend = kopf.indexOf('Anwesend')
  if (iEmail < 0 || iDatum < 0) return

  // Wurde die Check-in-Liste fuer dieses Event ueberhaupt genutzt? Nur dann
  // koennen wir "war da" / "war nicht da" trennen. Ist die Spalte leer (niemand
  // hat am Eingang eingecheckt), bekommen alle die normale Rueckblick-Mail —
  // niemand faelschlich ein "schade, dass du nicht da warst".
  const checkinGenutzt =
    iAnwesend >= 0 &&
    werte.some(function (row, idx) {
      return idx > 0 && String(row[iAnwesend] || '').trim()
    })

  // Event-Datum/-Zeit/-Ort/-Referent/-Slug sind pro Tabelle gleich — ersten
  // befuellten Wert der jeweiligen Spalte nehmen.
  const eventDatum = ersterWert_(werte, iDatum)
  const eventZeit = ersterWert_(werte, iZeit)
  const eventOrt = ersterWert_(werte, iOrt)
  const eventReferent = ersterWert_(werte, iReferent)
  const eventSlug = ersterWert_(werte, iSlug)

  const eventStart = parseEventDatum_(eventDatum, eventZeit)
  if (!eventStart) {
    Logger.log(
      'Erinnerung — "' + sheetName + '": Event-Datum unlesbar (' +
      JSON.stringify(eventDatum) + '), Tabelle uebersprungen.',
    )
    return
  }
  const eventEnde = parseEventEnde_(eventStart, eventZeit)
  const eventDatumText = datumAnzeige_(eventDatum)

  const m = String(sheetName).match(/^\s*.*?\s+—\s+(.+?)\s*$/)
  const eventTitel = m ? m[1] : String(sheetName).trim()

  const tageBis = tagesDifferenz_(jetzt, eventStart)
  const stundenBis = (eventStart.getTime() - jetzt.getTime()) / 3600000
  Logger.log(
    'Erinnerung — "' + sheetName + '": start=' + eventStart +
    ', tageBis=' + tageBis + ', stundenBis=' + stundenBis.toFixed(1) +
    ', stunde=' + stunde,
  )

  ERINNERUNG_STUFEN.forEach(function (stufe) {
    const faellig =
      stufe.modus === 'tage'
        ? tageBis === stufe.wert && stunde >= ERINNERUNG_SENDESTUNDE
        : stundenBis > 0 && stundenBis <= stufe.wert
    if (!faellig) return
    Logger.log('Erinnerung — "' + sheetName + '": Stufe "' + stufe.spalte + '" faellig.')

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

      let inhalt
      try {
        inhalt = stufe.bauen({
          anrede: anrede_(
            iAnrede >= 0 ? zeile[iAnrede] : '',
            iVorname >= 0 ? zeile[iVorname] : '',
          ),
          slug: eventSlug,
          sid: sheet.getParent().getId(),
          email: email,
          titel: eventTitel,
          referent: eventReferent,
          datum: eventDatumText,
          zeit: eventZeit,
          ort: eventOrt,
          start: eventStart,
          ende: eventEnde,
          checkinGenutzt: checkinGenutzt,
          anwesend: iAnwesend >= 0 && !!String(zeile[iAnwesend] || '').trim(),
        })
      } catch (err) {
        Logger.log('Erinnerung — Mailaufbau "' + stufe.spalte + '" fehlgeschlagen: ' + err)
        sheet.getRange(r + 1, spalte).setValue('FEHLER (Aufbau): ' + err)
        continue
      }

      try {
        sendeTeilnehmerMail_(email, inhalt.subject, inhalt.htmlBody, inhalt.attachments)
        sheet
          .getRange(r + 1, spalte)
          .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
        SpreadsheetApp.flush()
        Utilities.sleep(300)
        Logger.log('Erinnerung — "' + stufe.spalte + '" an ' + email + ' verschickt.')
      } catch (err) {
        Logger.log('Erinnerung — Versand "' + stufe.spalte + '" an ' + email + ' fehlgeschlagen: ' + err)
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

// true, wenn v ein echtes Date-Objekt ist (aus getValues() bei Datums-Zellen).
function istDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())
}

// Anzeige-Text fuers Datum. Echte Datums-Zelle -> "Di., 01.09.2026",
// sonst der vorhandene Text unveraendert.
function datumAnzeige_(v) {
  if (istDate_(v)) {
    const wt = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'][v.getDay()]
    return wt + ', ' + Utilities.formatDate(v, 'Europe/Berlin', 'dd.MM.yyyy')
  }
  return String(v == null ? '' : v).trim()
}

// Baut aus dem Event-Datum + "18:30–20:00" ein Date-Objekt. Akzeptiert ein
// echtes Date (Datums-Zelle im Sheet), "TT.MM.JJJJ", "JJJJ-MM-TT" oder zur Not
// alles, was new Date() versteht. Uhrzeit: erste HH:MM-Angabe, sonst 18:00.
function parseEventDatum_(datumText, zeitText) {
  let jahr, monat, tag
  if (istDate_(datumText)) {
    jahr = datumText.getFullYear()
    monat = datumText.getMonth()
    tag = datumText.getDate()
  } else {
    const s = String(datumText || '')
    let d = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (d) {
      jahr = Number(d[3]); monat = Number(d[2]) - 1; tag = Number(d[1])
    } else if ((d = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) {
      jahr = Number(d[1]); monat = Number(d[2]) - 1; tag = Number(d[3])
    } else {
      const dt = new Date(s)
      if (isNaN(dt.getTime())) return null
      jahr = dt.getFullYear(); monat = dt.getMonth(); tag = dt.getDate()
    }
  }
  const t = String(zeitText || '').match(/(\d{1,2}):(\d{2})/)
  return new Date(jahr, monat, tag, t ? Number(t[1]) : 18, t ? Number(t[2]) : 0, 0)
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
// Anmeldung kam vom Check-in-Aufsteller (Person stand nicht auf der Liste):
// die gerade angehaengte Zeile zusaetzlich als anwesend markieren + Foto-Angabe
// aus dem Check-in uebernehmen. So ist der Walk-in in einem Rutsch angemeldet
// UND eingecheckt.
function markiereAnwesend_(sheet, data) {
  const row = sheet.getLastRow()
  sheet
    .getRange(row, ensureColumn_(sheet, 'Anwesend'))
    .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
  sheet
    .getRange(row, ensureColumn_(sheet, 'Foto-Einwilligung'))
    .setValue(data.foto ? 'Ja' : 'Nein')
}

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
        '<p>Bis bald!</p>' +
        abmeldeSatz_(e),
    ),
  }
}

function mailEinTag_(e) {
  return {
    subject: 'Erinnerung NBK Treffen – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>morgen Abend findet unser NewBuild Kollektiv Treffen statt, für das ' +
        'du dich angemeldet hast.</p>' +
        '<p>Hier nochmal die Eckdaten zu deiner Übersicht:</p>' +
        eckdatenBlock_(e) +
        '<p>Im Anhang findest du eine Kalenderdatei (.ics). Sie erinnert dich ' +
        AUFBRUCH_VORLAUF_MIN +
        ' Minuten vor Beginn ans Aufbrechen.</p>' +
        '<p>Ich freue mich sehr auf den gemeinsamen Austausch mit dir.</p>' +
        '<p>Bis morgen!</p>' +
        '<p style="color:#666;font-size:13px;margin-top:24px">P.S.: Falls sich in ' +
        'deinem Terminkalender doch etwas geändert hat – ' +
        '<a href="' + abmeldeLink_(e.sid, e.slug, e.titel, e.email, e.datum) +
        '" style="color:#3d5a80">hier abmelden</a>.</p>',
    ),
    attachments: [icsDatei_(e.titel, e.start, e.ende, e.ort, e.slug)],
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
    attachments: [icsDatei_(e.titel, e.start, e.ende, e.ort, e.slug)],
  }
}

// Optionaler Zusatz-Absatz in der "war da"-Nachfassmail, pro Event.
// slug -> fertiges <p>…</p> (z. B. Hinweis aufs naechste Treffen).
const NACHFASS_ZUSATZ = {
  'session-01-ki-belohnt-ordnung':
    '<p>Übrigens: ' +
    '<a href="https://oblik.media/events/architecture-intelligence" style="color:#3d5a80">Hier findest du alle Infos und die Anmeldung</a> ' +
    'zum großen Event <strong>„Architecture Intelligence"</strong> am <strong>24. September</strong> – ' +
    'zu dem ihr gerne alle eure Teammitglieder mit einladen dürft, um auch sie bei der ' +
    'KI-Entwicklung mitzunehmen.</p>',
}

// Am Tag danach: zwei Varianten. Wer eingecheckt war (oder wo die Check-in-
// Liste gar nicht genutzt wurde) bekommt den warmen Rueckblick; wer als
// abwesend gilt, bekommt "schade" + einen Ich-war-doch-da-Link, der die
// Person auf anwesend setzt und ihr sofort den Rueckblick nachschickt.
function mailNachfass_(e) {
  return e.checkinGenutzt && !e.anwesend ? nachfassNichtDaMail_(e) : nachfassDaMail_(e)
}

function nachfassNichtDaMail_(e) {
  return {
    subject: 'Schade, dass du nicht dabei warst',
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>schade, dass du es gestern nicht zum NewBuild Kollektiv Treffen geschafft ' +
        'hast. Die Infos zum nächsten Treffen kommen bald. Ich hoffe sehr, dass ich ' +
        'dich dann begrüßen darf.</p>' +
        '<p style="margin:0 0 18px;padding:14px 16px;background:#f4f4f2;border-radius:8px">' +
        'Du warst <strong>doch da</strong>, hast dich nur vergessen am Eingang ' +
        'einzuchecken?<br>' +
        '<a href="' + wardaLink_(e.sid, e.slug, e.email) +
        '" style="color:#3d5a80">Ja, ich war da →</a><br>' +
        'Dann vermerken wir das und du bekommst gleich die Rückblick-Mail zum Abend.' +
        '</p>' +
        '<p>Bis bald und liebe Grüße,</p>',
    ),
  }
}

function nachfassDaMail_(e) {
  return {
    subject: 'Danke fürs Kommen – bis zum nächsten Mal',
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>was für ein schöner Abend gestern!<br>' +
        'Ich habe mich sehr gefreut, dass du bei unserem gestrigen NewBuild Kollektiv ' +
        'Abend dabei gewesen bist.</p>' +
        '<p>Ich hoffe, du hast ' +
        (e.referent
          ? 'den Austausch und das Vorgetragene von ' + escapeHtml_(e.referent) + ' '
          : 'den Austausch und die Impulse des Abends ') +
        'genauso genossen wie ich und nimmst Infos für deine eigene Praxis mit.</p>' +
        '<p>Lass mich gerne wissen, falls du noch ' +
        '<a href="' + feedbackLink_(e.slug, e.titel) +
        '" style="color:#3d5a80">Hinweise für unsere nächsten Treffen</a> hast.</p>' +
        '<p>Und falls du selbst einmal ein Thema oder deine Erfahrungen mit dem Kollektiv teilen ' +
        'möchtest, <a href="' + referentLink_() +
        '" style="color:#3d5a80">trag dich gerne hier ein</a>.</p>' +
        '<p>Danke, dass du dabei warst und den Abend mitgestaltet hast.</p>' +
        '<p>Ich freue mich schon auf das nächste Mal. Infos zum nächsten Treffen folgen in Kürze.</p>' +
        (NACHFASS_ZUSATZ[e.slug] || '') +
        '<p>Bis bald und liebe Grüße,</p>',
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

  // Echte Tabellen-ID von Session 01 holen, damit der "Ich war doch da"-Link
  // in der Test-Mail wirklich funktioniert (setzt dann auch Anwesend + schickt
  // die Rueckblick-Mail — also bewusst ein echter Klick-Test).
  let sid = ''
  try {
    const s = findeEventSheetPerSlug_('session-01-ki-belohnt-ordnung')
    if (s) sid = s.getParent().getId()
  } catch (err) {}

  const e = {
    anrede: anrede_('w', 'Ann-Kathrin'),
    slug: 'session-01-ki-belohnt-ordnung',
    sid: sid,
    email: TEST_EMPFAENGER,
    titel: 'KI belohnt Ordnung: Wie Menschen und KI-Agenten in Planungsbüros zusammenarbeiten',
    referent: 'Markus Kolb, Bräunlin Kolb Architekten',
    datum: 'Di., 01.09.2026',
    zeit: '18:30–20:00',
    ort: 'Projo Berlin, Chausseestraße 123, 10115 Berlin',
    start: start,
    ende: new Date(start.getTime() + 90 * 60000),
  }

  const bestHtml = wrapMail_(
    '<p>' + escapeHtml_(e.anrede) + ',</p>' +
      '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
      eckdatenBlock_(e) +
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

  // Die Schleife oben liefert die Nachfass-Variante "war da". Zusaetzlich die
  // "nicht da"-Variante schicken, damit beide sichtbar sind.
  const nd = nachfassNichtDaMail_(e)
  sendeTeilnehmerMail_(TEST_EMPFAENGER, '[TEST] (nicht da) ' + nd.subject, nd.htmlBody)

  Logger.log('Test-Mails an ' + TEST_EMPFAENGER + ' verschickt (Bestaetigung + 4 Stufen + Nachfass "nicht da").')
}
