import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

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
      },
    },
  },
})
