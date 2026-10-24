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
// (1 Woche / 1 Tag / Nachfass) und die Vorschauen rausgehen. Der Trigger laeuft alle 15 Min.,
// verschickt diese Stufen aber fruehestens ab dieser Uhrzeit.
const ERINNERUNG_SENDESTUNDE = 9

// Tagesstufe mit eigener Uhrzeit ("ab" in ERINNERUNG_STUFEN, z. B. '16:30'),
// sonst ab ERINNERUNG_SENDESTUNDE. Uhrzeit Europe/Berlin.
function sendezeitErreicht_(jetzt, stufe) {
  const ab = stufe.ab || ('0' + ERINNERUNG_SENDESTUNDE).slice(-2) + ':00'
  return Utilities.formatDate(jetzt, 'Europe/Berlin', 'HH:mm') >= ab
}

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
  'Anrede',
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
        if (data.action === 'medien') return jsonResponse(medienAntwortVerarbeiten_(data))
        if (data.action === 'mailvorschau') return jsonResponse({ ok: true, html: mailVorschauHtml_(String(data.slug || '')) })
        if (data.action === 'mailtest') return jsonResponse({ ok: true, html: mailTestHtml_(String(data.slug || '')) })
        return jsonResponse({ ok: false, html: '<h1>Unbekannt</h1><p>Aktion nicht erkannt.</p>' })
      } finally {
        FORM_JSON = false
      }
    }

    validateRegistration(data)
    data.phone = normalizePhone(data.phone)

    // Referent:in-Zeile fuer die Mails aus den drei CMS-Feldern zusammensetzen
    // (Fallback: altes eventSpeaker-Feld, falls noch zwischengespeichertes JS
    // im Umlauf ist). data.eventSpeaker ist ab hier der kanonische Wert.
    data.eventSpeaker =
      referentText_(data.speakerName, data.speakerRole, data.speakerCompany) ||
      data.eventSpeaker ||
      ''

    const sheet = getOrCreateEventSheet(data.eventSlug, data.eventNumber, data.eventTitle)
    const row = appendRegistration(sheet, data)
    schreibeZusatzfelder_(sheet, data, row)
    if (data.checkin) markiereAnwesend_(sheet, data, row)

    // Ab hier ist die Anmeldung gespeichert. Alles Weitere darf sie nicht mehr
    // als "fehlgeschlagen" melden — sonst probieren die Leute es nochmal und
    // stehen doppelt in der Liste (30.09.2026: Mail-Tageskontingent nach dem
    // Einladungsversand erschoepft, "Dienst an einem Tag zu haeufig aufgerufen:
    // email" -> Website zeigte Fehler, Anmeldungen kamen aber an).
    try {
      upsertHistoryEntry(data)
    } catch (err) {
      Logger.log('Anmeldung — History-Eintrag fehlgeschlagen: ' + err)
    }
    const spBest = ensureColumn_(sheet, 'Bestätigung')
    try {
      sendConfirmationEmail(data, sheet.getParent().getId())
      sheet
        .getRange(row, spBest)
        .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
    } catch (err) {
      // Wird von sendeErinnerungen nachgeholt, sobald wieder Kontingent da ist.
      sheet.getRange(row, spBest).setValue('offen')
      Logger.log('Anmeldung — Bestaetigung spaeter nachholen (' + data.email + '): ' + err)
    }
    try {
      sendAdminNotificationEmail(data)
    } catch (err) {
      Logger.log('Anmeldung — Admin-Benachrichtigung fehlgeschlagen: ' + err)
    }

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
  if (p.action === 'mailvorschau') return mailVorschauSeite_(p)
  if (p.action === 'mailtest') return mailTestSenden_(p)
  return HtmlService.createHtmlOutput(
    '<p style="font-family:Arial,Helvetica,sans-serif">NewBuild Kollektiv</p>',
  ).setTitle('NewBuild Kollektiv')
}

function validateRegistration(data) {
  const required = ['eventTitle', 'firstName', 'lastName', 'email', 'anrede', 'company']
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

  // 2b. URL-Kuerzel im CMS geaendert (neuer Slug unbekannt) und Titel auch:
  //     bestehende Tabelle derselben Session-Nummer weiterverwenden statt
  //     die Anmeldungen auf zwei Tabellen zu verteilen (Session 03 am
  //     29.09.: developing-custome-tools -> ordner-zum-tool). Nur wenn genau
  //     eine Tabelle mit "<Nummer> — " beginnt.
  if (eventNumber) {
    const prefix = String(eventNumber).trim() + ' — '
    const treffer = []
    const alle = folder.getFilesByType(MimeType.GOOGLE_SHEETS)
    while (alle.hasNext()) {
      const f = alle.next()
      if (f.getName().indexOf(prefix) === 0) treffer.push(f)
    }
    if (treffer.length === 1) {
      const ss = SpreadsheetApp.open(treffer[0])
      if (propKey) props.setProperty(propKey, ss.getId())
      if (niceName && ss.getName() !== niceName) ss.rename(niceName)
      return ss.getSheets()[0]
    }
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
  const anredeCol = HISTORY_HEADERS.indexOf('Anrede')
  const countCol = HISTORY_HEADERS.indexOf('Anzahl Anmeldungen')
  const lastEventCol = HISTORY_HEADERS.indexOf('Letztes Event')
  const anredeCode = anredeCode_(data.anrede)

  for (let row = 1; row < values.length; row++) {
    if (String(values[row][emailCol]).trim().toLowerCase() === email) {
      const sheetRow = row + 1 // 1-basiert + Header-Zeile
      sheet.getRange(sheetRow, lastEventCol + 1).setValue(eventLabel)
      sheet.getRange(sheetRow, countCol + 1).setValue((Number(values[row][countCol]) || 0) + 1)
      // Anrede nachtragen/aktualisieren, falls sie noch fehlt oder sich geaendert hat
      if (anredeCode) sheet.getRange(sheetRow, anredeCol + 1).setValue(anredeCode)
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
    anredeCode,
  ])
}

// Einmal-Funktion: traegt Anrede in bestehenden "History Anmeldungen"-Zeilen
// nach, indem sie in allen Event-Tabellen (Ordner "Events") nach der E-Mail
// sucht und deren "Anrede"-Spalte uebernimmt. Danach im Skript-Editor loeschen
// oder liegen lassen (macht nichts kaputt, einfach nochmal ausfuehren).
function backfillHistoryAnrede() {
  const anredeProEmail = {}
  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)
  while (files.hasNext()) {
    try {
      const sh = SpreadsheetApp.open(files.next()).getSheets()[0]
      const werte = sh.getDataRange().getValues()
      const kopf = werte[0]
      const iEmail = kopf.indexOf('E-Mail')
      const iAnrede = kopf.indexOf('Anrede')
      if (iEmail < 0 || iAnrede < 0) continue
      for (let r = 1; r < werte.length; r++) {
        const email = String(werte[r][iEmail] || '').trim().toLowerCase()
        const code = anredeCode_(werte[r][iAnrede])
        if (email && code) anredeProEmail[email] = code
      }
    } catch (err) {}
  }

  const historySheet = getOrCreateHistorySpreadsheet().getSheets()[0]
  // Kopfzeile (Zeile 1) auf die richtigen Ueberschriften setzen, damit sie zu den
  // Spalten passen. Datenzeilen werden dabei nicht angefasst.
  historySheet.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS])
  const werte = historySheet.getDataRange().getValues()
  const emailCol = HISTORY_HEADERS.indexOf('E-Mail')
  const anredeCol = HISTORY_HEADERS.indexOf('Anrede')
  let aktualisiert = 0

  for (let r = 1; r < werte.length; r++) {
    const email = String(werte[r][emailCol] || '').trim().toLowerCase()
    const vorhanden = String(werte[r][anredeCol] || '').trim()
    if (vorhanden) continue
    const code = anredeProEmail[email]
    if (code) {
      historySheet.getRange(r + 1, anredeCol + 1).setValue(code)
      aktualisiert++
    }
  }

  Logger.log('Anrede nachgetragen bei ' + aktualisiert + ' Zeilen in "History Anmeldungen".')
}

// Traegt die Anmeldung ein und gibt die Zeilennummer zurueck. Ist dieselbe
// E-Mail fuer dieses Event schon angemeldet (nicht abgemeldet), wird deren
// Zeile mit den neuen Angaben aktualisiert statt eine Dublette anzuhaengen —
// die Erinnerungs-Statusspalten dieser Zeile bleiben erhalten.
function appendRegistration(sheet, data) {
  const now = new Date()
  const neu = [
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
  ]
  const werte = sheet.getDataRange().getValues()
  const iEmail = werte[0].indexOf('E-Mail')
  const iStatus = werte[0].indexOf('Status')
  const email = String(data.email || '').trim().toLowerCase()
  if (iEmail >= 0 && email) {
    for (let r = 1; r < werte.length; r++) {
      if (String(werte[r][iEmail] || '').trim().toLowerCase() !== email) continue
      if (iStatus >= 0 && /abgemeldet|storniert|abgesagt/i.test(String(werte[r][iStatus] || ''))) continue
      sheet.getRange(r + 1, 1, 1, neu.length).setValues([neu])
      return r + 1
    }
  }
  sheet.appendRow(neu.concat(['Nein']))
  return sheet.getLastRow()
}

function sendConfirmationEmail(data, sid) {
  const m = bestaetigungMail_({
    anrede: anrede_(data.anrede, data.firstName),
    slug: data.eventSlug,
    sid: sid,
    email: data.email,
    titel: data.eventTitle,
    referent: data.eventSpeaker,
    datum: data.eventDate,
    zeit: data.eventTime,
    ort: data.eventLocation,
    start: data.eventDate ? parseEventDatum_(data.eventDate, data.eventTime) : null,
  })
  sendeTeilnehmerMail_(data.email, m.subject, m.htmlBody, m.attachments)
}

// Anmeldebestaetigung — direkt bei der Anmeldung und beim Nachholen durch
// sendeErinnerungen (Spalte "Bestätigung" = "offen"). Haengt die Kalenderdatei
// (.ics) an, sobald der Termin lesbar ist (e.start).
function bestaetigungMail_(e) {
  return ausDoc_('bestaetigung', e, bestaetigungMailStandard_)
}

function bestaetigungMailStandard_(e) {
  const ics = e.start
    ? icsDatei_(e.titel, e.start, e.ende || parseEventEnde_(e.start, e.zeit), e.ort, e.slug)
    : null
  return {
    subject: 'Anmeldebestätigung: ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' + escapeHtml_(e.anrede) + ',</p>' +
        '<p>vielen Dank für deine Anmeldung zu folgendem Event:</p>' +
        eckdatenBlock_(e) +
        (ics
          ? '<p>Im Anhang findest du eine Kalenderdatei (.ics) – einfach öffnen, dann steht ' +
            'der Termin direkt in deinem Kalender.</p>'
          : '') +
        '<p>Bei Rückfragen schreibe mir einfach eine E-Mail.</p>' +
        '<p>Bis bald,</p>' +
        (e.email ? abmeldeSatz_(e) : ''),
    ),
    attachments: ics ? [ics] : undefined,
  }
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

// Alle anderen Events: die Website erzeugt beim Build aus Pages CMS fuer JEDES
// Event automatisch eine Karte im selben Stil unter /mail/<slug>-karte.png
// (scripts/generate-mail-cards.mjs). Ein Eintrag in GRAFIKEN oben ist nur
// noetig, wenn ein Event eine eigens gestaltete Grafik bekommen soll.
function automatischeKarte_(slug, ort) {
  if (!slug) return null
  const url = 'https://newbuild-kollektiv.com/mail/' + encodeURIComponent(String(slug)) + '-karte.png'
  if (!istBild_(url)) return null
  return {
    url: url,
    href: ort ? mapsLink_(ort) : eventSeiteUrl_(slug),
  }
}

// true, wenn unter der URL wirklich ein Bild liegt. Fehlt die Karte (Event
// neu im CMS, Build noch nicht durch), antwortet Cloudflare mit 200 und einer
// HTML-Seite -> in der Mail erschiene ein kaputtes Bild. Ergebnis 6 h gecacht.
function istBild_(url) {
  const cache = CacheService.getScriptCache()
  const key = 'bild_' + Utilities.base64EncodeWebSafe(url).slice(0, 200)
  const c = cache.get(key)
  if (c) return c === '1'
  let ok = false
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true })
    const typ = String(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || '')
    ok = res.getResponseCode() === 200 && /^image\//i.test(typ)
  } catch (err) {
    Logger.log('Kartenpruefung fehlgeschlagen (' + url + '): ' + err)
    return true // im Zweifel Bild zeigen wie bisher, nicht cachen
  }
  // Fehlende Karte nur kurz merken, damit sie nach dem naechsten Build erscheint.
  cache.put(key, ok ? '1' : '0', ok ? 21600 : 600)
  return ok
}

// Klickbarer, zentrierter Grafikblock (ganzes Bild -> href) fuer eine
// Mailstufe. Leerer String nur, wenn kein Slug bekannt ist.
function grafikBlock_(slug, variant, ort) {
  const g =
    (GRAFIKEN[String(slug || '')] && GRAFIKEN[String(slug || '')][variant]) ||
    automatischeKarte_(slug, ort)
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
  const g = grafikBlock_(e.slug, 'erinnerung', e.ort)
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

// Referent:in fuer E-Mails: Name / Position / Firma kommen als drei getrennte
// Felder aus dem Pages CMS (ohne Satzzeichen). Hier zu einer Zeile gesetzt:
//   "Name, Position Firma"  —  fehlt eins, faellt es sauber weg.
// (Website baut ihre eigene Form in generate-event-pages.mjs.)
function referentText_(name, position, firma) {
  const n = String(name || '').trim()
  const zusatz = [String(position || '').trim(), String(firma || '').trim()]
    .filter(Boolean)
    .join(' ')
  if (!n) return zusatz
  return zusatz ? n + ', ' + zusatz : n
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
// (Array von Blobs, z.B. die .ics-Datei); kopieAnAnn = BCC an VORSCHAU_EMPFAENGER
// fuer Mails ohne vorherige Vorschau. Setzt voraus, dass SENDER_EMAIL in
// Gmail unter Einstellungen > Konten > "Senden als" als verifizierter Alias
// hinterlegt ist (sonst "Invalid sender email").
function sendeTeilnehmerMail_(to, subject, htmlBody, attachments, kopieAnAnn) {
  const opts = {
    name: SENDER_NAME,
    from: SENDER_EMAIL,
    replyTo: SENDER_EMAIL,
    htmlBody: htmlBody + signaturHtml_(),
  }
  if (attachments && attachments.length) opts.attachments = attachments
  if (kopieAnAnn && to !== VORSCHAU_EMPFAENGER) opts.bcc = VORSCHAU_EMPFAENGER
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
    // Feste UID pro Event: die .ics aus Bestaetigung und "1 Tag vorher"-Mail
    // aktualisieren denselben Kalendereintrag statt einen zweiten anzulegen
    // (auch nach einer Terminverschiebung im CMS).
    'UID:' + (slug ? String(slug) : Utilities.getUuid()) + '@newbuild-kollektiv.com',
    'SEQUENCE:' + Math.floor(Date.now() / 1000),
    'DTSTAMP:' + utc(new Date()),
    'DTSTART:' + utc(start),
    'DTEND:' + utc(ende),
    'SUMMARY:' + esc('NewBuild Kollektiv Treffen – ' + kurzTitel_(titel)),
    'LOCATION:' + esc(ort),
    'DESCRIPTION:' + esc(
      'NewBuild Kollektiv Treffen. Plane deine Anfahrt ein – der Wecker erinnert dich rechtzeitig ans Aufbrechen.' +
      (ort ? '\n\nAnfahrt (Google Maps): ' + mapsLink_(ort) : '') +
      (seite ? '\nInfos zum Event: ' + seite : ''),
    ),
  ]
  // Bewusst KEIN URL-Feld: Apple Kalender zeigt es zweimal an (oben "Öffnen"
  // und unten nochmal) - zusammen mit der Beschreibung stand ein Link dann
  // dreifach im Termin. Maps-Link und Eventseite stehen je einmal in DESCRIPTION.
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

// EINMALIG im Editor ausfuehren (30.09.2026): markiert alle Anmeldungen vom
// BESTAETIGUNG_NACHHOLEN_TAG ohne Eintrag in "Bestätigung" als "offen" — je
// E-Mail nur eine Zeile, weitere Zeilen derselben Person als "Dublette".
// sendeErinnerungen verschickt die Bestaetigungen dann automatisch, sobald
// das Mail-Kontingent wieder reicht.
const BESTAETIGUNG_NACHHOLEN_TAG = '30.09.2026'

function bestaetigungenNachholenMarkieren() {
  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)
  let n = 0
  while (files.hasNext()) {
    const sheet = SpreadsheetApp.open(files.next()).getSheets()[0]
    const spBest = ensureColumn_(sheet, 'Bestätigung')
    const werte = sheet.getDataRange().getValues()
    const kopf = werte[0]
    const iEmail = kopf.indexOf('E-Mail')
    const iDatum = kopf.indexOf('Anmeldedatum')
    if (iEmail < 0 || iDatum < 0) continue
    const gesehen = {}
    for (let r = 1; r < werte.length; r++) {
      const email = String(werte[r][iEmail] || '').trim().toLowerCase()
      if (!email) continue
      const tag = istDate_(werte[r][iDatum])
        ? Utilities.formatDate(werte[r][iDatum], 'Europe/Berlin', 'dd.MM.yyyy')
        : String(werte[r][iDatum] || '').trim()
      if (tag !== BESTAETIGUNG_NACHHOLEN_TAG || String(werte[r][spBest - 1] || '').trim()) continue
      sheet.getRange(r + 1, spBest).setValue(gesehen[email] ? 'Dublette' : 'offen')
      if (!gesehen[email]) n++
      gesehen[email] = true
    }
  }
  Logger.log(n + ' Bestaetigungen zum Nachholen markiert (Versand ueber sendeErinnerungen).')
}

// Aktuelle Eventdaten aus Pages CMS — die Website veroeffentlicht
// src/content/events.json bei jedem Build unter /events.json (vite.config.ts).
// Einzige Quelle fuer Datum/Zeit/Ort/Titel/Referent in den Erinnerungen:
// die Werte in den Anmeldezeilen sind nur der Stand zum Anmeldezeitpunkt und
// veralten, sobald im CMS etwas geaendert wird (Session 03: am 25.08. mit
// 06.10. angelegt, am 10.09. auf 20.10. verschoben -> am 29.09. ging die
// "1 Woche vorher"-Mail zum alten Termin raus).
const EVENTS_JSON_URL = 'https://newbuild-kollektiv.com/events.json'

function ladeCmsEvents_() {
  const res = UrlFetchApp.fetch(EVENTS_JSON_URL + '?t=' + Date.now(), {
    muteHttpExceptions: true,
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (res.getResponseCode() !== 200) {
    throw new Error('events.json nicht ladbar (HTTP ' + res.getResponseCode() + ')')
  }
  const events = JSON.parse(res.getContentText()).events
  if (!Array.isArray(events) || !events.length) throw new Error('events.json ohne Events')
  return events
}

// Findet das CMS-Event zu einer Tabelle: zuerst ueber einen der Slugs in der
// Spalte "Slug" (auch aeltere, falls das URL-Kuerzel im CMS geaendert wurde
// und der neue schon in der Tabelle steht), sonst ueber die Session-Nummer
// vorne im Tabellennamen ("Session 03 — ..."). null, wenn nichts passt.
function findeCmsEvent_(cmsEvents, werte, iSlug, sheetName) {
  if (iSlug >= 0) {
    const slugs = {}
    for (let r = 1; r < werte.length; r++) {
      const s = String(werte[r][iSlug] || '').trim()
      if (s) slugs[s] = true
    }
    const perSlug = cmsEvents.filter(function (e) { return slugs[e.slug] })
    if (perSlug.length) return perSlug[0]
  }
  const nr = String(sheetName).split(' — ')[0].trim()
  if (nr && String(sheetName).indexOf(' — ') > 0) {
    const perNr = cmsEvents.filter(function (e) { return String(e.number || '').trim() === nr })
    if (perNr.length === 1) return perNr[0]
  }
  return null
}

function sendeErinnerungen() {
  const jetzt = new Date()
  const stunde = Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'H'))

  try {
    fotosInHistoryEintragen()
  } catch (err) {
    Logger.log('Fotos/LinkedIn — Fehler: ' + err)
  }

  // Ohne aktuelle CMS-Daten lieber gar nichts verschicken als Mails mit
  // veraltetem Termin — der naechste Lauf (15 min) versucht es erneut.
  let cmsEvents
  try {
    cmsEvents = ladeCmsEvents_()
  } catch (err) {
    Logger.log('Erinnerung — abgebrochen, ' + err)
    return
  }

  try {
    mailDocLinksAktualisieren_()
    mailTexteDocsAnlegen_(cmsEvents)
  } catch (err) {
    Logger.log('Mail-Texte-Doc — Fehler: ' + err)
  }

  try {
    medienAbgleichen_(cmsEvents)
  } catch (err) {
    Logger.log('Medien — Fehler: ' + err)
  }

  try {
    sponsorAbgleichen_(cmsEvents)
  } catch (err) {
    Logger.log('Sponsoren — Fehler: ' + err)
  }

  const files = getOrCreateEventsSubfolder().getFilesByType(MimeType.GOOGLE_SHEETS)
  while (files.hasNext()) {
    const file = files.next()
    try {
      const ss = SpreadsheetApp.open(file)
      verarbeiteEventTabelle_(ss.getSheets()[0], ss.getName(), jetzt, stunde, cmsEvents)
    } catch (err) {
      Logger.log('Erinnerung — Fehler bei "' + file.getName() + '": ' + err)
    }
  }
}

function verarbeiteEventTabelle_(sheet, sheetName, jetzt, stunde, cmsEvents) {
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

  // Event-Datum/-Zeit/-Ort/-Referent/-Slug/-Titel kommen aus dem aktuellen
  // Stand in Pages CMS (siehe ladeCmsEvents_), NICHT aus den Anmeldezeilen.
  // Ohne passendes CMS-Event wird die Tabelle uebersprungen statt mit
  // womoeglich veralteten Zeilenwerten zu verschicken.
  const cms = findeCmsEvent_(cmsEvents, werte, iSlug, sheetName)
  if (!cms) {
    Logger.log('Erinnerung — "' + sheetName + '": kein passendes Event in events.json, uebersprungen.')
    return
  }
  const eventDatum = String(cms.date || '')
  const eventZeit = String(cms.time || '')
  const eventOrt = String(cms.location || '')
  const eventReferent =
    referentText_(cms.speakerName, cms.speakerRole, cms.speakerCompany) || ersterWert_(werte, iReferent)
  const eventSlug = String(cms.slug || '')

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

  const eventTitel = String(cms.title || '').trim() || String(sheetName).trim()

  const tageBis = tagesDifferenz_(jetzt, eventStart)
  const stundenBis = (eventStart.getTime() - jetzt.getTime()) / 3600000
  Logger.log(
    'Erinnerung — "' + sheetName + '": start=' + eventStart +
    ', tageBis=' + tageBis + ', stundenBis=' + stundenBis.toFixed(1) +
    ', stunde=' + stunde,
  )

  const sid = sheet.getParent().getId()
  const iBest = kopf.indexOf('Bestätigung')
  const eventDaten = function (zeile, email) {
    return {
      anrede: anrede_(
        iAnrede >= 0 ? zeile[iAnrede] : '',
        iVorname >= 0 ? zeile[iVorname] : '',
      ),
      slug: eventSlug,
      sid: sid,
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
    }
  }

  // Anmeldebestaetigungen nachholen, die bei der Anmeldung nicht rausgingen
  // (Spalte "Bestätigung" = "offen", z. B. Mail-Tageskontingent erschoepft).
  if (iBest >= 0 && stundenBis > 0) {
    const bestaetigt = {}
    for (let r = 1; r < werte.length; r++) {
      const v = String(werte[r][iBest] || '').trim()
      if (v && v !== 'offen') bestaetigt[String(werte[r][iEmail] || '').trim().toLowerCase()] = true
    }
    for (let r = 1; r < werte.length; r++) {
      if (String(werte[r][iBest] || '').trim() !== 'offen') continue
      const email = String(werte[r][iEmail] || '').trim()
      const key = email.toLowerCase()
      if (!email) continue
      if (bestaetigt[key]) {
        sheet.getRange(r + 1, iBest + 1).setValue('Dublette')
        continue
      }
      if (MailApp.getRemainingDailyQuota() < 2) {
        Logger.log('Bestaetigung — Tageskontingent erschoepft, Rest folgt beim naechsten Lauf.')
        return
      }
      try {
        const m = bestaetigungMail_(eventDaten(werte[r], email))
        sendeTeilnehmerMail_(email, m.subject, m.htmlBody, m.attachments)
        sheet
          .getRange(r + 1, iBest + 1)
          .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
        bestaetigt[key] = true
        SpreadsheetApp.flush()
        Utilities.sleep(300)
        Logger.log('Bestaetigung — an ' + email + ' nachgeholt.')
      } catch (err) {
        Logger.log('Bestaetigung — Nachholen an ' + email + ' fehlgeschlagen: ' + err)
      }
    }
  }

  sendeVorschauen_(sheet, werte, iEmail, iStatus, tageBis, stunde, eventDaten, eventSlug, jetzt)

  ERINNERUNG_STUFEN.forEach(function (stufe) {
    const faellig =
      stufe.modus === 'tage'
        ? stufeFaelligAm_(stufe, eventSlug, tageBis, datumStr_(jetzt, 0)) && sendezeitErreicht_(jetzt, stufe)
        : stundenBis > 0 && stundenBis <= stufe.wert
    if (!faellig) return
    Logger.log('Erinnerung — "' + sheetName + '": Stufe "' + stufe.spalte + '" faellig.')

    const spalte = ensureColumn_(sheet, stufe.spalte)

    // Pro E-Mail nur eine Mail je Stufe, auch wenn jemand mehrfach in der
    // Tabelle steht (Doppelanmeldungen vom 30.09.2026).
    const erledigt = {}
    for (let r = 1; r < werte.length; r++) {
      if (werte[r][spalte - 1]) erledigt[String(werte[r][iEmail] || '').trim().toLowerCase()] = true
    }

    for (let r = 1; r < werte.length; r++) {
      const zeile = werte[r]
      const email = String(zeile[iEmail] || '').trim()
      if (!email) continue
      if (iStatus >= 0 && /abgemeldet|storniert|abgesagt/i.test(String(zeile[iStatus] || ''))) continue
      if (zeile[spalte - 1]) continue // in dieser Stufe schon verschickt
      if (erledigt[email.toLowerCase()]) {
        sheet.getRange(r + 1, spalte).setValue('Dublette')
        continue
      }
      if (MailApp.getRemainingDailyQuota() < 2) {
        Logger.log('Erinnerung — Tageskontingent erschoepft, Rest folgt beim naechsten Lauf.')
        return
      }

      let inhalt
      try {
        inhalt = stufe.bauen(eventDaten(zeile, email))
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
        erledigt[email.toLowerCase()] = true
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

// ── Vorschau ────────────────────────────────────────────────────────────────
// Einen Tag bevor eine Erinnerungsstufe an alle geht, bekommt VORSCHAU_EMPFAENGER
// genau diese Mail (von request@, mit Karte und Anhang) mit "[VORSCHAU]" im
// Betreff. So faellt ein falscher Text/Termin auf, bevor ihn die Teilnehmenden
// sehen (13.10.2026: 1-Woche-Mail ging noch in alter Form raus).
// Die 3-Std-Mail und die Nachfass-Mail (beide Varianten) kommen als Vorschau
// am Tag vor dem Event bzw. am Eventtag. Jede Vorschau geht pro Event und Stufe
// nur einmal raus (gemerkt in den Skript-Eigenschaften).
const VORSCHAU_EMPFAENGER = 'salich@annarchitecture-studio.com'

function sendeVorschauen_(sheet, werte, iEmail, iStatus, tageBis, stunde, eventDaten, eventSlug, jetzt) {
  if (stunde < ERINNERUNG_SENDESTUNDE) return
  // Empfaengerzahl (eindeutige E-Mails, nicht abgemeldet) fuer den Betreff.
  const empf = {}
  let beispiel = null
  for (let r = 1; r < werte.length; r++) {
    const email = String(werte[r][iEmail] || '').trim().toLowerCase()
    if (!email) continue
    if (iStatus >= 0 && /abgemeldet|storniert|abgesagt/i.test(String(werte[r][iStatus] || ''))) continue
    empf[email] = true
    if (!beispiel || email === VORSCHAU_EMPFAENGER) beispiel = werte[r]
  }
  const anzahl = Object.keys(empf).length
  if (!anzahl) return

  const props = PropertiesService.getScriptProperties()
  const sid = sheet.getParent().getId()
  ERINNERUNG_STUFEN.forEach(function (stufe) {
    // Tagesstufen: Vorschau am Vortag. 3-Std-Stufe: Vorschau am Tag vor dem Event.
    const morgenFaellig =
      stufe.modus === 'tage'
        ? stufeFaelligAm_(stufe, eventSlug, tageBis - 1, datumStr_(jetzt, 1))
        : tageBis === 1
    if (!morgenFaellig) return
    const e = eventDaten(beispiel, VORSCHAU_EMPFAENGER)
    // Pro Stufe und Versandtag einmal (bei verschobenem Versand kommt die
    // Vorschau also erneut).
    const key = 'vorschau_' + sid + '_' + stufe.spalte + '_' + datumStr_(jetzt, 1)
    if (props.getProperty(key)) return
    const varianten =
      stufe.bauen === mailNachfass_
        ? [['war da', nachfassDaMail_(e)], ['nicht da', nachfassNichtDaMail_(e)]]
        : [['', stufe.bauen(e)]]
    try {
      varianten.forEach(function (v) {
        const m = v[1]
        sendeTeilnehmerMail_(
          VORSCHAU_EMPFAENGER,
          '[VORSCHAU – morgen an ' + anzahl + ' Personen' + (v[0] ? ', Variante „' + v[0] + '“' : '') + '] ' + m.subject,
          m.htmlBody,
          m.attachments,
        )
      })
      props.setProperty(key, Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
      Logger.log('Vorschau "' + stufe.spalte + '" an ' + VORSCHAU_EMPFAENGER + ' verschickt.')
    } catch (err) {
      Logger.log('Vorschau "' + stufe.spalte + '" fehlgeschlagen: ' + err)
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
function markiereAnwesend_(sheet, data, row) {
  sheet
    .getRange(row, ensureColumn_(sheet, 'Anwesend'))
    .setValue(Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm'))
  sheet
    .getRange(row, ensureColumn_(sheet, 'Foto-Einwilligung'))
    .setValue(data.foto ? 'Ja' : 'Nein')
}

function schreibeZusatzfelder_(sheet, data, row) {
  sheet.getRange(row, ensureColumn_(sheet, 'Anrede')).setValue(anredeCode_(data.anrede))
  if (data.eventSpeaker) {
    sheet.getRange(row, ensureColumn_(sheet, 'Referent')).setValue(String(data.eventSpeaker))
  }
  if (data.eventSlug) {
    sheet.getRange(row, ensureColumn_(sheet, 'Slug')).setValue(String(data.eventSlug))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FOTOS + LINKEDIN in "History Anmeldungen" (nur intern, zum Wiedererkennen)
//  Quelle ist Anns private Tabelle "NBK Foto-Quelle (intern)" in ihrem Drive
//  (Spalten: E-Mail · Foto-URL · LinkedIn). Hier steht bewusst nur die
//  Datei-ID, KEINE Personendaten — dieses Repo ist oeffentlich.
//  Laeuft mit jedem sendeErinnerungen-Lauf (alle 15 min) und fuellt nur leere
//  Zellen; neue Recherche-Ergebnisse in der Quelle erscheinen so automatisch.
// ═══════════════════════════════════════════════════════════════════════════
const FOTO_QUELLE_ID = '1dYdZ85E8au41le0-XrSgb6W7Ey9tqYPOjMKwZ2YQ2EA'

function fotosInHistoryEintragen() {
  const quelle = SpreadsheetApp.openById(FOTO_QUELLE_ID).getSheets()[0].getDataRange().getValues()
  const kq = quelle[0]
  const qE = kq.indexOf('E-Mail'), qF = kq.indexOf('Foto-URL'), qL = kq.indexOf('LinkedIn')
  const proEmail = {}
  for (let r = 1; r < quelle.length; r++) {
    const e = String(quelle[r][qE] || '').trim().toLowerCase()
    if (e) proEmail[e] = { foto: String(quelle[r][qF] || '').trim(), linkedin: String(quelle[r][qL] || '').trim() }
  }

  const sheet = getOrCreateHistorySpreadsheet().getSheets()[0]
  const spFoto = ensureColumn_(sheet, 'Foto')
  const spLinkedin = ensureColumn_(sheet, 'LinkedIn')
  sheet.setColumnWidth(spFoto, 90)
  const werte = sheet.getDataRange().getValues()
  const formeln = sheet.getDataRange().getFormulas()
  const iE = werte[0].indexOf('E-Mail')
  let n = 0
  for (let r = 1; r < werte.length; r++) {
    const p = proEmail[String(werte[r][iE] || '').trim().toLowerCase()]
    if (!p) continue
    if (p.foto && !formeln[r][spFoto - 1] && !werte[r][spFoto - 1]) {
      sheet.getRange(r + 1, spFoto).setFormula('=IMAGE("' + p.foto.replace(/"/g, '%22') + '")')
      sheet.setRowHeight(r + 1, 90)
      n++
    }
    if (p.linkedin && !werte[r][spLinkedin - 1]) {
      sheet.getRange(r + 1, spLinkedin).setValue(p.linkedin)
      n++
    }
  }
  if (n) SpreadsheetApp.flush()
  Logger.log('Fotos/LinkedIn in History eingetragen: ' + n + ' Zellen.')
}

// ═══════════════════════════════════════════════════════════════════════════
//  FOTOS + VIDEOS: Ordner pro Event und Zugang fuer Fotograf:innen/Videograf:innen
//
//  Drive-Ordner BILDER_VIDEOS (Konto request@) enthaelt pro Event einen Ordner
//  "<Nummer>: <Kurztitel>" mit Photos / Photos_watermarked / Videos.
//  sendeErinnerungen (alle 15 min) legt ihn fuer jedes CMS-Event an
//  (bestehende Ordner werden ueber den Namensanfang "<Nummer>:" gefunden).
//
//  Tabelle "Media Contacts" (im selben Ordner):
//    Kontakte  — eine Zeile pro Person: Name, Rolle (Foto/Video), E-Mail, Credit …
//    Einsätze  — eine Zeile pro Event (legt das Skript an); Ann waehlt dort
//                Fotograf:in und Videograf:in aus der Kontaktliste aus.
//  Ist eine Person eingetragen, bekommt sie Bearbeitungszugriff auf Photos bzw.
//  Videos dieses Events (ohne Google-Benachrichtigung); den Link bekommt sie
//  am Tag nach dem Event. Spalte "Zugang Foto/Video" merkt, wer schon Zugang
//  hat; Zugang wird nie automatisch entzogen.
// ═══════════════════════════════════════════════════════════════════════════
const MEDIEN_ORDNER_ID = '1uVkvQlUi07UCx3CV8aEaKAdzXPzCX0PO' // BILDER_VIDEOS
const MEDIEN_SHEET_NAME = 'Media Contacts'
const MEDIEN_UNTERORDNER = ['Photos', 'Photos_watermarked', 'Videos']
// Reihenfolge der Anfragen je Rolle: erst A, dann B, dann C (bis zu drei Personen).
const MEDIEN_PRIORITAETEN = ['A', 'B', 'C']
const KONTAKTE_HEADERS = [
  'Name', 'Rolle', 'E-Mail', 'Priorität', 'Aktiv', 'Credit im Wasserzeichen', 'Telefon', 'Abrechnungsart', 'Menge', 'Netto Satz', 'Gesamt Netto', 'Notizen',
]
const EINSAETZE_HEADERS = [
  'Event', 'Datum', 'Fotograf:in', 'Videograf:in', 'Fotos-Ordner', 'Videos-Ordner', 'Zugang Foto', 'Zugang Video', 'Slug',
]

function medienSpreadsheet_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('medienSheetId')
  if (id) {
    try {
      return SpreadsheetApp.openById(id)
    } catch (err) {
      props.deleteProperty('medienSheetId')
    }
  }
  const ordner = DriveApp.getFolderById(MEDIEN_ORDNER_ID)
  const vorhanden = ordner.getFilesByName(MEDIEN_SHEET_NAME)
  if (vorhanden.hasNext()) {
    const ss = SpreadsheetApp.open(vorhanden.next())
    props.setProperty('medienSheetId', ss.getId())
    return ss
  }

  const ss = SpreadsheetApp.create(MEDIEN_SHEET_NAME)
  moveFileIntoFolder(DriveApp.getFileById(ss.getId()), ordner)
  const kontakte = ss.getSheets()[0].setName('Kontakte')
  kontakte.appendRow(KONTAKTE_HEADERS)
  kontakte.appendRow(['Ruthe Zuntz', 'Foto', '', 'A', 'Ja', '© Ruthe Zuntz', '', '', '', '', '', 'Session 01'])
  const auswahl = function (spalte, werte) {
    kontakte
      .getRange(2, KONTAKTE_HEADERS.indexOf(spalte) + 1, 500, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(werte, true).build())
  }
  auswahl('Rolle', ['Foto', 'Video'])
  auswahl('Priorität', MEDIEN_PRIORITAETEN)
  auswahl('Aktiv', ['Ja', 'Nein'])

  const einsaetze = ss.insertSheet('Einsätze')
  einsaetze.appendRow(EINSAETZE_HEADERS)
  const namen = SpreadsheetApp.newDataValidation()
    .requireValueInRange(kontakte.getRange('A2:A'), true)
    .build()
  ;['Fotograf:in', 'Videograf:in'].forEach(function (spalte) {
    einsaetze.getRange(2, EINSAETZE_HEADERS.indexOf(spalte) + 1, 200, 1).setDataValidation(namen)
  })
  ;[kontakte, einsaetze].forEach(function (sh) {
    sh.setFrozenRows(1)
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold')
  })
  einsaetze.hideColumns(EINSAETZE_HEADERS.indexOf('Slug') + 1)
  einsaetze.getRange(2, EINSAETZE_HEADERS.indexOf('Datum') + 1, 200, 1).setNumberFormat('@')
  einsaetze.setColumnWidth(1, 320)

  try {
    DriveApp.getFileById(ss.getId()).addEditor(VORSCHAU_EMPFAENGER)
  } catch (err) {
    Logger.log('Media Contacts — Freigabe fehlgeschlagen: ' + err)
  }
  props.setProperty('medienSheetId', ss.getId())
  Logger.log('Media Contacts angelegt: ' + ss.getUrl())
  return ss
}

function medienOrdnerName_(ev) {
  const nr = String(ev.number || '').trim()
  // Kurztitel; ohne ":" im Titel bis zum ersten " - " (DAZ EVENT: ARCHITECTURE INTELLIGENCE)
  const titel = kurzTitel_(String(ev.title || ev.slug || '').trim()).split(' - ')[0].trim()
  return nr ? nr + ': ' + titel : titel
}

// Event-Ordner (mit Unterordnern) zu einem CMS-Event. anlegen=false -> nur
// suchen. null, wenn keiner existiert und nicht angelegt werden soll.
function medienEventOrdner_(ev, anlegen) {
  const slug = String(ev.slug || '')
  const props = PropertiesService.getScriptProperties()
  const key = 'medienOrdner_' + slug
  let ordner = null
  const id = props.getProperty(key)
  if (id) {
    try {
      ordner = DriveApp.getFolderById(id)
      if (ordner.isTrashed()) ordner = null
    } catch (err) {
      ordner = null
    }
  }
  const basis = DriveApp.getFolderById(MEDIEN_ORDNER_ID)
  if (!ordner) {
    // Von Hand angelegte Ordner ("Session 03: …") ueber den Namensanfang finden.
    const nr = String(ev.number || '').trim()
    const treffer = []
    const alle = basis.getFolders()
    while (alle.hasNext()) {
      const f = alle.next()
      const name = f.getName()
      if (name === medienOrdnerName_(ev) || (nr && name.indexOf(nr + ':') === 0)) treffer.push(f)
    }
    if (treffer.length === 1) ordner = treffer[0]
    else if (treffer.length > 1) {
      Logger.log('Medien — mehrere Ordner fuer "' + nr + '", bitte einen umbenennen. Uebersprungen.')
      return null
    }
  }
  if (!ordner && !anlegen) return null
  if (!ordner) {
    ordner = basis.createFolder(medienOrdnerName_(ev))
    Logger.log('Medien — Ordner angelegt: ' + ordner.getName())
  }
  props.setProperty(key, ordner.getId())

  const unter = {}
  MEDIEN_UNTERORDNER.forEach(function (name) {
    const it = ordner.getFoldersByName(name)
    unter[name] = it.hasNext() ? it.next() : ordner.createFolder(name)
  })
  return { ordner: ordner, unter: unter }
}

// Bearbeitungszugriff ohne Googles eigene Benachrichtigungsmail (erweiterter
// Dienst "Drive API"); fehlt der Dienst, geht es ueber DriveApp.
function medienZugangGeben_(folder, email) {
  if (typeof Drive !== 'undefined') {
    Drive.Permissions.create(
      { role: 'writer', type: 'user', emailAddress: email },
      folder.getId(),
      { sendNotificationEmail: false },
    )
  } else {
    folder.addEditor(email)
  }
}

// Honorar fuer die Anfrage-Mail aus den Spalten Abrechnungsart / Menge /
// Netto Satz / Gesamt Netto (z. B. "300 € netto (2 Std. à 150 €)" oder
// "700 € netto, pauschal"). Fallback: alte Spalte "Honorar". Leer -> der
// Honorar-Absatz entfaellt in der Mail.
function medienHonorarText_(zeile, kopf) {
  const wert = function (n) {
    const i = kopf.indexOf(n)
    return i >= 0 ? String(zeile[i] == null ? '' : zeile[i]).trim() : ''
  }
  const euro = function (v) {
    const n = Number(String(v).replace(',', '.'))
    if (isNaN(n) || v === '') return String(v)
    return (n % 1 ? n.toFixed(2) : String(n)).replace('.', ',') + ' €'
  }
  const art = wert('Abrechnungsart')
  const menge = wert('Menge')
  const satz = wert('Netto Satz')
  let gesamt = wert('Gesamt Netto')
  if (!gesamt && menge && satz) gesamt = String(Number(menge) * Number(String(satz).replace(',', '.')))
  if (!gesamt) return wert('Honorar')
  if (/stunde/i.test(art) && menge && satz) {
    return euro(gesamt) + ' netto (' + String(menge).replace('.', ',') + ' Std. à ' + euro(satz) + ')'
  }
  return euro(gesamt) + ' netto' + (art ? ', ' + art : '')
}

// Foto/Video bekommen nur: Anfrage (mit .ics) · 1 Tag vorher (Erinnerung,
// .ics) · Tag danach (Upload-Link) · bei Aenderung von Datum/Zeit/Ort eine
// Aenderungs-Mail (Ann, 24.10.2026). Nach der Zusage keine eigene Mail —
// der Ordnerzugriff wird still vergeben, der Link kommt nach dem Event.
// Von Hand in "Einsätze" eingetragene Personen (ohne Anfrage) bekommen die
// Anfrage-Mail ohne Zusage-Knoepfe, damit auch sie die .ics haben.
function medienAnfrageOhneToken_(kontakt, rolle, ev) {
  const m = medienMail_('anfrage', medienMailDaten_(kontakt, rolle, ev, {}))
  const ics = medienIcs_(ev, rolle, '')
  sendeTeilnehmerMail_(kontakt.email, m.subject, m.htmlBody, ics ? [ics] : undefined, true)
  PropertiesService.getScriptProperties().setProperty(medienStandKey_(ev, kontakt), medienStand_(ev))
}

// Stand von Datum/Zeit/Ort, den die Person zuletzt per Mail bekommen hat.
function medienStandKey_(ev, kontakt) {
  return 'medienStand_' + String(ev.slug) + '_' + String(kontakt.email).toLowerCase()
}

function medienStand_(ev) {
  return JSON.stringify([String(ev.date || ''), String(ev.time || ''), String(ev.location || '')])
}

// Token der Zusage (fuer den Absage-Link in der Aenderungs-Mail), '' wenn
// die Person von Hand in "Einsätze" eingetragen wurde.
function medienToken_(anfragen, slug, rolle, email) {
  const w = anfragen.getDataRange().getValues()
  const c = function (n) { return ANFRAGEN_HEADERS.indexOf(n) }
  for (let i = w.length - 1; i > 0; i--) {
    if (String(w[i][c('Slug')]) === slug && String(w[i][c('Rolle')]) === rolle &&
      String(w[i][c('E-Mail')]).toLowerCase() === email.toLowerCase() && w[i][c('Status')] === 'zugesagt') {
      return String(w[i][c('Token')])
    }
  }
  return ''
}

// Nach Zugang/Upload-Mail, bei jedem Lauf je eingesetzter Person:
//  - vor dem Event: Datum, Zeit oder Ort im CMS geaendert -> Aenderungs-Mail
//    mit neuer .ics (gleiche UID, ersetzt den alten Kalendereintrag)
//  - nach dem Event: einmal die Danke-Mail mit dem Upload-Link, ab dem Tag
//    danach (ab ERINNERUNG_SENDESTUNDE), hoechstens MEDIEN_DANKE_TAGE spaeter.
const MEDIEN_DANKE_TAGE = 3

function medienNachlauf_(anfragen, kontakt, rolle, ev, folder, start, jetzt) {
  if (!start) return
  const props = PropertiesService.getScriptProperties()
  const slug = String(ev.slug)
  if (start.getTime() > jetzt.getTime()) {
    const tageBis = tagesDifferenz_(jetzt, start)
    const ab = Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'H')) >= ERINNERUNG_SENDESTUNDE
    const mail = function (key) { return medienMail_(key, medienMailDaten_(kontakt, rolle, ev, { upload: folder.getUrl() })) }
    const wer = 'morgen ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr an ' + kontakt.name
    const email = String(kontakt.email).toLowerCase()
    // Vorschauen am Vortag: Erinnerung (2 Tage vor dem Event), Danke (Eventtag).
    if (ab && tageBis === 2) {
      const ics = medienIcs_(ev, rolle, '')
      vorschauAnAnn_('medienTagVorschau_' + slug + '_' + email, mail('tag'), wer, mailGruppe_('medien'), slug, ics ? [ics] : undefined)
    }
    if (ab && tageBis === 0) vorschauAnAnn_('medienDankeVorschau_' + slug + '_' + email, mail('danke'), wer, mailGruppe_('medien'), slug)
    // 1 Tag vorher: Erinnerung mit .ics.
    if (ab && tageBis === 1 && !props.getProperty('medienTag_' + slug + '_' + email)) {
      const m = mail('tag')
      const ics = medienIcs_(ev, rolle, '')
      sendeTeilnehmerMail_(kontakt.email, m.subject, m.htmlBody, ics ? [ics] : undefined)
      props.setProperty('medienTag_' + slug + '_' + email, jetztText_())
      props.setProperty(medienStandKey_(ev, kontakt), medienStand_(ev))
      Logger.log('Medien — Erinnerung 1 Tag vorher ' + rolle + ' an ' + kontakt.email + ' (' + slug + ')')
      return
    }
    const key = medienStandKey_(ev, kontakt)
    const alt = props.getProperty(key)
    const neu = medienStand_(ev)
    if (!alt) { props.setProperty(key, neu); return } // Zugang aus der Zeit vor dieser Funktion
    if (alt === neu) return
    const a = JSON.parse(alt)
    const m = medienMail_('aenderung', medienMailDaten_(kontakt, rolle, ev, {
      token: medienToken_(anfragen, slug, rolle, kontakt.email),
      vorher: a[0] + (a[1] ? ' · ' + a[1] + ' Uhr' : '') + (a[2] ? ' · ' + a[2] : ''),
    }))
    const ics = medienIcs_(ev, rolle, '')
    sendeTeilnehmerMail_(kontakt.email, m.subject, m.htmlBody, ics ? [ics] : undefined, true)
    props.setProperty(key, neu)
    Logger.log('Medien — Aenderungs-Mail ' + rolle + ' an ' + kontakt.email + ' (' + slug + ')')
    return
  }
  const tage = tagesDifferenz_(jetzt, start)
  if (tage > -1 || tage < -MEDIEN_DANKE_TAGE) return
  if (Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'H')) < ERINNERUNG_SENDESTUNDE) return
  const key = 'medienDanke_' + slug + '_' + String(kontakt.email).toLowerCase()
  if (props.getProperty(key)) return
  const m = medienMail_('danke', medienMailDaten_(kontakt, rolle, ev, { upload: folder.getUrl() }))
  sendeTeilnehmerMail_(kontakt.email, m.subject, m.htmlBody)
  props.setProperty(key, jetztText_())
  Logger.log('Medien — Danke-Mail ' + rolle + ' an ' + kontakt.email + ' (' + slug + ')')
}

// Kalenderdatei fuer Foto/Video nach der Zusage: Beginn = Ankunftszeit
// (Eventbeginn minus MEDIEN_VORLAUF_MIN), Ende = Eventende. Eigene UID je
// Event+Rolle, damit sie nicht mit der .ics der Teilnehmenden kollidiert.
function medienIcs_(ev, rolle, uploadUrl) {
  const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
  if (!start) return null
  const ende = parseEventEnde_(start, String(ev.time || ''))
  const ankunft = new Date(start.getTime() - MEDIEN_VORLAUF_MIN * 60000)
  const utc = function (d) { return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'") }
  const esc = function (x) { return String(x || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n') }
  const ort = String(ev.location || '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NewBuild Kollektiv//Foto Video//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + String(ev.slug) + '-' + (rolle === 'Foto' ? 'foto' : 'video') + '@newbuild-kollektiv.com',
    'SEQUENCE:' + Math.floor(Date.now() / 1000),
    'DTSTAMP:' + utc(new Date()),
    'DTSTART:' + utc(ankunft),
    'DTEND:' + utc(ende),
    'SUMMARY:' + esc((rolle === 'Foto' ? 'Fotografie' : 'Video') + ' · NewBuild Kollektiv – ' + kurzTitel_(ev.title)),
    'LOCATION:' + esc(ort),
    'DESCRIPTION:' + esc(
      'Ankunft ' + MEDIEN_VORLAUF_MIN + ' Minuten vor Beginn, Eventbeginn ' + String(ev.time || '') + ' Uhr.' +
      (ort ? '\n\nAnfahrt (Google Maps): ' + mapsLink_(ort) : '') +
      (uploadUrl ? '\nUpload-Ordner: ' + uploadUrl : '') +
      '\nInfos zum Event: ' + eventSeiteUrl_(ev.slug),
    ),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Zeit zum Aufbrechen – NewBuild Kollektiv'),
    'TRIGGER:-PT' + AUFBRUCH_VORLAUF_MIN + 'M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return Utilities.newBlob(lines.join('\r\n'), 'text/calendar; charset=utf-8; method=PUBLISH', 'newbuild-kollektiv-' + (rolle === 'Foto' ? 'foto' : 'video') + '.ics')
}

// Laeuft mit sendeErinnerungen: Ordner anlegen, Einsätze-Zeilen pflegen,
// Zugang vergeben.
function medienAbgleichen_(cmsEvents) {
  const ss = medienSpreadsheet_()
  const kontakte = ss.getSheetByName('Kontakte')
  const einsaetze = ss.getSheetByName('Einsätze')
  if (!kontakte || !einsaetze) throw new Error('Tabellenblatt "Kontakte" oder "Einsätze" fehlt')

  const kWerte = kontakte.getDataRange().getValues()
  const kk = kWerte[0]
  const perName = {}
  for (let r = 1; r < kWerte.length; r++) {
    const name = String(kWerte[r][kk.indexOf('Name')] || '').trim()
    if (!name) continue
    perName[name.toLowerCase()] = {
      name: name,
      rolle: String(kWerte[r][kk.indexOf('Rolle')] || '').trim(),
      email: String(kWerte[r][kk.indexOf('E-Mail')] || '').trim(),
      credit: String(kWerte[r][kk.indexOf('Credit im Wasserzeichen')] || '').trim(),
      prioritaet: String(kWerte[r][kk.indexOf('Priorität')] || '').trim().toUpperCase(),
      aktiv: String(kWerte[r][kk.indexOf('Aktiv')] || '').trim(),
      honorar: medienHonorarText_(kWerte[r], kk),
    }
  }
  const kontaktListe = Object.keys(perName).map(function (k) { return perName[k] })
  const anfragen = medienAnfragenSheet_(ss)
  // Auswahlliste "Priorität" in bestehenden Tabellen einmalig auf A/B/C erweitern.
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty('medienPrioritaeten') !== MEDIEN_PRIORITAETEN.join('')) {
    kontakte
      .getRange(2, kk.indexOf('Priorität') + 1, 500, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MEDIEN_PRIORITAETEN, true).build())
    props.setProperty('medienPrioritaeten', MEDIEN_PRIORITAETEN.join(''))
  }
  try {
    grundvorlageDoc_(mailGruppe_('medien')) // Grundvorlage sofort anlegen
  } catch (err) {
    Logger.log('Medien-Mail-Doc — ' + err)
  }

  const heute = new Date()
  let werte = einsaetze.getDataRange().getValues()
  const ek = werte[0]
  const col = function (name) { return ek.indexOf(name) + 1 }
  const zeileProSlug = {}
  for (let r = 1; r < werte.length; r++) {
    const s = String(werte[r][col('Slug') - 1] || '').trim()
    if (s) zeileProSlug[s] = r + 1
  }

  cmsEvents.forEach(function (ev) {
    const slug = String(ev.slug || '').trim()
    if (!slug) return
    const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
    const m = medienEventOrdner_(ev, true) // jedes CMS-Event bekommt einen Ordner, auch vergangene
    if (!m) return

    let zeile = zeileProSlug[slug]
    if (!zeile) {
      einsaetze.appendRow([medienOrdnerName_(ev), '', '', '', '', '', '', '', slug])
      zeile = einsaetze.getLastRow()
      zeileProSlug[slug] = zeile
    }
    // Name, Datum, Ordner-Links immer aktuell halten (Datum kommt aus dem CMS).
    einsaetze.getRange(zeile, col('Event')).setValue(medienOrdnerName_(ev))
    einsaetze.getRange(zeile, col('Datum')).setValue(String(ev.date || ''))
    einsaetze.getRange(zeile, col('Fotos-Ordner')).setValue(m.unter.Photos.getUrl())
    einsaetze.getRange(zeile, col('Videos-Ordner')).setValue(m.unter.Videos.getUrl())

    const z = einsaetze.getRange(zeile, 1, 1, ek.length).getValues()[0]

    // Kommende Events ohne eingetragene Person: A anfragen, bei Absage /
    // keiner Antwort B (siehe medienAnfragen_). Von Hand Eingetragenes geht vor.
    if (start && start.getTime() > heute.getTime()) {
      ;[['Foto', 'Fotograf:in'], ['Video', 'Videograf:in']].forEach(function (r) {
        if (String(z[col(r[1]) - 1] || '').trim()) return
        try {
          const zugesagt = medienAnfragen_(anfragen, ev, r[0], kontaktListe, heute)
          if (zugesagt) {
            einsaetze.getRange(zeile, col(r[1])).setValue(zugesagt)
            z[col(r[1]) - 1] = zugesagt
          }
        } catch (err) {
          Logger.log('Medien — Anfrage ' + r[0] + ' (' + slug + ') fehlgeschlagen: ' + err)
        }
      })
    }

    ;[
      ['Foto', 'Fotograf:in', 'Zugang Foto', m.unter.Photos],
      ['Video', 'Videograf:in', 'Zugang Video', m.unter.Videos],
    ].forEach(function (rolle) {
      const name = String(z[col(rolle[1]) - 1] || '').trim()
      if (!name) return
      const kontakt = perName[name.toLowerCase()]
      if (!kontakt || !kontakt.email) {
        einsaetze.getRange(zeile, col(rolle[2])).setValue('E-Mail fehlt in „Kontakte“')
        return
      }
      const bisher = String(z[col(rolle[2]) - 1] || '')
      if (bisher.toLowerCase().indexOf(kontakt.email.toLowerCase()) < 0) {
        try {
          medienZugangGeben_(rolle[3], kontakt.email)
          let vermerk = kontakt.email + ' · ' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy')
          // Von Hand eingetragen (keine Zusage per Anfrage): Termin-Mail mit .ics.
          if (start && start.getTime() > heute.getTime() && !medienToken_(anfragen, slug, rolle[0], kontakt.email)) {
            medienAnfrageOhneToken_(kontakt, rolle[0], ev)
            vermerk += ' · Termin-Mail'
          }
          // Mehrere Personen nacheinander: alte Vermerke behalten.
          const alt = /E-Mail fehlt|FEHLER/.test(bisher) ? '' : bisher
          einsaetze.getRange(zeile, col(rolle[2])).setValue(alt ? alt + '\n' + vermerk : vermerk)
          Logger.log('Medien — Zugang ' + rolle[0] + ' fuer ' + kontakt.email + ' (' + slug + ')')
        } catch (err) {
          einsaetze.getRange(zeile, col(rolle[2])).setValue('FEHLER: ' + err)
          return
        }
      }
      try {
        medienNachlauf_(anfragen, kontakt, rolle[0], ev, rolle[3], start, heute)
      } catch (err) {
        Logger.log('Medien — Aenderung/Danke ' + rolle[0] + ' (' + slug + '): ' + err)
      }
    })

    // Eigener Uebersichtstermin im privaten Kalender (nur Ann), mit Besetzung.
    if (start) {
      try {
        kalenderTermin_(ev, start, parseEventEnde_(start, String(ev.time || '')),
          'Foto: ' + (String(z[col('Fotograf:in') - 1] || '').trim() || 'offen') +
          '\nVideo: ' + (String(z[col('Videograf:in') - 1] || '').trim() || 'offen'))
      } catch (err) {
        Logger.log('Kalender — ' + slug + ': ' + err)
      }
    }
  })
  SpreadsheetApp.flush()
  medienEventsInKontakte_(kontakte, einsaetze)
}

// Spalte "Events" in "Kontakte": bei welchen Events die Person eingesetzt war
// bzw. ist (aus "Einsätze" — also nach Zusage oder wenn Ann sie einträgt).
// Wird bei jedem Lauf neu berechnet; "Notizen" bleibt unangetastet.
function medienEventsInKontakte_(kontakte, einsaetze, spalten) {
  const ew = einsaetze.getDataRange().getValues()
  const ek = ew[0]
  const proName = {}
  for (let r = 1; r < ew.length; r++) {
    const event = String(ew[r][ek.indexOf('Event')] || '').trim()
    if (!event) continue
    ;(spalten || ['Fotograf:in', 'Videograf:in']).forEach(function (sp) {
      const n = String(ew[r][ek.indexOf(sp)] || '').trim().toLowerCase()
      if (!n) return
      ;(proName[n] = proName[n] || []).push(event)
    })
  }
  const spalte = ensureColumn_(kontakte, 'Events')
  const kw = kontakte.getDataRange().getValues()
  const iName = kw[0].indexOf('Name')
  for (let r = 1; r < kw.length; r++) {
    const n = String(kw[r][iName] || '').trim().toLowerCase()
    if (!n) continue
    const neu = (proName[n] || []).join('\n')
    if (String(kw[r][spalte - 1] || '') !== neu) kontakte.getRange(r + 1, spalte).setValue(neu)
  }
}

// EINMALIG im Editor ausfuehren: legt "Media Contacts" und die Event-Ordner
// sofort an (statt beim naechsten 15-Minuten-Lauf) und fragt die Berechtigungen ab.
function medienJetztEinrichten() {
  medienAbgleichen_(ladeCmsEvents_())
  Logger.log('Media Contacts: ' + medienSpreadsheet_().getUrl())
}

// ── Anfragen an Fotograf:innen / Videograf:innen (A, dann B) ─────────────────
// Fuer jedes kommende Event ohne eingetragene Person je Rolle (Foto/Video):
//   1. Anfrage an den aktiven Kontakt mit Prioritaet A (danach B, dann C) (Mail mit Zusage-/
//      Absage-Link, Honorar falls eingetragen).
//   2. Nach MEDIEN_FRIST_TAGE ohne Antwort "keine Antwort" -> naechster
//      Kontakt (B, dann C). Keine Erinnerungs-Mail dazwischen.
//   3. Zusage -> Name in "Einsätze"; der Abgleich gibt still Zugang zum Ordner
//      (Upload-Link kommt am Tag nach dem Event). Absage -> naechster Kontakt.
//   4. Niemand mehr uebrig -> einmal Mail an Ann, nichts weiter.
// Verlauf im Blatt "Anfragen". Texte im Event-Doc "Mail-Texte Foto & Video"
// (sonst Grundvorlage, sonst die Standardtexte unten, siehe MAIL-GRUPPEN).
// Foto/Video sollen so viele Minuten vor Eventbeginn da sein (Platzhalter {Ankunft}).
const MEDIEN_VORLAUF_MIN = 30
const MEDIEN_FRIST_TAGE = 3
const ANFRAGEN_HEADERS = [
  'Event', 'Rolle', 'Name', 'E-Mail', 'Priorität', 'Status', 'Angefragt am', 'Erinnert am', 'Antwort am', 'Slug', 'Token', 'Seit',
]
const MEDIEN_OFFEN = ['angefragt', 'erinnert']

function medienAnfragenSheet_(ss) {
  let sh = ss.getSheetByName('Anfragen')
  if (sh) {
    return sh
  }
  sh = ss.insertSheet('Anfragen')
  sh.appendRow(ANFRAGEN_HEADERS)
  sh.setFrozenRows(1)
  sh.getRange(1, 1, 1, ANFRAGEN_HEADERS.length).setFontWeight('bold')
  ;['Slug', 'Token', 'Seit'].forEach(function (n) { sh.hideColumns(ANFRAGEN_HEADERS.indexOf(n) + 1) })
  sh.setColumnWidth(1, 320)
  return sh
}

function jetztText_() {
  return Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm')
}

function medienZusageLink_(token, ja) {
  return SITE_FORM_URL + '?do=medien&t=' + encodeURIComponent(token) + '&a=' + (ja ? 'ja' : 'nein')
}

// Gibt den Namen zurueck, falls fuer Event+Rolle schon jemand zugesagt hat.
function medienAnfragen_(sh, ev, rolle, kontaktListe, jetzt) {
  const slug = String(ev.slug)
  const werte = sh.getDataRange().getValues()
  const c = function (n) { return ANFRAGEN_HEADERS.indexOf(n) }
  const eigene = []
  for (let r = 1; r < werte.length; r++) {
    if (String(werte[r][c('Slug')]) === slug && String(werte[r][c('Rolle')]) === rolle) eigene.push(r)
  }
  const zugesagt = eigene.filter(function (r) { return werte[r][c('Status')] === 'zugesagt' })[0]
  if (zugesagt !== undefined) return String(werte[zugesagt][c('Name')])

  const offen = eigene.filter(function (r) { return MEDIEN_OFFEN.indexOf(String(werte[r][c('Status')])) >= 0 })[0]
  if (offen !== undefined) {
    const tage = (jetzt.getTime() - Number(werte[offen][c('Seit')] || 0)) / 86400000
    if (tage < MEDIEN_FRIST_TAGE) {
      return null // keine Erinnerungs-Mail bei fehlender Antwort (Ann: nur 3 Mails)
    }
    sh.getRange(offen + 1, c('Status') + 1).setValue('keine Antwort')
    werte[offen][c('Status')] = 'keine Antwort'
  }

  const gefragt = {}
  eigene.forEach(function (r) { gefragt[String(werte[r][c('E-Mail')]).toLowerCase()] = true })
  const rang = function (p) {
    const i = MEDIEN_PRIORITAETEN.indexOf(p)
    return i >= 0 ? i : MEDIEN_PRIORITAETEN.length
  }
  const kandidaten = kontaktListe
    .filter(function (k) {
      return k.rolle === rolle && !/^nein$/i.test(k.aktiv) && k.email && !gefragt[k.email.toLowerCase()]
    })
    .sort(function (a, b) { return rang(a.prioritaet) - rang(b.prioritaet) })

  if (kandidaten.length) {
    const k = kandidaten[0]
    // Erste Anfrage je Event+Rolle: heute Vorschau an Ann, Versand morgen ab
    // ERINNERUNG_SENDESTUNDE (Ann kann den Text im Event-Doc noch anpassen).
    // Weitere Personen (B, C) und knappe Termine: sofort, mit Kopie an Ann.
    const erste = !eigene.length
    const evStart = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
    const knapp = !evStart || evStart.getTime() - jetzt.getTime() < 2 * 86400000
    const pr = PropertiesService.getScriptProperties()
    const planKey = 'medienAnfragePlan_' + slug + '_' + rolle
    if (erste && !knapp) {
      const plan = Number(pr.getProperty(planKey) || 0)
      if (!plan) {
        const vIcs = medienIcs_(ev, rolle, '')
        vorschauAnAnn_(planKey + '_vorschau', medienMail_('anfrage', medienMailDaten_(k, rolle, ev, { token: 'VORSCHAU' })),
          'morgen ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr an ' + k.name, mailGruppe_('medien'), slug, vIcs ? [vIcs] : undefined)
        pr.setProperty(planKey, String(morgenUm_(jetzt)))
        return null
      }
      if (jetzt.getTime() < plan) return null
    }
    const token = Utilities.getUuid()
    const m = medienMail_('anfrage', medienMailDaten_(k, rolle, ev, { token: token }))
    const ics = medienIcs_(ev, rolle, '')
    sendeTeilnehmerMail_(k.email, m.subject, m.htmlBody, ics ? [ics] : undefined, !erste || knapp)
    pr.setProperty(medienStandKey_(ev, k), medienStand_(ev))
    sh.appendRow([
      medienOrdnerName_(ev), rolle, k.name, k.email, k.prioritaet, 'angefragt', jetztText_(), '', '', slug, token, jetzt.getTime(),
    ])
    Logger.log('Medien — Anfrage ' + rolle + ' an ' + k.email + ' (' + slug + ')')
    return null
  }

  // Niemand (mehr) da: Ann einmal informieren — aber nur, wenn ueberhaupt
  // jemand angefragt wurde (ohne Kontakte fuer die Rolle keine Mail pro Event).
  const props = PropertiesService.getScriptProperties()
  const key = 'medienFehlt_' + slug + '_' + rolle
  if (eigene.length && !props.getProperty(key)) {
    GmailApp.sendEmail(
      VORSCHAU_EMPFAENGER,
      (rolle === 'Foto' ? 'Fotograf:in' : 'Videograf:in') + ' fehlt: ' + kurzTitel_(ev.title),
      'Für „' + String(ev.title || '').trim() + '“ (' + String(ev.date || '') + ') hat niemand aus der ' +
        'Kontaktliste für ' + rolle + ' zugesagt. Bitte selbst jemanden finden und in „Media Contacts“ → ' +
        'Einsätze eintragen.\n\n' + sh.getParent().getUrl(),
      { name: SENDER_NAME, from: SENDER_EMAIL },
    )
    props.setProperty(key, jetztText_())
  }
  return null
}

// Klick auf Zusage-/Absage-Link (newbuild-kollektiv.com/f/?do=medien&t=…&a=ja|nein).
function medienAntwortVerarbeiten_(p) {
  const token = String(p.t || '').trim()
  const ja = String(p.a || '') === 'ja'
  const ss = medienSpreadsheet_()
  const sh = medienAnfragenSheet_(ss)
  const werte = sh.getDataRange().getValues()
  const c = function (n) { return ANFRAGEN_HEADERS.indexOf(n) }
  let r = -1
  for (let i = 1; i < werte.length; i++) if (token && String(werte[i][c('Token')]) === token) r = i
  if (r < 0) {
    return abmeldeSeite_('<h1>Ups</h1><p>Diese Anfrage kennen wir nicht (mehr). Bitte antworte kurz auf die E-Mail.</p>')
  }
  const z = werte[r]
  const status = String(z[c('Status')])
  const slug = String(z[c('Slug')])
  const rolle = String(z[c('Rolle')])
  const event = String(z[c('Event')])
  const name = String(z[c('Name')])
  const spalte = rolle === 'Foto' ? 'Fotograf:in' : 'Videograf:in'
  const info = function (betreff, text) {
    try {
      GmailApp.sendEmail(VORSCHAU_EMPFAENGER, betreff, text + '\n\n' + ss.getUrl(), { name: SENDER_NAME, from: SENDER_EMAIL })
    } catch (err) {
      Logger.log('Medien — Info an Ann fehlgeschlagen: ' + err)
    }
  }
  const setze = function (st) {
    sh.getRange(r + 1, c('Status') + 1).setValue(st)
    sh.getRange(r + 1, c('Antwort am') + 1).setValue(jetztText_())
  }
  const einsatzZeile = function () {
    const e = ss.getSheetByName('Einsätze')
    const ew = e.getDataRange().getValues()
    const iSlug = ew[0].indexOf('Slug')
    for (let i = 1; i < ew.length; i++) {
      if (String(ew[i][iSlug]) === slug) return { sh: e, zeile: i + 1, spalte: ew[0].indexOf(spalte) + 1, wert: String(ew[i][ew[0].indexOf(spalte)] || '').trim() }
    }
    return null
  }

  if (ja) {
    if (status === 'zugesagt') {
      return abmeldeSeite_('<h1>Schon eingetragen</h1><p>Du hast für „' + escapeHtml_(event) + '“ bereits zugesagt. Danke!</p>')
    }
    const e = einsatzZeile()
    // Auch eine verspaetete Zusage gilt, solange die Rolle frei ist und gerade
    // niemand anderes angefragt ist.
    const andereOffen = werte.some(function (w, i) {
      return i > 0 && i !== r && String(w[c('Slug')]) === slug && String(w[c('Rolle')]) === rolle &&
        (MEDIEN_OFFEN.indexOf(String(w[c('Status')])) >= 0 || w[c('Status')] === 'zugesagt')
    })
    if (e && !e.wert && (MEDIEN_OFFEN.indexOf(status) >= 0 || !andereOffen)) {
      setze('zugesagt')
      e.sh.getRange(e.zeile, e.spalte).setValue(name)
      SpreadsheetApp.flush()
      info('Zusage ' + rolle + ': ' + name + ' – ' + event, name + ' hat für ' + rolle + ' bei „' + event + '“ zugesagt.')
      return abmeldeSeite_(
        '<h1>Danke, du bist dabei!</h1><p>Wir haben dich für „' + escapeHtml_(event) + '“ eingetragen. ' +
          'Die Kalenderdatei (.ics) aus der Anfrage-Mail kannst du jetzt in deinen Kalender übernehmen. Einen Tag vorher erinnern wir dich noch einmal, und nach dem Event bekommst du den Link zum Upload-Ordner.</p>',
        'Zugesagt – NewBuild Kollektiv',
      )
    }
    setze(status + ' · später zugesagt')
    info('Späte Zusage ' + rolle + ': ' + name + ' – ' + event,
      name + ' hat für ' + rolle + ' bei „' + event + '“ zugesagt, die Rolle ist aber schon vergeben oder die Anfrage ging inzwischen an jemand anderen. Bitte klären.')
    return abmeldeSeite_(
      '<h1>Danke für deine Rückmeldung!</h1><p>Wir hatten inzwischen schon jemand anderen angefragt. Ann-Kathrin meldet sich kurz bei dir.</p>',
    )
  }

  if (status === 'zugesagt') {
    setze('abgesagt nach Zusage')
    const e = einsatzZeile()
    if (e && e.wert === name) e.sh.getRange(e.zeile, e.spalte).setValue('')
    SpreadsheetApp.flush()
    info('Absage nach Zusage ' + rolle + ': ' + name + ' – ' + event,
      name + ' hat für ' + rolle + ' bei „' + event + '“ nachträglich abgesagt. Die nächste Person wird automatisch angefragt. Den Ordnerzugriff ggf. von Hand entziehen.')
  } else if (MEDIEN_OFFEN.indexOf(status) >= 0) {
    setze('abgesagt')
    info('Absage ' + rolle + ': ' + name + ' – ' + event, name + ' hat für ' + rolle + ' bei „' + event + '“ abgesagt. Die nächste Person wird automatisch angefragt.')
  }
  return abmeldeSeite_(
    '<h1>Schade, danke für die Rückmeldung!</h1><p>Vielleicht klappt es beim nächsten Mal.</p>',
    'Abgesagt – NewBuild Kollektiv',
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPONSOREN
//
//  Tabelle "Sponsor Contacts" (Ordner DRIVE_FOLDER_NAME):
//    Kontakte — eine Zeile pro Ansprechperson (Name, Firma, Anrede w/m, E-Mail …)
//    Einsätze — eine Zeile pro CMS-Event (legt das Skript an); Ann waehlt dort
//               bis zu drei Personen (Sponsor 1–3). "Versand" protokolliert.
//  Mails je Person und Event (Texte im Event-Doc "Mail-Texte Sponsoren"):
//    Info      — Vorschau an Ann beim ersten Lauf nach dem Eintragen, Versand
//                am naechsten Tag ab ERINNERUNG_SENDESTUNDE (mit .ics)
//    1 Woche   — 7 Tage vorher (Vorschau am Vortag), mit .ics. Bewusst KEINE
//                Anmelde-/Teilnehmerzahlen an Sponsoren (Ann, 24.10.2026).
//    Änderung  — sofort bei geaendertem Datum/Zeit/Ort im CMS (Kopie an Ann)
//    Danke     — SPONSOR_DANKE_NACH_TAGEN nach dem Event (Vorschau am Vortag)
//  Gemerkt in den Skript-Eigenschaften (spons_<slug>_<email>_…), keine
//  Personendaten im Code — dieses Repo ist oeffentlich.
// ═══════════════════════════════════════════════════════════════════════════
const SPONSOR_SHEET_NAME = 'Sponsor Contacts'
const SPONSOR_KONTAKTE_HEADERS = ['Name', 'Firma', 'Anrede (w/m)', 'E-Mail', 'Position', 'Telefon', 'Notizen']
const SPONSOR_SPALTEN = ['Sponsor 1', 'Sponsor 2', 'Sponsor 3']
const SPONSOR_EINSAETZE_HEADERS = ['Event', 'Datum'].concat(SPONSOR_SPALTEN).concat(['Versand', 'Slug'])
const SPONSOR_DANKE_NACH_TAGEN = 1

function sponsorSpreadsheet_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('sponsorSheetId')
  if (id) {
    try {
      return SpreadsheetApp.openById(id)
    } catch (err) {
      props.deleteProperty('sponsorSheetId')
    }
  }
  const ordner = getOrCreateFolder()
  const vorhanden = ordner.getFilesByName(SPONSOR_SHEET_NAME)
  if (vorhanden.hasNext()) {
    const ss = SpreadsheetApp.open(vorhanden.next())
    props.setProperty('sponsorSheetId', ss.getId())
    return ss
  }
  const ss = SpreadsheetApp.create(SPONSOR_SHEET_NAME)
  moveFileIntoFolder(DriveApp.getFileById(ss.getId()), ordner)
  const kontakte = ss.getSheets()[0].setName('Kontakte')
  kontakte.appendRow(SPONSOR_KONTAKTE_HEADERS)
  kontakte
    .getRange(2, SPONSOR_KONTAKTE_HEADERS.indexOf('Anrede (w/m)') + 1, 500, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['w', 'm'], true).build())
  const einsaetze = ss.insertSheet('Einsätze')
  einsaetze.appendRow(SPONSOR_EINSAETZE_HEADERS)
  const namen = SpreadsheetApp.newDataValidation().requireValueInRange(kontakte.getRange('A2:A'), true).build()
  SPONSOR_SPALTEN.forEach(function (sp) {
    einsaetze.getRange(2, SPONSOR_EINSAETZE_HEADERS.indexOf(sp) + 1, 200, 1).setDataValidation(namen)
  })
  ;[kontakte, einsaetze].forEach(function (sh) {
    sh.setFrozenRows(1)
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold')
  })
  einsaetze.hideColumns(SPONSOR_EINSAETZE_HEADERS.indexOf('Slug') + 1)
  einsaetze.getRange(2, SPONSOR_EINSAETZE_HEADERS.indexOf('Datum') + 1, 200, 1).setNumberFormat('@')
  einsaetze.setColumnWidth(1, 320)
  einsaetze.setColumnWidth(SPONSOR_EINSAETZE_HEADERS.indexOf('Versand') + 1, 360)
  try {
    DriveApp.getFileById(ss.getId()).addEditor(VORSCHAU_EMPFAENGER)
  } catch (err) {
    Logger.log('Sponsor Contacts — Freigabe fehlgeschlagen: ' + err)
  }
  props.setProperty('sponsorSheetId', ss.getId())
  Logger.log('Sponsor Contacts angelegt: ' + ss.getUrl())
  return ss
}

// Laeuft mit sendeErinnerungen.
function sponsorAbgleichen_(cmsEvents) {
  const ss = sponsorSpreadsheet_()
  const kontakte = ss.getSheetByName('Kontakte')
  const einsaetze = ss.getSheetByName('Einsätze')
  if (!kontakte || !einsaetze) throw new Error('Tabellenblatt "Kontakte" oder "Einsätze" fehlt')
  try {
    grundvorlageDoc_(mailGruppe_('sponsoren'))
  } catch (err) {
    Logger.log('Grundvorlage Sponsoren — ' + err)
  }

  const kw = kontakte.getDataRange().getValues()
  const kk = kw[0]
  const perName = {}
  for (let r = 1; r < kw.length; r++) {
    const w = function (n) {
      const i = kk.indexOf(n)
      return i >= 0 ? String(kw[r][i] == null ? '' : kw[r][i]).trim() : ''
    }
    const name = w('Name')
    if (name) perName[name.toLowerCase()] = { name: name, firma: w('Firma'), anrede: w('Anrede (w/m)'), email: w('E-Mail') }
  }

  const jetzt = new Date()
  const ew = einsaetze.getDataRange().getValues()
  const ek = ew[0]
  const col = function (name) { return ek.indexOf(name) + 1 }
  const zeileProSlug = {}
  for (let r = 1; r < ew.length; r++) {
    const s = String(ew[r][col('Slug') - 1] || '').trim()
    if (s) zeileProSlug[s] = r + 1
  }
  const vermerk = function (zeile, text) {
    const zelle = einsaetze.getRange(zeile, col('Versand'))
    const alt = String(zelle.getValue() || '')
    if (alt.split('\n').indexOf(text) >= 0) return
    zelle.setValue(alt ? alt + '\n' + text : text)
  }

  cmsEvents.forEach(function (ev) {
    const slug = String(ev.slug || '').trim()
    if (!slug) return
    let zeile = zeileProSlug[slug]
    if (!zeile) {
      const neu = SPONSOR_EINSAETZE_HEADERS.map(function () { return '' })
      neu[SPONSOR_EINSAETZE_HEADERS.indexOf('Slug')] = slug
      einsaetze.appendRow(neu)
      zeile = einsaetze.getLastRow()
      zeileProSlug[slug] = zeile
    }
    einsaetze.getRange(zeile, col('Event')).setValue(medienOrdnerName_(ev))
    einsaetze.getRange(zeile, col('Datum')).setValue(String(ev.date || ''))
    const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
    if (!start) return
    const z = einsaetze.getRange(zeile, 1, 1, ek.length).getValues()[0]
    SPONSOR_SPALTEN.forEach(function (sp) {
      const name = String(z[col(sp) - 1] || '').trim()
      if (!name) return
      const k = perName[name.toLowerCase()]
      if (!k || !k.email) {
        vermerk(zeile, name + ': E-Mail fehlt in „Kontakte“')
        return
      }
      try {
        const getan = sponsorNachlauf_(k, ev, start, jetzt)
        if (getan) vermerk(zeile, k.name + ': ' + getan + ' · ' + jetztText_())
      } catch (err) {
        Logger.log('Sponsoren — ' + k.email + ' (' + slug + '): ' + err)
        vermerk(zeile, k.name + ': FEHLER ' + err)
      }
    })
  })
  SpreadsheetApp.flush()
  medienEventsInKontakte_(kontakte, einsaetze, SPONSOR_SPALTEN)
}

function sponsorMailDaten_(k, ev, extra) {
  const vorname = String(k.name || '').trim().split(' ')[0]
  const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
  const referent = referentText_(ev.speakerName, ev.speakerRole, ev.speakerCompany)
  return {
    slug: String(ev.slug || ''),
    anrede: anrede_(k.anrede, vorname),
    vorname: vorname,
    firma: String(k.firma || ''),
    titel: String(ev.title || '').trim(),
    kurztitel: kurzTitel_(ev.title),
    datum: String(ev.date || ''),
    zeit: String(ev.time || ''),
    ort: String(ev.location || ''),
    referent: referent,
    eventtag: eventTagWort_(start),
    vorher: String(extra.vorher || ''),
    karte: {
      slug: String(ev.slug || ''), titel: String(ev.title || '').trim(), referent: referent,
      datum: String(ev.date || ''), zeit: String(ev.time || ''), ort: String(ev.location || ''),
    },
    links: {
      maps: ev.location ? mapsLink_(ev.location) : '',
      eventseite: eventSeiteUrl_(ev.slug),
    },
  }
}

// Eine Person, ein Event: faellige Mail/Vorschau verschicken. Rueckgabe =
// kurzer Vermerk fuer die Spalte "Versand" ('' = nichts getan).
function sponsorNachlauf_(k, ev, start, jetzt) {
  const g = mailGruppe_('sponsoren')
  const props = PropertiesService.getScriptProperties()
  const slug = String(ev.slug)
  const base = 'spons_' + slug + '_' + k.email.toLowerCase()
  const tage = tagesDifferenz_(jetzt, start)
  const ab = Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'H')) >= ERINNERUNG_SENDESTUNDE
  const infoMs = Number(props.getProperty(base + '_info') || 0)
  const mail = function (key, extra) { return gruppenMail_(g, key, sponsorMailDaten_(k, ev, extra || {})) }
  const ics = function () {
    return [icsDatei_(ev.title, start, parseEventEnde_(start, String(ev.time || '')), String(ev.location || ''), slug)]
  }
  const wer = k.name + (k.firma ? ' (' + k.firma + ')' : '')
  const morgen = 'morgen ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr an ' + wer
  const getan = []

  if (start.getTime() > jetzt.getTime()) {
    if (!infoMs) {
      const plan = Number(props.getProperty(base + '_infoPlan') || 0)
      const knapp = start.getTime() - jetzt.getTime() < 2 * 86400000
      if (!plan && !knapp) {
        vorschauAnAnn_(base + '_infoVorschau', mail('info'), morgen, g, slug, ics())
        props.setProperty(base + '_infoPlan', String(morgenUm_(jetzt)))
        return 'Vorschau „Info“ an dich'
      }
      if (plan && jetzt.getTime() < plan) return ''
      const m = mail('info')
      sendeTeilnehmerMail_(k.email, m.subject, m.htmlBody, ics(), !plan)
      props.setProperty(base + '_info', String(jetzt.getTime()))
      props.setProperty(base + '_stand', medienStand_(ev))
      return 'Info verschickt'
    }
    const alt = props.getProperty(base + '_stand')
    const neu = medienStand_(ev)
    if (alt && alt !== neu) {
      const a = JSON.parse(alt)
      const m = mail('aenderung', { vorher: a[0] + (a[1] ? ' · ' + a[1] + ' Uhr' : '') + (a[2] ? ' · ' + a[2] : '') })
      sendeTeilnehmerMail_(k.email, m.subject, m.htmlBody, ics(), true)
      props.setProperty(base + '_stand', neu)
      getan.push('Änderung verschickt')
    }
    if (!alt) props.setProperty(base + '_stand', neu)
    if (!ab) return getan.join(', ')
    // "1 Woche vorher" nur, wenn die Info nicht gerade erst rausging.
    if (tage === 8 && jetzt.getTime() - infoMs >= 86400000) {
      if (vorschauAnAnn_(base + '_wocheVorschau', mail('woche'), morgen, g, slug, ics())) getan.push('Vorschau „1 Woche“ an dich')
    }
    if (tage === 7 && !props.getProperty(base + '_woche') && jetzt.getTime() - infoMs >= 2 * 86400000) {
      const m = mail('woche')
      sendeTeilnehmerMail_(k.email, m.subject, m.htmlBody, ics())
      props.setProperty(base + '_woche', jetztText_())
      getan.push('1 Woche verschickt')
    }
    if (tage === 1 - SPONSOR_DANKE_NACH_TAGEN) {
      const wann = (SPONSOR_DANKE_NACH_TAGEN === 1 ? 'morgen' : 'in ' + SPONSOR_DANKE_NACH_TAGEN + ' Tagen') +
        ' ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr an ' + wer
      if (vorschauAnAnn_(base + '_dankeVorschau', mail('danke'), wann, g, slug)) getan.push('Vorschau „Danke“ an dich')
    }
    return getan.join(', ')
  }
  // Nach dem Event: Danke (nur wer vorher die Info bekommen hat).
  if (!infoMs || props.getProperty(base + '_danke') || !ab) return ''
  if (tage > -SPONSOR_DANKE_NACH_TAGEN || tage < -SPONSOR_DANKE_NACH_TAGEN - 2) return ''
  const m = mail('danke')
  sendeTeilnehmerMail_(k.email, m.subject, m.htmlBody)
  props.setProperty(base + '_danke', jetztText_())
  return 'Danke verschickt'
}

function sponsorMailKey_(t) {
  t = String(t || '').toLowerCase()
  if (t.indexOf('änderung') >= 0 || t.indexOf('aenderung') >= 0) return 'aenderung'
  if (t.indexOf('woche') >= 0) return 'woche'
  if (t.indexOf('nach dem event') >= 0 || t.indexOf('danke') >= 0) return 'danke'
  if (t.indexOf('info') >= 0) return 'info'
  return ''
}

function sponsorMailVorlage_() {
  return [
    ['h', 'Info zum Event'],
    ['p', 'Betreff: NewBuild Kollektiv × {Firma}: {Kurztitel} am {Datum}'],
    ['p', '{Anrede},'],
    ['p', 'schön, dass {Firma} bei unserem nächsten NewBuild Kollektiv Treffen **„{Titel}“** dabei ist! Hier die Eckdaten für dich:'],
    ['p', '[EVENTKARTE]'],
    ['p', 'Im Anhang findest du eine Kalenderdatei (.ics) – einfach öffnen, dann steht der Termin in deinem Kalender.'],
    ['p', 'Eine Woche vorher melde ich mich noch einmal kurz. Wenn du vorab Fragen hast, schreib mir jederzeit.'],
    ['p', 'Liebe Grüße,'],
    ['h', '1 Woche vorher'],
    ['p', 'Betreff: In einer Woche: {Kurztitel} – NewBuild Kollektiv × {Firma}'],
    ['p', '{Anrede},'],
    ['p', 'in einer Woche ist es soweit: „{Titel}“ am {Datum}, {Zeit} Uhr.'],
    ['p', '[EVENTKARTE]'],
    ['p', 'Falls ihr für den Abend noch etwas plant oder braucht, gib mir gern kurz Bescheid. Die Kalenderdatei hängt noch einmal an.'],
    ['p', 'Ich freue mich auf den Abend mit euch!'],
    ['p', 'Liebe Grüße,'],
    ['h', 'Änderung (Datum, Zeit oder Ort)'],
    ['p', 'Betreff: Änderung: {Kurztitel} am {Datum}'],
    ['p', '{Anrede},'],
    ['p', 'bei unserem Treffen „{Titel}“ hat sich etwas geändert. Hier der aktuelle Stand:'],
    ['p', '**{Datum} · {Zeit} Uhr**\n{Ort}'],
    ['p', 'Bisher: {Vorher}'],
    ['p', 'Im Anhang findest du die aktualisierte Kalenderdatei (.ics) – einfach öffnen, dann wird der Termin angepasst. Wenn das für euch etwas ändert, melde dich gern kurz.'],
    ['p', 'Liebe Grüße,'],
    ['h', 'Nach dem Event'],
    ['p', 'Betreff: Danke für {Kurztitel} – NewBuild Kollektiv × {Firma}'],
    ['p', '{Anrede},'],
    ['p', 'ich möchte mich noch einmal herzlich bei dir und {Firma} bedanken. Ohne euch hätte unser NewBuild Kollektiv Treffen {Eventtag} so nicht stattfinden können. Danke, dass du das möglich gemacht hast und die Zusammenarbeit so unkompliziert war.'],
    ['p', 'Ich würde mich freuen, wenn wir uns bald einmal dazu austauschen, wie wir die Zusammenarbeit weiterführen können. Hast du in den nächsten Wochen Zeit für ein kurzes Telefonat oder einen Kaffee?'],
    ['p', 'Liebe Grüße,'],
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRIVATER KALENDER "NewBuild Kollektiv – Foto & Video" (Konto request@,
//  freigegeben NUR fuer VORSCHAU_EMPFAENGER). Ein Termin pro CMS-Event mit der
//  aktuellen Besetzung (Foto/Video) in der Beschreibung — keine Gaeste.
//  Fotograf:innen/Videograf:innen sehen den Kalender nicht; sie bekommen nach
//  der Zusage eine eigene .ics mit ihrer Ankunftszeit (medienIcs_). Teilnehmende
//  bekommen wie bisher nur die .ics in ihren Mails.
//  Freigabe an Ann braucht den erweiterten Dienst "Google Calendar API".
// ═══════════════════════════════════════════════════════════════════════════
const KALENDER_NAME = 'NewBuild Kollektiv – Foto & Video'

function nbkKalender_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('kalenderId')
  let kal = id ? CalendarApp.getCalendarById(id) : null
  if (!kal) {
    const vorhanden = CalendarApp.getOwnedCalendarsByName(KALENDER_NAME)
    kal = vorhanden.length ? vorhanden[0] : CalendarApp.createCalendar(KALENDER_NAME, { timeZone: 'Europe/Berlin' })
    props.setProperty('kalenderId', kal.getId())
    Logger.log('Kalender angelegt/gefunden: ' + KALENDER_NAME)
  }
  if (!props.getProperty('kalenderFreigabe')) {
    try {
      Calendar.Acl.insert(
        { role: 'writer', scope: { type: 'user', value: VORSCHAU_EMPFAENGER } },
        kal.getId(),
        { sendNotifications: true },
      )
      props.setProperty('kalenderFreigabe', jetztText_())
      Logger.log('Kalender freigegeben fuer ' + VORSCHAU_EMPFAENGER)
    } catch (err) {
      Logger.log('Kalender-Freigabe fehlgeschlagen (Dienst "Google Calendar API" hinzugefuegt?): ' + err)
    }
  }
  return kal
}

function kalenderTermin_(ev, start, ende, besetzung) {
  const kal = nbkKalender_()
  const props = PropertiesService.getScriptProperties()
  const key = 'kalEvent_' + String(ev.slug)
  const titel = 'NBK · ' + medienOrdnerName_(ev)
  const ort = String(ev.location || '')
  const beschreibung = (besetzung ? besetzung + '\n\n' : '') + String(ev.title || '').trim() + '\n' + eventSeiteUrl_(ev.slug)
  const id = props.getProperty(key)
  let t = id ? kal.getEventById(id) : null
  if (!t) {
    t = kal.createEvent(titel, start, ende, { location: ort, description: beschreibung })
    props.setProperty(key, t.getId())
    return t
  }
  if (t.getStartTime().getTime() !== start.getTime() || t.getEndTime().getTime() !== ende.getTime()) t.setTime(start, ende)
  if (t.getTitle() !== titel) t.setTitle(titel)
  if (t.getLocation() !== ort) t.setLocation(ort)
  if (t.getDescription() !== beschreibung) t.setDescription(beschreibung)
  return t
}

// ── Texte der Medien-Mails (Doc, sonst Standard) ─────────────────────────────
function medienMailDaten_(kontakt, rolle, ev, extra) {
  const d = {
    slug: String(ev.slug || ''),
    vorname: String(kontakt.name || '').trim().split(' ')[0],
    titel: String(ev.title || '').trim(),
    kurztitel: kurzTitel_(ev.title),
    datum: String(ev.date || ''),
    zeit: String(ev.time || ''),
    ort: String(ev.location || ''),
    aufgabe: rolle === 'Foto' ? 'die Fotos' : 'das Video',
    medien: rolle === 'Foto' ? 'Fotos' : 'Videos',
    honorar: String(kontakt.honorar || ''),
    ankunft: medienAnkunft_(ev),
    vorlauf: String(MEDIEN_VORLAUF_MIN),
    aufbruch: String(AUFBRUCH_VORLAUF_MIN),
    begleitung: rolle === 'Foto' ? 'fotografisch' : 'videografisch',
    eventtag: eventTagWort_(parseEventDatum_(String(ev.date || ''), String(ev.time || ''))),
    vorher: String(extra.vorher || ''),
    links: {
      zusage: extra.token ? medienZusageLink_(extra.token, true) : '',
      absage: extra.token ? medienZusageLink_(extra.token, false) : '',
      upload: extra.upload || '',
      maps: ev.location ? mapsLink_(ev.location) : '',
    },
  }
  return d
}

// Ankunftszeit "18:00" = Eventbeginn minus MEDIEN_VORLAUF_MIN, '' ohne Uhrzeit.
function medienAnkunft_(ev) {
  const t = String(ev.time || '').match(/(\d{1,2}):(\d{2})/)
  if (!t) return ''
  const min = Number(t[1]) * 60 + Number(t[2]) - MEDIEN_VORLAUF_MIN
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60)
  const m = ((min % 60) + 60) % 60
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2)
}

// Ueberschriften der Abschnitte. Alte Abschnitte "Erinnerung" (keine Antwort)
// und "Upload-Link" (nach Zusage) aus frueheren Docs werden ignoriert.
function medienMailKey_(t) {
  t = String(t || '').toLowerCase()
  if (t.indexOf('anfrage') >= 0) return 'anfrage'
  if (t.indexOf('vorher') >= 0) return 'tag'
  if (t.indexOf('änderung') >= 0 || t.indexOf('aenderung') >= 0) return 'aenderung'
  if (t.indexOf('nach dem event') >= 0 || t.indexOf('danke') >= 0) return 'danke'
  return ''
}

function medienMailVorlage_() {
  return [
    ['h', 'Anfrage'],
    ['p', 'Betreff: Anfrage NewBuild Kollektiv – {Kurztitel} am {Datum}'],
    ['p', 'Hallo {Vorname},'],
    ['p', 'wir planen unser nächstes NewBuild Kollektiv Treffen **„{Titel}“** und würden uns freuen, wenn du {Aufgabe} übernimmst.'],
    ['p', '**{Datum} · {Zeit} Uhr**\n{Ort}'],
    ['p', 'Bitte sei um **{Ankunft} Uhr** da, also {Vorlauf} Minuten vor Beginn, damit du in Ruhe ankommen und dich einrichten kannst.'],
    ['p', 'Honorar: {Honorar}'],
    ['p', 'Im Anhang findest du eine Kalenderdatei (.ics) mit deiner Ankunftszeit – sie erinnert dich {Aufbruch} Minuten vorher ans Aufbrechen.'],
    ['p', 'Hast du Zeit? Ein Klick genügt: {Zusage-Link: Ja, ich bin dabei} · {Absage-Link: Leider nein}'],
    ['p', 'Danke dir und liebe Grüße,'],
    ['h', '1 Tag vorher'],
    ['p', 'Betreff: Morgen: {Kurztitel} – bitte um {Ankunft} Uhr da sein'],
    ['p', 'Hallo {Vorname},'],
    ['p', 'morgen ist es soweit: „{Titel}“ am {Datum}, {Zeit} Uhr.'],
    ['p', '**{Ort}**\n{Maps-Link: In Google Maps öffnen}'],
    ['p', 'Bitte sei um **{Ankunft} Uhr** da, damit du in Ruhe ankommen und dich einrichten kannst. Die Kalenderdatei hängt noch einmal an.'],
    ['p', 'Bis morgen und liebe Grüße,'],
    ['h', 'Änderung (Datum, Zeit oder Ort)'],
    ['p', 'Betreff: Änderung: {Kurztitel} am {Datum}'],
    ['p', 'Hallo {Vorname},'],
    ['p', 'bei „{Titel}“ hat sich etwas geändert. Hier der aktuelle Stand:'],
    ['p', '**{Datum} · {Zeit} Uhr**\n{Ort}'],
    ['p', 'Bisher: {Vorher}'],
    ['p', 'Bitte sei um **{Ankunft} Uhr** da. Im Anhang findest du die aktualisierte Kalenderdatei (.ics) – einfach öffnen, dann wird dein Termin angepasst.'],
    ['p', 'Passt es dir so nicht mehr? Dann gib mir bitte kurz Bescheid: {Absage-Link: Ich kann leider nicht mehr}'],
    ['p', 'Liebe Grüße,'],
    ['h', 'Nach dem Event'],
    ['p', 'Betreff: Danke für {Kurztitel} – bitte {Medien} hochladen'],
    ['p', 'Hallo {Vorname},'],
    ['p', 'vielen Dank, dass du {Eventtag} bei „{Titel}“ dabei warst und das Event {Begleitung} aufgenommen hast!'],
    ['p', 'Bitte lade alle Dateien hier hoch: {Upload-Link: Zum Upload-Ordner →}'],
    ['p', 'Danke dir und liebe Grüße,'],
  ]
}

function medienMailStandard_(key) {
  return gruppenStandard_(mailGruppe_('medien'), key)
}

// Version der Grundvorlage Foto & Video. Erhoehen, wenn sich die Vorlage
// aendert: eine nie bearbeitete Grundvorlage wird dann neu geschrieben, eine
// von Ann bearbeitete bleibt unangetastet.
const MEDIEN_MAILDOC_VERSION = '6'

function medienMail_(key, d) {
  return gruppenMail_(mailGruppe_('medien'), key, d)
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIL-GRUPPEN: Gäste · Sponsoren · Foto & Video
//
//  Je Gruppe eine Grundvorlage (Doc in Mail-Texte/_Grundvorlagen) und pro Event
//  ein eigenes Doc im Event-Ordner (Mail-Texte/<Nummer — Titel>/). Das Event-Doc
//  entsteht beim ersten Lauf nach dem Anlegen im CMS als Kopie der
//  Grundvorlage; Ann kann es danach nur fuer dieses Event anpassen.
//  Versand liest: Event-Doc -> Grundvorlage -> Standardtext im Code.
//  Gaeste lesen weiter ueber ausDoc_ (Event-Doc -> Code-Standard).
// ═══════════════════════════════════════════════════════════════════════════
function mailGruppe_(id) {
  const g = {
    gaeste: {
      id: 'gaeste', titel: 'Gäste', docName: 'Mail-Texte Gäste', eventProp: 'mailDoc_',
      grundProp: 'gaesteGrundDoc', version: '1', empfaenger: 'die angemeldeten Gäste',
      keyFn: abschnittKey_, vorlage: function () { return mailDocVorlage_('') },
      hinweise: gaesteHinweise_,
      links: function (ev) {
        return [['→ Eventkarte (Bild) – wird automatisch aus Titel, Datum und Ort im CMS erzeugt',
          'https://newbuild-kollektiv.com/mail/' + encodeURIComponent(String(ev.slug)) + '-karte.png']]
      },
    },
    sponsoren: {
      id: 'sponsoren', titel: 'Sponsoren', docName: 'Mail-Texte Sponsoren', eventProp: 'mailDocSponsoren_',
      grundProp: 'sponsorGrundDoc', version: '2', empfaenger: 'die Sponsoren (Ansprechpersonen aus „Sponsor Contacts“)',
      keyFn: sponsorMailKey_, vorlage: sponsorMailVorlage_, hinweise: sponsorHinweise_,
      links: function () { return [['→ Sponsor Contacts (wer bei welchem Event Sponsor ist)', sponsorSpreadsheet_().getUrl()]] },
    },
    medien: {
      id: 'medien', titel: 'Foto & Video', docName: 'Mail-Texte Foto & Video', eventProp: 'mailDocMedien_',
      grundProp: 'medienMailDoc', version: MEDIEN_MAILDOC_VERSION,
      empfaenger: 'Fotograf:innen und Videograf:innen (aus „Media Contacts“)',
      keyFn: medienMailKey_, vorlage: medienMailVorlage_, hinweise: medienHinweise_,
      links: function () { return [['→ Media Contacts (Kontakte, Einsätze, Anfragen)', medienSpreadsheet_().getUrl()]] },
    },
  }
  return id ? g[id] : [g.gaeste, g.sponsoren, g.medien]
}

function gemeinsameHinweise_() {
  return [
    'Die Überschriften nicht umbenennen. Ist ein Abschnitt leer, gilt der Text aus der Grundvorlage.',
    'Die erste Zeile „Betreff: …“ ist der Betreff der Mail.',
    'Fett, kursiv und normale Links werden übernommen. Kleine Schrift (9 pt) = kleine graue Schrift in der Mail.',
    'Ist ein Platzhalter leer (z. B. kein Honorar eingetragen), entfällt der ganze Absatz.',
    'Signatur hängt automatisch an. Datum, Zeit und Ort kommen immer aktuell aus dem CMS.',
  ]
}

function gaesteHinweise_() {
  return [
    'Die Überschriften (Bestätigung, 1 Woche vorher …) nicht umbenennen. Ist ein Abschnitt leer, geht der Standardtext raus.',
    'Die erste Zeile „Betreff: …“ ist der Betreff der Mail.',
    '[EVENTKARTE] in einer eigenen Zeile = Eventbild mit Datum, Ort und Google-Maps-Link.',
    'Kleine Schrift (9 pt) = kleine graue Schrift in der Mail, z. B. für das P.S.',
    'Fett, kursiv und normale Links aus dem Doc werden übernommen.',
    'Platzhalter: {Anrede} (z. B. „Liebe Maria“) · {Titel} · {Kurztitel} · {Datum} · {Zeit} · {Ort} · {Referent} · {Eventtag} („gestern“ / „am Dienstag“) · {Minuten}',
    'Links mit eigenem Text: {Abmelde-Link: Text} · {Feedback-Link: Text} · {Referent-Link: Text} · {Maps-Link: Text} · {Eventseite-Link: Text} · {Ich-war-da-Link: Text} (der Absatz wird zum grauen Kasten).',
    'Kalenderdatei (.ics) und Signatur hängen automatisch an. Datum, Zeit und Ort kommen immer aktuell aus dem CMS.',
    'Versand: Bestätigung sofort · 1 Woche und 1 Tag vorher ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr · ca. 3 Std. vorher · Rückblick am Tag danach ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr. Am Vortag kommt jede Mail als [VORSCHAU] an dich.',
  ]
}

function medienHinweise_() {
  return [
    'Es gibt nur diese Mails: Anfrage (mit Kalenderdatei) · 1 Tag vorher · Nach dem Event (Upload-Link) · Änderung, falls du Datum, Zeit oder Ort im CMS änderst.',
    'Anfrage: sobald das Event im CMS steht, bekommst du sofort eine Vorschau. Am nächsten Tag ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr geht sie an Kontakt A der Rolle, mit .ics (Termin = Ankunftszeit, Wecker ' + AUFBRUCH_VORLAUF_MIN + ' Min. vorher). Nach ' + MEDIEN_FRIST_TAGE + ' Tagen ohne Antwort oder bei Absage geht sie an B, danach an C (Kopie an dich).',
    'Nach der Zusage kommt keine eigene Mail – der Upload-Ordner wird still freigegeben. Trägst du jemanden von Hand in „Einsätze“ ein, bekommt die Person die Anfrage ohne Knöpfe, damit sie auch die .ics hat.',
    '1 Tag vorher: ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr Erinnerung mit Ankunftszeit und .ics. Vorschau am Vortag.',
    'Nach dem Event: am Tag danach ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr mit Link zum Upload-Ordner. Vorschau am Eventtag.',
    'Änderung: sofort, mit neuer Kalenderdatei (ersetzt den alten Termin, Kopie an dich).',
    'Platzhalter: {Vorname} · {Titel} · {Kurztitel} · {Datum} · {Zeit} · {Ort} · {Aufgabe} („die Fotos“ / „das Video“) · {Medien} („Fotos“ / „Videos“) · {Ankunft} (Beginn minus ' + MEDIEN_VORLAUF_MIN + ' Min.) · {Vorlauf} · {Aufbruch} (' + AUFBRUCH_VORLAUF_MIN + ') · {Begleitung} („fotografisch“ / „videografisch“) · {Eventtag} („gestern“) · {Vorher} (alter Termin, nur in „Änderung“) · {Honorar}',
    'Links: {Zusage-Link: Text} · {Absage-Link: Text} · {Upload-Link: Text} · {Maps-Link: Text}',
  ].concat(gemeinsameHinweise_())
}

function sponsorHinweise_() {
  return [
    'Empfänger: die Personen, die du in „Sponsor Contacts“ → Einsätze bei diesem Event als Sponsor 1–3 auswählst.',
    'Info zum Event: sobald du jemanden einträgst, bekommst du sofort eine Vorschau. Am nächsten Tag ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr geht sie raus, mit Kalenderdatei. Ist das Event weniger als 2 Tage entfernt, geht sie sofort raus (Kopie an dich).',
    '1 Woche vorher: ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr, kurze Erinnerung mit Kalenderdatei. Vorschau am Vortag.',
    'Änderung: sofort, sobald du Datum, Zeit oder Ort im CMS änderst, mit neuer Kalenderdatei (Kopie an dich).',
    'Nach dem Event: am Tag danach ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr. Vorschau am Eventtag – ein persönlicher Satz zum Abend macht die Mail stärker.',
    'Platzhalter: {Anrede} („Liebe Yvonne“) · {Vorname} · {Firma} · {Titel} · {Kurztitel} · {Datum} · {Zeit} · {Ort} · {Referent} · {Eventtag} · {Vorher} (alter Termin, nur in „Änderung“)',
    'Links: {Maps-Link: Text} · {Eventseite-Link: Text}. [EVENTKARTE] in einer eigenen Zeile = Eventbild.',
  ].concat(gemeinsameHinweise_())
}

function eventName_(ev) {
  return (ev.number ? String(ev.number).trim() + ' — ' : '') + String(ev.title || ev.slug || '').trim()
}

function grundvorlagenOrdner_() {
  const parent = mailTexteOrdner_()
  const it = parent.getFoldersByName('_Grundvorlagen')
  return it.hasNext() ? it.next() : parent.createFolder('_Grundvorlagen')
}

// Ordner "Mail-Texte/<Nummer — Titel>" fuer die drei Docs eines Events.
function eventMailOrdner_(ev) {
  const props = PropertiesService.getScriptProperties()
  const key = 'mailOrdner_' + String(ev.slug)
  const name = eventName_(ev)
  let f = null
  const id = props.getProperty(key)
  if (id) {
    try {
      f = DriveApp.getFolderById(id)
      if (f.isTrashed()) f = null
    } catch (err) {
      f = null
    }
  }
  if (!f) {
    const parent = mailTexteOrdner_()
    const it = parent.getFoldersByName(name)
    f = it.hasNext() ? it.next() : parent.createFolder(name)
    props.setProperty(key, f.getId())
  }
  if (f.getName() !== name) f.setName(name)
  return f
}

function grundvorlageDoc_(g) {
  const props = PropertiesService.getScriptProperties()
  const name = 'Grundvorlage · ' + g.docName
  const id = props.getProperty(g.grundProp)
  if (id) {
    try {
      const file = DriveApp.getFileById(id)
      if (file.isTrashed()) throw new Error('im Papierkorb')
      if (file.getName() !== name) file.setName(name)
      if (!props.getProperty(g.grundProp + 'Ort')) {
        file.moveTo(grundvorlagenOrdner_())
        props.setProperty(g.grundProp + 'Ort', '1')
      }
      if (props.getProperty(g.grundProp + 'Version') !== g.version) {
        // Unbearbeitet = seit dem letzten Schreiben durchs Skript nicht geaendert.
        const stand = Number(props.getProperty(g.grundProp + 'Stand') || file.getDateCreated().getTime())
        if (file.getLastUpdated().getTime() - stand < 5 * 60000) {
          const doc = DocumentApp.openById(id)
          doc.getBody().clear()
          grundvorlageFuellen_(g, doc)
          Logger.log('Grundvorlage ' + g.titel + ' auf neue Vorlage aktualisiert.')
        } else {
          Logger.log('Grundvorlage ' + g.titel + ' wurde bearbeitet — neue Vorlage NICHT uebernommen.')
        }
        props.setProperty(g.grundProp + 'Version', g.version)
      }
      return DocumentApp.openById(id)
    } catch (err) {
      Logger.log('Grundvorlage ' + g.titel + ' nicht lesbar, lege neu an: ' + err)
      props.deleteProperty(g.grundProp)
    }
  }
  const doc = DocumentApp.create(name)
  const file = DriveApp.getFileById(doc.getId())
  file.moveTo(grundvorlagenOrdner_())
  grundvorlageFuellen_(g, doc)
  try {
    file.addEditor(VORSCHAU_EMPFAENGER)
  } catch (err) {
    Logger.log('Grundvorlage — Freigabe fehlgeschlagen: ' + err)
  }
  props.setProperty(g.grundProp, doc.getId())
  props.setProperty(g.grundProp + 'Version', g.version)
  props.setProperty(g.grundProp + 'Ort', '1')
  return DocumentApp.openById(doc.getId())
}

function grundvorlageFuellen_(g, doc) {
  const name = 'Grundvorlage · ' + g.docName
  const body = doc.getBody()
  const kopf = body.getChild(0).asParagraph()
  kopf.setText(name)
  kopf.setHeading(DocumentApp.ParagraphHeading.TITLE)
  ;[
    ['p', 'Das ist die Grundvorlage für die Mails an ' + g.empfaenger + '. Für jedes neue Event im CMS entsteht daraus automatisch ein eigenes Doc im Event-Ordner unter „Mail-Texte“. Änderungen hier gelten für alle künftigen Events – bereits angelegte Event-Docs bleiben, wie sie sind.'],
    ['h2', 'So funktioniert’s'],
  ].concat(g.hinweise().map(function (t) { return ['li', t] }))
    .concat(g.vorlage())
    .forEach(function (z) { docAbsatz_(body, z[0], z[1]) })
  doc.saveAndClose()
  PropertiesService.getScriptProperties().setProperty(g.grundProp + 'Stand', String(Date.now()))
}

// Haengt die Mail-Abschnitte (ab der ersten Ueberschrift 1) der Grundvorlage
// an; faellt auf die Vorlage im Code zurueck.
function abschnitteAusGrundvorlage_(g, body) {
  const T = DocumentApp.ElementType
  try {
    const q = grundvorlageDoc_(g).getBody()
    let drin = false
    let n = 0
    for (let i = 0; i < q.getNumChildren(); i++) {
      const el = q.getChild(i)
      const typ = el.getType()
      if (!drin && typ === T.PARAGRAPH && el.asParagraph().getHeading() === DocumentApp.ParagraphHeading.HEADING1) drin = true
      if (!drin) continue
      if (typ === T.PARAGRAPH) body.appendParagraph(el.copy().asParagraph())
      else if (typ === T.LIST_ITEM) body.appendListItem(el.copy().asListItem())
      else if (typ === T.TABLE) body.appendTable(el.copy().asTable())
      n++
    }
    if (n) return
  } catch (err) {
    Logger.log('Grundvorlage ' + g.titel + ' nicht kopierbar, Standardtext: ' + err)
  }
  g.vorlage().forEach(function (z) { docAbsatz_(body, z[0], z[1]) })
}

// Legt das Doc einer Gruppe fuer ein Event an. null, wenn es schon existiert.
function eventGruppenDocAnlegen_(g, ev) {
  const slug = String(ev.slug)
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty(g.eventProp + slug)) return null
  const name = g.docName + ' · ' + eventName_(ev)
  const ordner = eventMailOrdner_(ev)
  // Ein schon vorhandenes (z. B. halb angelegtes) Doc gleichen Namens wird
  // wiederverwendet statt ein zweites anzulegen.
  const vorhanden = ordner.getFilesByName(name)
  let doc, file
  if (vorhanden.hasNext()) {
    file = vorhanden.next()
    doc = DocumentApp.openById(file.getId())
    doc.getBody().clear()
  } else {
    doc = DocumentApp.create(name)
    file = DriveApp.getFileById(doc.getId())
    file.moveTo(ordner)
  }
  const body = doc.getBody()
  const kopf = body.getChild(0).asParagraph()
  kopf.setText(name) // setText liefert nichts zurueck, nicht verketten
  kopf.setHeading(DocumentApp.ParagraphHeading.TITLE)
  ;[
    ['p', 'Hier stehen alle automatischen E-Mails an ' + g.empfaenger + ' zu diesem Event. Der Text stammt aus der Grundvorlage und gilt nur für dieses Event – einfach ändern, das Doc speichert von selbst und die nächste Mail übernimmt ihn. Kein Code, kein Bereitstellen.'],
    ['p', '→ Vorschau aller Mails dieses Events (Gäste, Sponsoren, Foto & Video)', mailVorschauLink_(slug)],
    ['p', '→ Alle Mails als Testmail an mich schicken', mailTestLink_(slug)],
  ]
    .concat(g.links(ev).map(function (l) { return ['p', l[0], l[1]] }))
    .concat([['h2', 'So funktioniert’s']])
    .concat(g.hinweise().map(function (t) { return ['li', t] }))
    .forEach(function (z) { docAbsatz_(body, z[0], z[1], z[2]) })
  abschnitteAusGrundvorlage_(g, body)
  doc.saveAndClose()
  try {
    file.addEditor(VORSCHAU_EMPFAENGER)
  } catch (err) {
    Logger.log('Mail-Texte-Doc — Freigabe fehlgeschlagen: ' + err)
  }
  props.setProperty(g.eventProp + slug, doc.getId())
  delete GRUPPEN_CACHE[g.id + '|' + slug]
  if (g.id === 'gaeste') delete MAILDOC_CACHE[slug]
  Logger.log('Mail-Texte ' + g.titel + ' angelegt fuer ' + slug + ': ' + doc.getUrl())
  return { titel: g.titel, url: doc.getUrl() }
}

// Link zum Doc, das fuer dieses Event gilt (Event-Doc, sonst Grundvorlage).
function gruppenDocUrl_(g, slug) {
  const props = PropertiesService.getScriptProperties()
  const id = (slug && props.getProperty(g.eventProp + slug)) || props.getProperty(g.grundProp)
  return id ? 'https://docs.google.com/document/d/' + id + '/edit' : ''
}

// Pro Skriptlauf nur einmal lesen.
let GRUPPEN_CACHE = {}

function gruppenAbschnitte_(g, slug) {
  const k = g.id + '|' + slug
  if (Object.prototype.hasOwnProperty.call(GRUPPEN_CACHE, k)) return GRUPPEN_CACHE[k]
  let res = null
  try {
    if (slug === '*') res = parseMailDoc_(grundvorlageDoc_(g).getBody(), g.keyFn)
    else {
      const id = slug ? PropertiesService.getScriptProperties().getProperty(g.eventProp + slug) : null
      if (id) res = parseMailDoc_(DocumentApp.openById(id).getBody(), g.keyFn)
    }
  } catch (err) {
    Logger.log('Mail-Texte ' + g.titel + ' (' + slug + ') nicht lesbar: ' + err)
  }
  GRUPPEN_CACHE[k] = res
  return res
}

function gruppenAbschnitt_(g, slug, key) {
  const a = (gruppenAbschnitte_(g, slug) || {})[key]
  if (a && a.absaetze.length) return a
  const b = (gruppenAbschnitte_(g, '*') || {})[key]
  if (b && b.absaetze.length) return b
  return gruppenStandard_(g, key)
}

// Standardtext eines Abschnitts aus der Vorlage im Code.
function gruppenStandard_(g, key) {
  const out = { betreff: '', absaetze: [] }
  let drin = false
  g.vorlage().forEach(function (z) {
    if (z[0] === 'h') { drin = g.keyFn(z[1]) === key; return }
    if (!drin) return
    if (/^Betreff:/.test(z[1])) { out.betreff = z[1].replace(/^Betreff:\s*/, ''); return }
    out.absaetze.push({
      html: escapeHtml_(z[1])
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" style="color:#3d5a80">$1</a>')
        .replace(/\n/g, '<br>'),
      karte: /^\[\s*eventkarte\s*\]$/i.test(z[1].trim()),
      klein: z[0] === 'k',
    })
  })
  return out
}

// Baut eine Mail einer Gruppe. d: Platzhalterwerte (kleingeschrieben),
// d.links (Name -> URL), d.slug, optional d.karte (fuer [EVENTKARTE]).
// Absaetze mit leerem Platzhalter oder fehlendem Link entfallen.
function gruppenMail_(g, key, d) {
  const a = gruppenAbschnitt_(g, d.slug, key)
  const istWert = function (k) {
    return Object.prototype.hasOwnProperty.call(d, k) && (typeof d[k] === 'string' || typeof d[k] === 'number')
  }
  const werte = function (text, html) {
    return String(text).replace(/\{\s*([A-Za-zÄÖÜäöü]+)\s*\}/g, function (m, n) {
      const k = n.toLowerCase()
      if (!istWert(k)) return m
      return html ? escapeHtml_(d[k]) : String(d[k])
    })
  }
  const absaetze = a.absaetze
    .filter(function (x) {
      const h = x.html
      let m
      const re = /\{\s*([A-Za-zÄÖÜäöü]+)\s*\}/g
      while ((m = re.exec(h))) if (istWert(m[1].toLowerCase()) && !String(d[m[1].toLowerCase()])) return false
      const reL = /\{\s*([A-Za-zÄÖÜäöü]+?)-Link\s*:/g
      while ((m = reL.exec(h))) if (!(d.links || {})[m[1].toLowerCase()]) return false
      return true
    })
    .map(function (x) {
      if (x.karte) return d.karte ? eckdatenBlock_(d.karte) : ''
      const mitLinks = x.html.replace(/\{\s*([A-Za-zÄÖÜäöü]+?)-Link\s*:\s*((?:[^{}]|\{[^{}]*\})*)\}/g, function (m, n, text) {
        const url = (d.links || {})[n.toLowerCase()]
        const t = werte(text.trim(), true)
        return url ? '<a href="' + url + '" style="color:#3d5a80;font-weight:600">' + t + '</a>' : t
      })
      const inhalt = werte(mitLinks, true)
      if (x.klein) return '<p style="color:#666;font-size:13px;margin:20px 0 18px">' + inhalt + '</p>'
      return '<p>' + (x.liste ? '• ' : '') + inhalt + '</p>'
    })
  return {
    subject: werte(a.betreff || gruppenStandard_(g, key).betreff, false),
    htmlBody: wrapMail_(absaetze.join('')),
  }
}

// Vorschau einer geplanten Mail an Ann (einmal je key). true = verschickt.
function vorschauAnAnn_(key, m, wann, g, slug, attachments) {
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty(key)) return false
  const doc = gruppenDocUrl_(g, slug)
  const hinweis =
    '<p style="margin:0 0 18px;padding:10px 14px;background:#fff4d6;border-radius:8px;font-size:13px;color:#555;font-family:Arial,Helvetica,sans-serif">' +
    '<strong>Vorschau</strong> – geht ' + escapeHtml_(wann) + ' raus.' +
    (doc ? ' <a href="' + doc + '" style="color:#3d5a80">Text für dieses Event anpassen</a>' : '') + '</p>'
  sendeTeilnehmerMail_(VORSCHAU_EMPFAENGER, '[VORSCHAU – ' + wann + '] ' + m.subject, hinweis + m.htmlBody, attachments)
  props.setProperty(key, jetztText_())
  Logger.log('Vorschau ' + g.titel + ' an ' + VORSCHAU_EMPFAENGER + ': ' + m.subject)
  return true
}

// Zeitpunkt morgen um ERINNERUNG_SENDESTUNDE (Skript-Zeitzone Europe/Berlin).
function morgenUm_(jetzt) {
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1, ERINNERUNG_SENDESTUNDE, 0, 0).getTime()
}

// ── Mailtexte der einzelnen Stufen ────────────────────────────────────────
// Jede Funktion bekommt { anrede, titel, referent, datum, zeit, ort, start,
// ende } und gibt { subject, htmlBody, attachments? } zurueck. Texte hier frei
// anpassbar; die Signatur wird automatisch angehaengt.

// 1 Woche vorher — Terminzeile, Eventkarte und Kalenderdatei (seit 13.10.2026;
// viele Anmeldungen vor dem 08.10. hatten noch keine .ics bekommen).
function mailEineWoche_(e) {
  return ausDoc_('woche', e, mailEineWocheStandard_)
}

function mailEineWocheStandard_(e) {
  return {
    subject: 'In einer Woche: NBK Treffen – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>in einer Woche ist es soweit: Unser NewBuild Kollektiv Treffen ' +
        '<strong>„' +
        escapeHtml_(e.titel) +
        '“</strong> findet' +
        (e.datum ? ' am ' + escapeHtml_(e.datum) : '') +
        (e.zeit ? ' um ' + escapeHtml_(e.zeit) + ' Uhr' : '') +
        ' statt.</p>' +
        eckdatenBlock_(e) +
        '<p>Im Anhang findest du eine Kalenderdatei (.ics). Diese kannst du dir einfach ' +
        'herunterladen, dann steht der Termin in deinem Kalender. Falls du vorab Fragen ' +
        'hast, kannst du mir gerne schreiben.</p>' +
        '<p>Bis nächste Woche!</p>' +
        abmeldeSatz_(e),
    ),
    attachments: [icsDatei_(e.titel, e.start, e.ende, e.ort, e.slug)],
  }
}

function mailEinTag_(e) {
  return ausDoc_('tag', e, mailEinTagStandard_)
}

function mailEinTagStandard_(e) {
  return {
    subject: 'Erinnerung NBK Treffen – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>schon morgen Abend findet unser nächstes NewBuild Kollektiv Treffen statt, ' +
        'für das du dich angemeldet hast.</p>' +
        '<p>Hier nochmal die Eckdaten zu deiner Übersicht:</p>' +
        eckdatenBlock_(e) +
        '<p>Im Anhang findest du auch nochmals die Kalenderdatei (.ics). Wenn du diese ' +
        'herunterlädst, erinnert sie dich ' +
        AUFBRUCH_VORLAUF_MIN +
        ' Minuten vor Beginn ans Aufbrechen.</p>' +
        '<p>Ich freue mich schon sehr auf morgen und den gemeinsamen Austausch mit dir.</p>' +
        '<p>Liebste Grüße,</p>' +
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
  return ausDoc_('drei', e, mailDreiStundenStandard_)
}

function mailDreiStundenStandard_(e) {
  return {
    subject: 'Gleich geht’s los: NBK Treffen – ' + kurzTitel_(e.titel),
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

// Abweichender Versandtag fuer die Rueckblick-Mail (sonst: Tag nach dem
// Event). slug -> 'TT.MM.JJJJ'. Uhrzeit wie in ERINNERUNG_STUFEN ("ab").
// Grundsatz (Ann, 21.10.2026): der Rueckblick geht IMMER am Tag nach dem
// Event raus — hier nur im Ausnahmefall etwas eintragen.
const NACHFASS_TERMIN = {}

// true, wenn die Tagesstufe an dem Tag faellig ist, fuer den tageBis/datum gelten.
function stufeFaelligAm_(stufe, slug, tageBis, datum) {
  if (stufe.bauen === mailNachfass_ && NACHFASS_TERMIN[slug]) return datum === NACHFASS_TERMIN[slug]
  return tageBis === stufe.wert
}

// Datum (Europe/Berlin) heute + plusTage als 'TT.MM.JJJJ'.
function datumStr_(jetzt, plusTage) {
  return Utilities.formatDate(new Date(jetzt.getTime() + plusTage * 86400000), 'Europe/Berlin', 'dd.MM.yyyy')
}

// "gestern" / "heute" / "am Dienstag" relativ zum Versandzeitpunkt, '' ohne Datum.
function eventTagWort_(start) {
  if (!start) return ''
  const diff = tagesDifferenz_(start, new Date())
  if (diff === 0) return 'heute'
  if (diff === 1) return 'gestern'
  return 'am ' + ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][start.getDay()]
}

// Individueller Rueckblick-Text ("war da") pro Event; ersetzt den Standardtext
// nach der Anrede. Bekommt das Mail-Objekt e.
const NACHFASS_DA_TEXT = {
  'session-03-ordner-zum-tool': function (e) {
    const tag = eventTagWort_(e.start)
    return (
      '<p>es war sehr schön, dass du' + (tag ? ' ' + tag : '') +
      ' bei unserem NBK Treffen dabei warst und wir uns dadurch wiedersehen konnten.</p>' +
      '<p>Ich hoffe, du konntest einige neue Gedanken und Impulse aus Niklas’ Vortrag, ' +
      'aber auch aus den Gesprächen mit den anderen Teilnehmer:innen mitnehmen.</p>' +
      '<p>Hier teile ich noch den Link zu <strong>Amenda</strong>, falls du dir das Tool noch ' +
      'etwas genauer anschauen möchtest: <a href="https://www.amenda.app" style="color:#3d5a80">www.amenda.app</a><br>' +
      'Ich selbst kannte Amenda vor meinem Austausch mit Niklas nicht und fand es umso spannender, ' +
      'dass es eine Projektmanagement-Lösung gibt, die speziell auf die Bedürfnisse von ' +
      'großen Architekturbüros zugeschnitten ist.</p>' +
      '<p>In Kürze werde ich außerdem die Fotos vom Abend mit euch teilen.</p>' +
      '<p>Ich freue mich jetzt schon auf unser nächstes <strong>NewBuild Kollektiv Treffen</strong>, ' +
      'das voraussichtlich Ende November stattfinden wird.</p>' +
      '<p>I’ll keep you updated.</p>' +
      '<p>Lieben Gruß und bis bald!<br>Ann-Kathrin</p>' +
      '<p style="color:#666;font-size:13px;margin-top:20px">P.S.: Wenn du Anregungen für unsere ' +
      'nächsten Treffen hast oder selbst einmal ein Thema vorstellen möchtest, schreib mir gern: ' +
      '<a href="' + feedbackLink_(e.slug, e.titel) + '" style="color:#3d5a80">Feedback geben</a> · ' +
      '<a href="' + referentLink_() + '" style="color:#3d5a80">Als Referent:in eintragen</a></p>'
    )
  },
}

// Satz zum naechsten Treffen in der "nicht da"-Mail, pro Event (sonst Standard).
const NACHFASS_NAECHSTES_TREFFEN = {
  'session-03-ordner-zum-tool':
    'Unser nächstes Treffen findet voraussichtlich Ende November statt. Die Infos dazu kommen bald.',
}

// Optionaler Zusatz-Absatz in der "war da"-Nachfassmail, pro Event.
// slug -> fertiges <p>…</p> (z. B. Hinweis aufs naechste Treffen).
const NACHFASS_ZUSATZ = {
  'session-01-ki-belohnt-ordnung':
    '<p>Übrigens: ' +
    '<a href="https://oblik.media/events/architecture-intelligence" style="color:#3d5a80">Hier findest du alle Infos und die Anmeldung</a> ' +
    'zum großen Event <strong>„Architecture Intelligence"</strong> am <strong>24. September</strong> – ' +
    'zu dem du gerne alle deine Teamkolleg:innen mit einladen darfst, um auch sie bei eurer ' +
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
  return ausDoc_('nichtda', e, nachfassNichtDaMailStandard_)
}

function nachfassNichtDaMailStandard_(e) {
  return {
    subject: 'Schade, dass du nicht dabei warst – NBK Treffen ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>schade, dass du es' + (eventTagWort_(e.start) ? ' ' + eventTagWort_(e.start) : '') +
        ' nicht zum NewBuild Kollektiv Treffen geschafft ' +
        'hast. ' + (NACHFASS_NAECHSTES_TREFFEN[e.slug] || 'Die Infos zum nächsten Treffen kommen bald.') +
        ' Ich hoffe sehr, dass ich dich dann begrüßen darf.</p>' +
        '<p style="margin:0 0 18px;padding:14px 16px;background:#f4f4f2;border-radius:8px">' +
        'Du warst <strong>doch da</strong>, hast dich nur vergessen am Eingang ' +
        'einzuchecken? Dann vermerken wir das und du bekommst gleich die ' +
        'Rückblick-Mail zum Abend.<br>' +
        '<a href="' + wardaLink_(e.sid, e.slug, e.email) +
        '" style="color:#3d5a80">Ja, ich war da →</a>' +
        '</p>' +
        '<p>Liebe Grüße und bis bald,</p>',
    ),
  }
}

function nachfassDaMail_(e) {
  return ausDoc_('da', e, nachfassDaMailStandard_)
}

function nachfassDaMailStandard_(e) {
  const individuell = NACHFASS_DA_TEXT[e.slug]
  if (individuell) {
    return {
      subject: 'Danke fürs Kommen – NBK Treffen – ' + kurzTitel_(e.titel),
      htmlBody: wrapMail_('<p>' + escapeHtml_(e.anrede) + ',</p>' + individuell(e)),
    }
  }
  const tag = eventTagWort_(e.start)
  return {
    subject: 'Danke fürs Kommen – NBK Treffen – ' + kurzTitel_(e.titel),
    htmlBody: wrapMail_(
      '<p>' +
        escapeHtml_(e.anrede) +
        ',</p>' +
        '<p>was für ein schöner Abend' + (tag ? ' ' + tag : '') + '!<br>' +
        'Ich habe mich sehr gefreut, dass du bei unserem NewBuild Kollektiv ' +
        'Abend dabei gewesen bist.</p>' +
        '<p>Ich hoffe, du hast ' +
        (e.referent
          ? 'den Austausch und das Vorgetragene von ' + escapeHtml_(e.referent) + ' '
          : 'den Austausch und die Impulse des Abends ') +
        'genauso genossen wie ich und nimmst Infos für deine eigene Praxis mit. ' +
        'Lass mich bitte wissen, falls du noch ' +
        '<a href="' + feedbackLink_(e.slug, e.titel) +
        '" style="color:#3d5a80">Hinweise für unsere nächsten Treffen</a> hast.</p>' +
        '<p>Und falls du selbst einmal ein Thema oder deine Erfahrungen mit dem Kollektiv teilen ' +
        'möchtest, <a href="' + referentLink_() +
        '" style="color:#3d5a80">trag dich gerne hier ein</a>.</p>' +
        '<p>Danke, dass du dabei warst und den Abend mitgestaltet hast.<br>' +
        'Ich freue mich schon auf das nächste Mal. Infos zum nächsten Treffen und Fotos folgen in Kürze.</p>' +
        (NACHFASS_ZUSATZ[e.slug] || '') +
        '<p>Bis bald und liebe Grüße,</p>',
    ),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIL-TEXTE AUS GOOGLE DOCS
//
//  Pro Event gibt es ein Google Doc "Mail-Texte · <Event>" (Ordner
//  DRIVE_FOLDER_NAME/Mail-Texte, freigegeben fuer VORSCHAU_EMPFAENGER). Jede
//  Mail ist ein Abschnitt mit Ueberschrift 1 (Bestätigung, 1 Woche vorher, …).
//  Die Mails lesen ihren Text bei jedem Versand frisch aus dem Doc — Texte
//  aendern heisst also nur: Doc bearbeiten, kein Code, kein Deploy.
//  Fehlt das Doc oder ein Abschnitt (oder ist er leer), gilt der Standardtext
//  aus den *Standard_-Funktionen. Bild, .ics und Signatur kommen immer aus dem
//  Code.
//
//  Neue Docs entstehen automatisch in sendeErinnerungen fuer jedes Event im
//  CMS, das hoechstens MAILDOC_VORLAUF_TAGE zurueckliegt.
//  Vorschau: newbuild-kollektiv.com/f/?do=mailvorschau&slug=<slug> (Testmail: do=mailtest)
// ═══════════════════════════════════════════════════════════════════════════
const MAILTEXTE_ORDNER = 'Mail-Texte'
const MAILDOC_VORLAUF_TAGE = 2

// [key, Ueberschrift im Doc, Versandzeitpunkt, Builder]
function mailArten_() {
  return [
    ['bestaetigung', 'Bestätigung', 'sofort bei der Anmeldung', bestaetigungMail_],
    ['woche', '1 Woche vorher', '7 Tage vor dem Event, ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', mailEineWoche_],
    ['tag', '1 Tag vorher', 'am Tag vor dem Event, ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', mailEinTag_],
    ['drei', '3 Stunden vorher', 'ca. 3 Stunden vor Beginn', mailDreiStunden_],
    ['da', 'Rückblick – war da', 'am Tag nach dem Event, ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', nachfassDaMail_],
    ['nichtda', 'Rückblick – nicht da', 'am Tag nach dem Event, ab ' + ERINNERUNG_SENDESTUNDE +
      ' Uhr – nur wenn der Check-in genutzt wurde und die Person nicht eingecheckt hat', nachfassNichtDaMail_],
  ]
}

function abschnittKey_(ueberschrift) {
  const t = String(ueberschrift || '').toLowerCase()
  if (t.indexOf('bestätigung') >= 0 || t.indexOf('bestaetigung') >= 0) return 'bestaetigung'
  if (t.indexOf('woche') >= 0) return 'woche'
  if (t.indexOf('stunde') >= 0) return 'drei'
  if (t.indexOf('nicht da') >= 0) return 'nichtda'
  if (t.indexOf('war da') >= 0 || t.indexOf('rückblick') >= 0) return 'da'
  if (t.indexOf('tag') >= 0) return 'tag'
  return ''
}

function mailDocId_(slug) {
  return slug ? PropertiesService.getScriptProperties().getProperty('mailDoc_' + slug) : null
}

// Pro Skriptlauf nur einmal lesen (ein Lauf verschickt ggf. viele Mails).
let MAILDOC_CACHE = {}

function mailDocAbschnitte_(slug) {
  if (Object.prototype.hasOwnProperty.call(MAILDOC_CACHE, slug)) return MAILDOC_CACHE[slug]
  let res = null
  const id = mailDocId_(slug)
  if (id) {
    try {
      res = parseMailDoc_(DocumentApp.openById(id).getBody())
    } catch (err) {
      Logger.log('Mail-Texte-Doc fuer ' + slug + ' nicht lesbar: ' + err)
    }
  }
  MAILDOC_CACHE[slug] = res
  return res
}

function parseMailDoc_(body, keyFn) {
  keyFn = keyFn || abschnittKey_
  const T = DocumentApp.ElementType
  const out = {}
  let akt = null
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i)
    const typ = el.getType()
    if (typ !== T.PARAGRAPH && typ !== T.LIST_ITEM) continue
    if (el.getHeading() === DocumentApp.ParagraphHeading.HEADING1) {
      const key = keyFn(el.getText())
      akt = key ? (out[key] = { betreff: '', absaetze: [] }) : null
      continue
    }
    if (!akt) continue
    const text = el.getText().trim()
    if (!text) continue
    if (!akt.betreff && !akt.absaetze.length && /^betreff\s*:/i.test(text)) {
      akt.betreff = text.replace(/^betreff\s*:\s*/i, '')
      continue
    }
    const groesse = el.editAsText().getFontSize(0)
    akt.absaetze.push({
      html: absatzHtml_(el),
      karte: /^\[\s*eventkarte\s*\]$/i.test(text),
      klein: !!groesse && groesse <= 10,
      liste: typ === T.LIST_ITEM,
    })
  }
  return out
}

// Absatz aus dem Doc -> HTML (fett, kursiv, Links, Zeilenumbrueche).
function absatzHtml_(absatz) {
  let html = ''
  for (let c = 0; c < absatz.getNumChildren(); c++) {
    const kind = absatz.getChild(c)
    if (kind.getType() !== DocumentApp.ElementType.TEXT) continue
    const t = kind.asText()
    const s = t.getText()
    const idx = t.getTextAttributeIndices()
    for (let k = 0; k < idx.length; k++) {
      const von = idx[k]
      const bis = k + 1 < idx.length ? idx[k + 1] : s.length
      if (bis <= von) continue
      let teil = escapeHtml_(s.slice(von, bis)).replace(/[\r\n\u000b]/g, '<br>')
      if (t.isBold(von)) teil = '<strong>' + teil + '</strong>'
      if (t.isItalic(von)) teil = '<em>' + teil + '</em>'
      const link = t.getLinkUrl(von)
      if (link) teil = '<a href="' + String(link).replace(/"/g, '%22') + '" style="color:#3d5a80">' + teil + '</a>'
      html += teil
    }
  }
  return html
}

function platzhalterWerte_(e) {
  return {
    anrede: e.anrede,
    titel: e.titel,
    kurztitel: kurzTitel_(e.titel),
    datum: e.datum,
    zeit: e.zeit,
    ort: e.ort,
    referent: e.referent,
    eventtag: eventTagWort_(e.start),
    minuten: AUFBRUCH_VORLAUF_MIN,
  }
}

function platzhalterLinks_(e) {
  return {
    abmelde: abmeldeLink_(e.sid, e.slug, e.titel, e.email, e.datum),
    feedback: feedbackLink_(e.slug, e.titel),
    referent: referentLink_(),
    maps: e.ort ? mapsLink_(e.ort) : '',
    eventseite: eventSeiteUrl_(e.slug),
    'ich-war-da': wardaLink_(e.sid, e.slug, e.email),
  }
}

// {Anrede} … und {Feedback-Link: Text} … in einem (schon escapten) HTML-Absatz.
function platzhalterHtml_(html, e) {
  const werte = platzhalterWerte_(e)
  const links = platzhalterLinks_(e)
  return String(html)
    .replace(/\{\s*([A-Za-zÄÖÜäöü-]+?)-Link\s*:\s*([^}]*)\}/g, function (m, name, text) {
      const url = links[name.toLowerCase()]
      return url ? '<a href="' + url + '" style="color:#3d5a80">' + text.trim() + '</a>' : text.trim()
    })
    .replace(/\{\s*([A-Za-zÄÖÜäöü]+)\s*\}/g, function (m, name) {
      const k = name.toLowerCase()
      return Object.prototype.hasOwnProperty.call(werte, k) ? escapeHtml_(werte[k] == null ? '' : werte[k]) : m
    })
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
}

function platzhalterText_(text, e) {
  const werte = platzhalterWerte_(e)
  return String(text)
    .replace(/\{\s*([A-Za-zÄÖÜäöü]+)\s*\}/g, function (m, name) {
      const k = name.toLowerCase()
      return Object.prototype.hasOwnProperty.call(werte, k) ? String(werte[k] == null ? '' : werte[k]) : m
    })
    .replace(/ {2,}/g, ' ')
}

function absaetzeZuHtml_(absaetze, e) {
  return absaetze
    .map(function (a) {
      if (a.karte) return eckdatenBlock_(e)
      const inhalt = platzhalterHtml_(a.html, e)
      if (/\{\s*Ich-war-da-Link/i.test(a.html)) {
        return '<p style="margin:0 0 18px;padding:14px 16px;background:#f4f4f2;border-radius:8px">' + inhalt + '</p>'
      }
      if (a.klein) return '<p style="color:#666;font-size:13px;margin:20px 0 18px">' + inhalt + '</p>'
      return '<p>' + (a.liste ? '• ' : '') + inhalt + '</p>'
    })
    .join('')
}

// Text aus dem Doc, sonst Standard. Anhaenge (.ics) immer vom Standard.
function ausDoc_(key, e, standard) {
  const m = standard(e)
  try {
    const abschnitte = e.slug ? mailDocAbschnitte_(e.slug) : null
    const a = abschnitte && abschnitte[key]
    if (!a || !a.absaetze.length) return m
    return {
      subject: a.betreff ? platzhalterText_(a.betreff, e) : m.subject,
      htmlBody: wrapMail_(absaetzeZuHtml_(a.absaetze, e)),
      attachments: m.attachments,
      ausDoc: true,
    }
  } catch (err) {
    Logger.log('Mail-Texte-Doc (' + key + ') — Standardtext verwendet: ' + err)
    return m
  }
}

// ── Doc anlegen ─────────────────────────────────────────────────────────────
// Vorlage: ['h', Ueberschrift] | ['p', Text] | ['k', kleiner Text] |
// ['li', Aufzaehlung]. Im Text: **fett**, [Linktext](https://…).
function mailDocVorlage_(slug) {
  const vorlage = [
    ['h', 'Bestätigung'],
    ['p', 'Betreff: Anmeldebestätigung: {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'vielen Dank für deine Anmeldung zu folgendem Event:'],
    ['p', '[EVENTKARTE]'],
    ['p', 'Im Anhang findest du eine Kalenderdatei (.ics) – einfach öffnen, dann steht der Termin direkt in deinem Kalender.'],
    ['p', 'Bei Rückfragen schreibe mir einfach eine E-Mail.'],
    ['p', 'Bis bald,'],
    ['k', 'Du kannst doch nicht? {Abmelde-Link: Hier abmelden.}'],

    ['h', '1 Woche vorher'],
    ['p', 'Betreff: In einer Woche: NBK Treffen – {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'in einer Woche ist es soweit: Unser NewBuild Kollektiv Treffen **„{Titel}“** findet am {Datum} um {Zeit} Uhr statt.'],
    ['p', '[EVENTKARTE]'],
    ['p', 'Im Anhang findest du eine Kalenderdatei (.ics). Diese kannst du dir einfach herunterladen, dann steht der Termin in deinem Kalender. Falls du vorab Fragen hast, kannst du mir gerne schreiben.'],
    ['p', 'Bis nächste Woche!'],
    ['k', 'Du kannst doch nicht? {Abmelde-Link: Hier abmelden.}'],

    ['h', '1 Tag vorher'],
    ['p', 'Betreff: Erinnerung NBK Treffen – {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'schon morgen Abend findet unser nächstes NewBuild Kollektiv Treffen statt, für das du dich angemeldet hast.'],
    ['p', 'Hier nochmal die Eckdaten zu deiner Übersicht:'],
    ['p', '[EVENTKARTE]'],
    ['p', 'Im Anhang findest du auch nochmals die Kalenderdatei (.ics). Wenn du diese herunterlädst, erinnert sie dich {Minuten} Minuten vor Beginn ans Aufbrechen.'],
    ['p', 'Ich freue mich schon sehr auf morgen und den gemeinsamen Austausch mit dir.'],
    ['p', 'Liebste Grüße,'],
    ['k', 'P.S.: Falls sich in deinem Terminkalender doch etwas geändert hat – {Abmelde-Link: hier abmelden}.'],

    ['h', '3 Stunden vorher'],
    ['p', 'Betreff: Gleich geht’s los: NBK Treffen – {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'in wenigen Stunden geht es los – heute um {Zeit} Uhr.'],
    ['p', '**{Ort}**'],
    ['p', '{Maps-Link: In Google Maps öffnen}'],
    ['p', 'Der Kalendereintrag hängt nochmal an. Bis gleich!'],

    ['h', 'Rückblick – war da'],
    ['p', 'Betreff: Danke fürs Kommen – NBK Treffen – {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'was für ein schöner Abend {Eventtag}! Ich habe mich sehr gefreut, dass du bei unserem NewBuild Kollektiv Abend dabei gewesen bist.'],
    ['p', 'Ich hoffe, du hast den Austausch und den Vortrag von {Referent} genauso genossen wie ich und nimmst Impulse für deine eigene Praxis mit.'],
    ['p', 'Ich freue mich schon auf das nächste Mal. Infos zum nächsten Treffen und Fotos folgen in Kürze.'],
    ['p', 'Bis bald und liebe Grüße,'],
    ['k', 'P.S.: Wenn du Anregungen für unsere nächsten Treffen hast oder selbst einmal ein Thema vorstellen möchtest, schreib mir gern: {Feedback-Link: Feedback geben} · {Referent-Link: Als Referent:in eintragen}'],

    ['h', 'Rückblick – nicht da'],
    ['p', 'Betreff: Schade, dass du nicht dabei warst – NBK Treffen {Kurztitel}'],
    ['p', '{Anrede},'],
    ['p', 'schade, dass du es {Eventtag} nicht zum NewBuild Kollektiv Treffen geschafft hast. Die Infos zum nächsten Treffen kommen bald. Ich hoffe sehr, dass ich dich dann begrüßen darf.'],
    ['p', 'Du warst **doch da**, hast dich nur vergessen am Eingang einzuchecken? Dann vermerken wir das und du bekommst gleich die Rückblick-Mail zum Abend. {Ich-war-da-Link: Ja, ich war da →}'],
    ['p', 'Liebe Grüße und bis bald,'],
  ]
  // Bestehende individuelle Texte (vor den Docs im Code gepflegt) uebernehmen.
  if (slug === 'session-03-ordner-zum-tool') {
    const i = vorlage.findIndex(function (z) { return z[1] === 'Rückblick – war da' })
    const j = vorlage.findIndex(function (z) { return z[1] === 'Rückblick – nicht da' })
    vorlage.splice(i + 1, j - i - 1,
      ['p', 'Betreff: Danke fürs Kommen – NBK Treffen – {Kurztitel}'],
      ['p', '{Anrede},'],
      ['p', 'es war sehr schön, dass du {Eventtag} bei unserem NBK Treffen dabei warst und wir uns dadurch wiedersehen konnten.'],
      ['p', 'Ich hoffe, du konntest einige neue Gedanken und Impulse aus Niklas’ Vortrag, aber auch aus den Gesprächen mit den anderen Teilnehmer:innen mitnehmen.'],
      ['p', 'Hier teile ich noch den Link zu **Amenda**, falls du dir das Tool noch etwas genauer anschauen möchtest: [www.amenda.app](https://www.amenda.app)\nIch selbst kannte Amenda vor meinem Austausch mit Niklas nicht und fand es umso spannender, dass es eine Projektmanagement-Lösung gibt, die speziell auf die Bedürfnisse von großen Architekturbüros zugeschnitten ist.'],
      ['p', 'In Kürze werde ich außerdem die Fotos vom Abend mit euch teilen.'],
      ['p', 'Ich freue mich jetzt schon auf unser nächstes **NewBuild Kollektiv Treffen**, das voraussichtlich Ende November stattfinden wird.'],
      ['p', 'I’ll keep you updated.'],
      ['p', 'Lieben Gruß und bis bald!\nAnn-Kathrin'],
      ['k', 'P.S.: Wenn du Anregungen für unsere nächsten Treffen hast oder selbst einmal ein Thema vorstellen möchtest, schreib mir gern: {Feedback-Link: Feedback geben} · {Referent-Link: Als Referent:in eintragen}'],
    )
    const k = vorlage.findIndex(function (z) { return /^schade, dass du es/.test(z[1]) })
    vorlage[k] = ['p', 'schade, dass du es {Eventtag} nicht zum NewBuild Kollektiv Treffen geschafft hast. Unser nächstes Treffen findet voraussichtlich Ende November statt. Die Infos dazu kommen bald. Ich hoffe sehr, dass ich dich dann begrüßen darf.']
  }
  return vorlage
}

// Haengt einen Absatz an. Setzt Schrift explizit, damit nichts vom vorigen
// Absatz "erbt" (Docs uebernimmt sonst z. B. die kleine Schrift).
function docAbsatz_(body, art, roh, link) {
  const D = DocumentApp
  const linkRe = /\[([^\]]+)\]\((https?:[^)]+)\)/g
  const fette = []
  const links = []
  let plain = ''
  // **fett** und [text](url) aufloesen
  String(roh).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:[^)]+\))/).forEach(function (teil) {
    if (!teil) return
    let m
    if (/^\*\*[^*]+\*\*$/.test(teil)) {
      const t = teil.slice(2, -2)
      fette.push([plain.length, plain.length + t.length - 1])
      plain += t
    } else if ((m = /^\[([^\]]+)\]\((https?:[^)]+)\)$/.exec(teil))) {
      links.push([plain.length, plain.length + m[1].length - 1, m[2]])
      plain += m[1]
    } else {
      plain += teil
    }
  })
  linkRe.lastIndex = 0
  const el = art === 'li' ? body.appendListItem(plain) : body.appendParagraph(plain)
  el.setHeading(
    art === 'h' ? D.ParagraphHeading.HEADING1
      : art === 'h2' ? D.ParagraphHeading.HEADING2
      : art === 'titel' ? D.ParagraphHeading.TITLE
      : D.ParagraphHeading.NORMAL,
  )
  if (!plain) return el
  const t = el.editAsText()
  t.setBold(false).setItalic(false).setLinkUrl(null)
  t.setFontSize(art === 'titel' ? 24 : art === 'h' ? 18 : art === 'h2' ? 13 : art === 'k' ? 9 : 11)
  t.setForegroundColor(art === 'k' ? '#666666' : '#000000')
  if (art === 'h' || art === 'h2') t.setBold(true)
  fette.forEach(function (f) { t.setBold(f[0], f[1], true) })
  links.forEach(function (l) { t.setLinkUrl(l[0], l[1], l[2]) })
  if (link) t.setLinkUrl(link)
  if (art === 'h') el.setSpacingBefore(28)
  return el
}

function mailTexteOrdner_() {
  const parent = getOrCreateFolder()
  const it = parent.getFoldersByName(MAILTEXTE_ORDNER)
  return it.hasNext() ? it.next() : parent.createFolder(MAILTEXTE_ORDNER)
}

// Ueber die Website (newbuild-kollektiv.com/f/), nicht direkt script.google.com:
// direkte Skript-Links scheitern, wenn im Browser mehrere Google-Konten
// angemeldet sind ("Datei kann derzeit nicht geöffnet werden").
function mailVorschauLink_(slug) {
  return SITE_FORM_URL + '?do=mailvorschau&slug=' + encodeURIComponent(slug)
}

function mailTestLink_(slug) {
  return SITE_FORM_URL + '?do=mailtest&slug=' + encodeURIComponent(slug)
}

// Einmalig: Links in bereits angelegten Docs auf die Website-Links umstellen.
function mailDocLinksAktualisieren_() {
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty('mailDocLinks_v2')) return
  const alle = props.getProperties()
  Object.keys(alle).forEach(function (k) {
    if (k.indexOf('mailDoc_') !== 0) return
    const slug = k.slice('mailDoc_'.length)
    try {
      const doc = DocumentApp.openById(alle[k])
      const body = doc.getBody()
      for (let i = 0; i < Math.min(body.getNumChildren(), 12); i++) {
        const el = body.getChild(i)
        if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue
        const t = el.editAsText()
        const url = t.getText() ? String(t.getLinkUrl(0) || '') : ''
        if (url.indexOf('action=mailvorschau') >= 0) t.setLinkUrl(mailVorschauLink_(slug))
        if (url.indexOf('action=mailtest') >= 0) t.setLinkUrl(mailTestLink_(slug))
      }
      doc.saveAndClose()
    } catch (err) {
      Logger.log('Mail-Texte-Doc Links (' + slug + '): ' + err)
    }
  })
  props.setProperty('mailDocLinks_v2', '1')
}

// Legt fuer jedes CMS-Event die drei Docs (Gäste, Sponsoren, Foto & Video)
// an — fuer kommende Events und solche, die hoechstens MAILDOC_VORLAUF_TAGE
// zurueckliegen — und schickt Ann einmal eine Mail mit den Links.
function mailTexteDocsAnlegen_(cmsEvents) {
  const heute = new Date()
  const props = PropertiesService.getScriptProperties()
  cmsEvents.forEach(function (ev) {
    const slug = String(ev.slug || '').trim()
    if (!slug) return
    const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
    if (!start || tagesDifferenz_(heute, start) < -MAILDOC_VORLAUF_TAGE) return
    const neu = []
    mailGruppe_().forEach(function (g) {
      if (props.getProperty(g.eventProp + slug)) return
      try {
        const r = eventGruppenDocAnlegen_(g, ev)
        if (r) neu.push(r)
      } catch (err) {
        Logger.log('Mail-Texte ' + g.titel + ' fuer ' + slug + ' fehlgeschlagen: ' + err)
      }
    })
    if (neu.length) mailDocsInfo_(ev, neu)
  })
}

function mailDocsInfo_(ev, neu) {
  const slug = String(ev.slug)
  try {
    GmailApp.sendEmail(
      VORSCHAU_EMPFAENGER,
      'Mail-Texte angelegt: ' + kurzTitel_(ev.title || slug),
      'Für „' + (ev.title || slug) + '“ sind die Mail-Texte angelegt:\n' +
        neu.map(function (n) { return n.titel + ': ' + n.url }).join('\n') +
        '\n\nVorschau aller Mails: ' + mailVorschauLink_(slug),
      {
        name: SENDER_NAME,
        from: SENDER_EMAIL,
        htmlBody: wrapMail_(
          '<p>Für <strong>„' + escapeHtml_(ev.title || slug) + '“</strong> sind die Mail-Texte angelegt. ' +
            'Dort kannst du alle automatischen Mails zu diesem Event anpassen – ohne Code.</p>' +
            '<p>' + neu.map(function (n) {
              return '<a href="' + n.url + '" style="color:#3d5a80">Mail-Texte ' + escapeHtml_(n.titel) + '</a>'
            }).join(' · ') + '</p>' +
            '<p><a href="' + mailVorschauLink_(slug) + '" style="color:#3d5a80">Vorschau aller Mails</a></p>' +
            '<p style="color:#666;font-size:13px">Anfragen an Foto/Video und die Info an Sponsoren gehen frühestens ' +
            'morgen ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr raus – vorher bekommst du jeweils eine Vorschau.</p>',
        ),
      },
    )
  } catch (err) {
    Logger.log('Mail-Texte — Info-Mail fehlgeschlagen: ' + err)
  }
}

// EINMALIG im Editor ausfuehren (fragt die Berechtigung fuer Google Docs ab und
// legt die Docs fuer alle aktuellen Events sofort an).
function mailTexteDocsJetztAnlegen() {
  const events = ladeCmsEvents_()
  mailGruppe_().forEach(function (g) { Logger.log('Grundvorlage ' + g.titel + ': ' + grundvorlageDoc_(g).getUrl()) })
  mailTexteDocsAnlegen_(events)
  events.forEach(function (ev) {
    mailGruppe_().forEach(function (g) {
      const id = PropertiesService.getScriptProperties().getProperty(g.eventProp + String(ev.slug || ''))
      if (id) Logger.log(ev.slug + ' · ' + g.titel + ': https://docs.google.com/document/d/' + id + '/edit')
    })
  })
}

// ── Vorschau im Browser + Testmail ──────────────────────────────────────────
function vorschauEventDaten_(slug) {
  const ev = ladeCmsEvents_().filter(function (x) { return x.slug === slug })[0]
  if (!ev) return null
  const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
  return {
    anrede: anrede_('w', 'Ann-Kathrin'),
    slug: slug,
    sid: '',
    email: VORSCHAU_EMPFAENGER,
    titel: String(ev.title || '').trim(),
    referent: referentText_(ev.speakerName, ev.speakerRole, ev.speakerCompany),
    datum: datumAnzeige_(String(ev.date || '')),
    zeit: String(ev.time || ''),
    ort: String(ev.location || ''),
    start: start,
    ende: start ? parseEventEnde_(start, String(ev.time || '')) : null,
    checkinGenutzt: true,
    anwesend: true,
  }
}

function mailVorschauSeite_(p) {
  return HtmlService.createHtmlOutput(
    '<base target="_blank"><style>body{font-family:Arial,Helvetica,sans-serif;background:#ececea;margin:0;padding:24px 16px;color:#111}</style>' +
      mailVorschauHtml_(String(p.slug || '')),
  )
    .setTitle('Mail-Vorschau – NewBuild Kollektiv')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
}

// Beispiel-Mails an Sponsoren und Foto/Video fuer Vorschau und Testmail
// (Empfaengerin Ann, Zusage-Links ohne gueltigen Token).
function gruppenBeispielMails_(slug) {
  const ev = ladeCmsEvents_().filter(function (x) { return x.slug === slug })[0]
  if (!ev) return []
  const start = parseEventDatum_(String(ev.date || ''), String(ev.time || ''))
  let upload = 'https://drive.google.com/'
  try {
    const m = medienEventOrdner_(ev, false)
    if (m) upload = m.unter.Photos.getUrl()
  } catch (err) {}
  const vorher = 'Di., 17.11.2026 · 18:30 Uhr · Beispielort (nur Beispiel)'
  const out = []
  const mk = { name: 'Ann-Kathrin Salich', email: VORSCHAU_EMPFAENGER, honorar: '300 € netto (2 Std. à 150 €) – Beispiel' }
  const md = medienMailDaten_(mk, 'Foto', ev, { token: 'VORSCHAU', upload: upload, vorher: vorher })
  const mIcs = medienIcs_(ev, 'Foto', '')
  ;[
    ['anfrage', 'Anfrage', 'sobald das Event im CMS steht: Vorschau an dich, Versand am nächsten Tag ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr an Kontakt A', true],
    ['tag', '1 Tag vorher', 'am Tag vor dem Event ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', true],
    ['danke', 'Nach dem Event', 'am Tag nach dem Event ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', false],
    ['aenderung', 'Änderung (nur falls nötig)', 'sofort, wenn Datum, Zeit oder Ort im CMS geändert werden', true],
  ].forEach(function (a) {
    const m = medienMail_(a[0], md)
    if (a[3] && mIcs) m.attachments = [mIcs]
    out.push({ gruppe: 'Foto & Video', titel: a[1], wann: a[2], m: m })
  })

  let firma = 'Beispiel GmbH'
  try {
    const ss = sponsorSpreadsheet_()
    const ew = ss.getSheetByName('Einsätze').getDataRange().getValues()
    const kw = ss.getSheetByName('Kontakte').getDataRange().getValues()
    const zeile = ew.filter(function (z) { return String(z[ew[0].indexOf('Slug')]) === slug })[0]
    const name = zeile ? String(zeile[ew[0].indexOf('Sponsor 1')] || '').trim().toLowerCase() : ''
    const k = name && kw.filter(function (z) { return String(z[kw[0].indexOf('Name')]).trim().toLowerCase() === name })[0]
    if (k && k[kw[0].indexOf('Firma')]) firma = String(k[kw[0].indexOf('Firma')])
  } catch (err) {}
  const sk = { name: 'Ann-Kathrin', firma: firma, anrede: 'w', email: VORSCHAU_EMPFAENGER }
  const sIcs = start ? icsDatei_(ev.title, start, parseEventEnde_(start, String(ev.time || '')), String(ev.location || ''), slug) : null
  ;[
    ['info', 'Info zum Event', 'nach dem Eintragen in „Sponsor Contacts“: Vorschau an dich, Versand am nächsten Tag ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', true],
    ['woche', '1 Woche vorher', '7 Tage vor dem Event ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', true],
    ['aenderung', 'Änderung', 'sofort, wenn Datum, Zeit oder Ort im CMS geändert werden', true],
    ['danke', 'Nach dem Event', (SPONSOR_DANKE_NACH_TAGEN === 1 ? 'am Tag' : SPONSOR_DANKE_NACH_TAGEN + ' Tage') + ' nach dem Event ab ' + ERINNERUNG_SENDESTUNDE + ' Uhr', false],
  ].forEach(function (a) {
    const m = gruppenMail_(mailGruppe_('sponsoren'), a[0], sponsorMailDaten_(sk, ev, { vorher: vorher }))
    if (a[3] && sIcs) m.attachments = [sIcs]
    out.push({ gruppe: 'Sponsoren', titel: a[1], wann: a[2], m: m })
  })
  return out
}

function vorschauKarte_(titel, tag, wann, m) {
  const anh = (m.attachments || []).map(function (b) { return b.getName ? b.getName() : 'Anhang' })
  return (
    '<div class="k"><div class="m"><h2>' + escapeHtml_(titel) + (tag ? ' <span class="tag">' + escapeHtml_(tag) + '</span>' : '') + '</h2>' +
    'Versand: ' + escapeHtml_(wann) + '<br><strong>Betreff:</strong> ' + escapeHtml_(m.subject) +
    (anh.length ? '<br><strong>Anhang:</strong> 📎 ' + escapeHtml_(anh.join(', ')) : '') +
    '</div>' + m.htmlBody + signaturHtml_() + '</div>'
  )
}

// Inhalt der Vorschau (auch fuer newbuild-kollektiv.com/f/?do=mailvorschau).
function mailVorschauHtml_(slug) {
  const e = vorschauEventDaten_(slug)
  if (!e) return '<p>Event „' + escapeHtml_(slug) + '“ nicht gefunden.</p>'
  let html =
    '<style>.nbkv{text-align:left}.nbkv .k{background:#fff;border-radius:12px;padding:20px 22px;margin:0 0 26px}' +
    '.nbkv .m{font-size:13px;color:#555;border-bottom:1px solid #e3e3e0;padding-bottom:12px;margin-bottom:16px}' +
    '.nbkv h1{font-size:22px;font-weight:500}.nbkv h2{font-size:17px;margin:0 0 6px}.nbkv a{color:#3d5a80}' +
    '.nbkv .tag{font-size:11px;padding:2px 7px;border-radius:9px;background:#e3ecf5}</style>' +
    '<div class="nbkv"><h1>Mail-Vorschau · ' + escapeHtml_(e.titel) + '</h1><p>Texte bearbeiten: ' +
    mailGruppe_().map(function (g) {
      const url = gruppenDocUrl_(g, slug)
      return url ? '<a href="' + url + '">' + escapeHtml_(g.titel) + '</a>' : escapeHtml_(g.titel) + ' (Standardtext)'
    }).join(' · ') + ' — ' +
    '<a href="' + mailTestLink_(slug) + '">Alle als Testmail an mich schicken</a></p>' +
    '<p style="font-size:13px;color:#555">Beispiel-Empfängerin: Ann-Kathrin. Diese Seite zeigt immer den aktuellen Stand der Docs – nach einer Änderung einfach neu laden.</p>' +
    '<h1 style="margin-top:34px">Gäste</h1>'
  mailArten_().forEach(function (art) {
    let m
    try {
      m = art[3](e)
    } catch (err) {
      html += '<div class="k"><h2>' + escapeHtml_(art[1]) + '</h2><p style="color:#b00">Fehler: ' + escapeHtml_(err) + '</p></div>'
      return
    }
    const anh = (m.attachments || []).map(function (b) { return b.getName ? b.getName() : 'Anhang' })
    html +=
      '<div class="k"><div class="m"><h2>' + escapeHtml_(art[1]) + ' <span class="tag">' +
      (m.ausDoc ? 'Text aus dem Doc' : 'Standardtext') + '</span></h2>' +
      'Versand: ' + escapeHtml_(art[2]) + '<br><strong>Betreff:</strong> ' + escapeHtml_(m.subject) +
      (anh.length ? '<br><strong>Anhang:</strong> 📎 ' + escapeHtml_(anh.join(', ')) : '') +
      '</div>' + m.htmlBody + signaturHtml_() + '</div>'
  })
  let gruppe = ''
  try {
    gruppenBeispielMails_(slug).forEach(function (b) {
      if (b.gruppe !== gruppe) {
        gruppe = b.gruppe
        html += '<h1 style="margin-top:34px">' + escapeHtml_(gruppe) + '</h1>'
      }
      html += vorschauKarte_(b.titel, '', b.wann, b.m)
    })
  } catch (err) {
    html += '<p style="color:#b00">Sponsoren/Foto & Video: ' + escapeHtml_(err) + '</p>'
  }
  return html + '</div>'
}

function mailTestSenden_(p) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px">' + mailTestHtml_(String(p.slug || '')) + '</div>',
  ).setTitle('Testmail – NewBuild Kollektiv')
}

function mailTestHtml_(slug) {
  const e = vorschauEventDaten_(slug)
  if (!e) return '<p>Event nicht gefunden.</p>'
  const cache = CacheService.getScriptCache()
  if (cache.get('mailtest_' + slug)) {
    return '<h1>Schon unterwegs</h1><p>Die Testmails sind gerade erst rausgegangen – schau in dein Postfach (' + VORSCHAU_EMPFAENGER + ').</p>'
  }
  cache.put('mailtest_' + slug, '1', 60)
  let n = 0
  mailArten_().forEach(function (art) {
    try {
      const m = art[3](e)
      sendeTeilnehmerMail_(VORSCHAU_EMPFAENGER, '[TEST · ' + art[1] + '] ' + m.subject, m.htmlBody, m.attachments)
      n++
      Utilities.sleep(300)
    } catch (err) {
      Logger.log('Testmail ' + art[1] + ' fehlgeschlagen: ' + err)
    }
  })
  try {
    gruppenBeispielMails_(slug).forEach(function (b) {
      sendeTeilnehmerMail_(VORSCHAU_EMPFAENGER, '[TEST · ' + b.gruppe + ' · ' + b.titel + '] ' + b.m.subject, b.m.htmlBody, b.m.attachments)
      n++
      Utilities.sleep(300)
    })
  } catch (err) {
    Logger.log('Testmail Sponsoren/Foto & Video fehlgeschlagen: ' + err)
  }
  return '<h1>Testmails verschickt</h1><p>' + n + ' Testmails sind an ' + VORSCHAU_EMPFAENGER + ' unterwegs.</p>'
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
    referent: 'Markus Kolb, Geschäftsführer Bräunlin Kolb Architekten',
    datum: 'Di., 01.09.2026',
    zeit: '18:30–20:00',
    ort: 'Projo Berlin, Chausseestraße 123, 10115 Berlin',
    start: start,
    ende: new Date(start.getTime() + 90 * 60000),
  }

  const best = bestaetigungMail_(e)
  sendeTeilnehmerMail_(TEST_EMPFAENGER, '[TEST] ' + best.subject, best.htmlBody, best.attachments)
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
