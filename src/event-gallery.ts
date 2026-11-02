import { isPastEvent } from './event-date'

// Nach dem Event: Galerie (falls Fotos im CMS hinterlegt) statt Anmeldeformular.
// Ausnahme Check-in-Link (?checkin=1): dann bleibt das Formular stehen.
export function initEventGallery(eventDate: string, fromCheckin: boolean) {
  const section = document.getElementById('event-gallery')
  const formSection = document.getElementById('event-form-section')
  if (!section || !formSection || fromCheckin || !isPastEvent(eventDate)) return

  formSection.hidden = true
  section.hidden = false

  const gallery = section.querySelector<HTMLElement>('.event-gallery')
  const track = section.querySelector<HTMLElement>('.event-gallery__track')
  const counter = section.querySelector<HTMLElement>('.event-gallery__counter')
  if (!gallery || !track) return
  const total = track.children.length

  const current = () => Math.round(track.scrollLeft / track.clientWidth)
  // Endlos durchklicken: nach dem letzten Bild wieder das erste.
  const go = (index: number) => {
    const target = (index + total) % total
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' })
  }

  section.querySelector('.event-gallery__arrow--prev')?.addEventListener('click', () => go(current() - 1))
  section.querySelector('.event-gallery__arrow--next')?.addEventListener('click', () => go(current() + 1))
  gallery.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') go(current() - 1)
    else if (event.key === 'ArrowRight') go(current() + 1)
    else return
    event.preventDefault()
  })
  track.addEventListener(
    'scroll',
    () => {
      if (counter) counter.textContent = `${current() + 1} / ${total}`
    },
    { passive: true }
  )
}
