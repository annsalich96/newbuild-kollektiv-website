// Sicherheitscheck: prueft vor jedem Build, ob die Inhalte in
// src/content/*.json noch zu den Feldern passen, die .pages.yml als
// "required" (Pflichtfeld) deklariert. Faengt z.B. den Fall ab, dass ein
// ueber Pages CMS leer gelassenes Pflichtfeld komplett fehlt (Ursache fuer
// den kaputten Build am 2026-07-30 bei "Team" -> "image").
//
// Laeuft in Millisekunden (nur ein paar kleine JSON/YAML-Dateien), siehe
// package.json ("build"-Script).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf-8'))
}

// Prueft ein Feld (aus .pages.yml "fields:") gegen den passenden Wert aus
// den echten Inhalten. `path` ist nur fuer verstaendliche Fehlermeldungen.
function checkField(field, value, path, errors) {
  const isRequired = field.required !== false
  const isMissing = value === undefined || value === null || value === ''

  if (isRequired && isMissing) {
    errors.push(`${path}${field.name}: Pflichtfeld fehlt oder ist leer`)
    return
  }
  if (isMissing) return // optional und leer -> ok, nichts weiter zu pruefen

  if (field.list) {
    if (!Array.isArray(value)) {
      errors.push(`${path}${field.name}: sollte laut Schema eine Liste sein`)
      return
    }
    value.forEach((item, i) => {
      const itemPath = `${path}${field.name}[${i}].`
      if (field.type === 'object' && field.fields) {
        for (const subField of field.fields) {
          checkField(subField, item?.[subField.name], itemPath, errors)
        }
      }
    })
    return
  }

  if (field.type === 'object' && field.fields) {
    for (const subField of field.fields) {
      checkField(subField, value?.[subField.name], `${path}${field.name}.`, errors)
    }
  }
}

// Events werden seit 27.11.2026 nicht mehr in Pages CMS gepflegt, sondern in NBK intern
// (intern.newbuild-kollektiv.com), das src/content/events.json direkt ins Repo schreibt.
// Die Pflichtfelder pruefen wir deshalb hier fest, nicht mehr ueber .pages.yml.
const EVENT_REQUIRED = ['slug', 'introLabel', 'title', 'date', 'time', 'location', 'description']
const EVENT_LIST_REQUIRED = {
  facts: ['label', 'value'], program: ['title'], hosts: ['name'],
  partners: ['category', 'name'], speakers: ['name'], sponsors: ['name'],
}
function checkEvents(errors) {
  const path = 'src/content/events.json'
  let data
  try {
    data = readJson(path)
  } catch (e) {
    errors.push(`${path}: Datei fehlt oder ist kein gueltiges JSON (${e.message})`)
    return
  }
  const leer = (v) => v === undefined || v === null || v === ''
  ;(data.events || []).forEach((ev, i) => {
    const at = `${path} -> events[${i}].`
    for (const f of EVENT_REQUIRED) if (leer(ev[f])) errors.push(`${at}${f}: Pflichtfeld fehlt oder ist leer`)
    if (ev.slug && !/^[a-z0-9-]+$/.test(ev.slug)) errors.push(`${at}slug: nur Kleinbuchstaben, Zahlen, Bindestriche`)
    for (const [list, fields] of Object.entries(EVENT_LIST_REQUIRED)) {
      if (ev[list] === undefined) continue
      if (!Array.isArray(ev[list])) { errors.push(`${at}${list}: sollte eine Liste sein`); continue }
      ev[list].forEach((it, j) => { for (const f of fields) if (leer(it?.[f])) errors.push(`${at}${list}[${j}].${f}: Pflichtfeld fehlt oder ist leer`) })
    }
  })
}

function main() {
  const config = parseYaml(readFileSync(join(root, '.pages.yml'), 'utf-8'))
  const errors = []

  for (const entry of config.content) {
    let data
    try {
      data = readJson(entry.path)
    } catch (e) {
      errors.push(`${entry.path}: Datei fehlt oder ist kein gueltiges JSON (${e.message})`)
      continue
    }

    for (const field of entry.fields) {
      checkField(field, data[field.name], `${entry.path} -> `, errors)
    }
  }

  checkEvents(errors)

  if (errors.length > 0) {
    console.error('CMS-Schema-Check fehlgeschlagen:\n')
    for (const err of errors) console.error('  - ' + err)
    console.error('\nEntweder den fehlenden Wert in der content/*.json ergaenzen,')
    console.error('oder das Feld in .pages.yml auf "required: false" setzen (und den')
    console.error('zugehoerigen TypeScript-Typ im Code als optional markieren).')
    process.exit(1)
  }

  console.log('CMS-Schema-Check ok (' + config.content.length + ' Content-Typen geprueft).')
}

main()
