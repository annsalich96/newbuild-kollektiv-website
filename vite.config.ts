import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { generateEventPages } from './scripts/generate-event-pages.mjs'
import { generateMailCards } from './scripts/generate-mail-cards.mjs'
import { isPortrait } from './scripts/image-orientation.mjs'

// Erzeugt events/<slug>/index.html aus src/content/events.json - muss vor
// dem rollupOptions.input unten passieren, da Rollup die Dateien physisch
// auf der Platte braucht.
const eventEntries = generateEventPages()

// Hochformat-Fotos der Startseiten-Galerie (content/gallery.json) - main.ts
// gibt ihnen die schmale Breite (4 statt 8 Spalten), siehe style.css.
const galleryPortraits = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('./src/content/gallery.json', import.meta.url)), 'utf-8'),
  ).photos as { photo?: string }[]
)
  .map((p) => p.photo)
  .filter((src): src is string => !!src && isPortrait(src))

export default defineConfig({
  define: {
    __GALERIE_HOCHFORMAT__: JSON.stringify(galleryPortraits),
  },
  plugins: [
    {
      // Veroeffentlicht die aktuellen CMS-Eventdaten unter /events.json. Das
      // Apps Script (sendeErinnerungen) liest Datum/Zeit/Ort/Referent von
      // dort statt aus alten Anmeldezeilen - sonst gingen nach einer
      // Datumsaenderung in Pages CMS Erinnerungen zum alten Termin raus
      // (passiert am 2026-09-29 mit Session 03: 06.10. statt 20.10.).
      name: 'publish-events-json',
      async generateBundle() {
        // Eventkarten fuer die Mails (+ Uebersicht unter /mail/), siehe
        // scripts/generate-mail-cards.mjs.
        for (const datei of await generateMailCards()) {
          this.emitFile({ type: 'asset', fileName: datei.fileName, source: datei.source })
        }
        this.emitFile({
          type: 'asset',
          fileName: 'events.json',
          source: readFileSync(
            fileURLToPath(new URL('./src/content/events.json', import.meta.url)),
            'utf-8',
          ),
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        impressum: fileURLToPath(new URL('./impressum.html', import.meta.url)),
        datenschutzerklaerung: fileURLToPath(
          new URL('./datenschutzerklaerung.html', import.meta.url),
        ),
        widerrufsrecht: fileURLToPath(new URL('./widerrufsrecht.html', import.meta.url)),
        newsletter: fileURLToPath(new URL('./newsletter/index.html', import.meta.url)),
        ...eventEntries,
      },
    },
  },
})
