import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { generateEventPages } from './scripts/generate-event-pages.mjs'

// Erzeugt events/<slug>/index.html aus src/content/events.json - muss vor
// dem rollupOptions.input unten passieren, da Rollup die Dateien physisch
// auf der Platte braucht.
const eventEntries = generateEventPages()

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        impressum: fileURLToPath(new URL('./impressum.html', import.meta.url)),
        datenschutzerklaerung: fileURLToPath(
          new URL('./datenschutzerklaerung.html', import.meta.url),
        ),
        widerrufsrecht: fileURLToPath(new URL('./widerrufsrecht.html', import.meta.url)),
        ...eventEntries,
      },
    },
  },
})
