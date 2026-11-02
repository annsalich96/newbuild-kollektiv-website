// Seitenverhaeltnis eines Bildes aus public/ fuer die Fotogalerien: jedes Foto
// wird in seinem Originalformat gezeigt (gleiche Hoehe, Breite ergibt sich),
// nichts wird abgeschnitten - siehe style.css. Liest nur den Dateikopf (JPEG
// inkl. EXIF-Drehung, PNG), keine Abhaengigkeit. Wird beim Build ausgewertet,
// damit die Breiten schon im HTML stehen und beim Laden nichts springt.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

function jpegSize(buf) {
  let pos = 2
  let rotated = false
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) return null
    const marker = buf[pos + 1]
    const len = buf.readUInt16BE(pos + 2)
    // APP1/Exif: Orientation 5-8 = um 90 Grad gedreht gespeichert
    if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 8) === 'Exif') {
      const tiff = pos + 10
      const le = buf.toString('latin1', tiff, tiff + 2) === 'II'
      const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
      const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
      const ifd = tiff + u32(tiff + 4)
      for (let i = 0, n = u16(ifd); i < n; i++) {
        const entry = ifd + 2 + i * 12
        if (u16(entry) === 0x0112) rotated = u16(entry + 8) >= 5
      }
    }
    // SOF0-SOF15 (ohne DHT/JPG/DAC) enthalten Hoehe/Breite
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const h = buf.readUInt16BE(pos + 5)
      const w = buf.readUInt16BE(pos + 7)
      return rotated ? { w: h, h: w } : { w, h }
    }
    pos += 2 + len
  }
  return null
}

function imageSize(path) {
  const buf = readFileSync(path)
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf)
  if (buf.toString('latin1', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  return null
}

// "Breite / Hoehe" fuer CSS aspect-ratio, z.B. "1600 / 1067". Unlesbare oder
// fehlende Dateien bekommen 3 / 2.
export function imageRatio(src) {
  try {
    const size = imageSize(join(publicDir, decodeURIComponent(String(src).replace(/^\//, ''))))
    if (size && size.w && size.h) return `${size.w} / ${size.h}`
  } catch {
    // faellt auf Standard zurueck
  }
  return '3 / 2'
}
