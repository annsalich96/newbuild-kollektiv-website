import { initCarousel } from './carousel'
import { isPastEvent } from './event-date'

// Nach dem Event: Galerie (falls Fotos im CMS hinterlegt) statt Anmeldeformular.
// Ausnahme Check-in-Link (?checkin=1): dann bleibt das Formular stehen.
export function initEventGallery(eventDate: string, fromCheckin: boolean) {
  const section = document.getElementById('event-gallery')
  const formSection = document.getElementById('event-form-section')
  if (!section || !formSection || fromCheckin || !isPastEvent(eventDate)) return

  formSection.hidden = true
  section.hidden = false
  const marquee = section.querySelector<HTMLElement>('.gallery-marquee')
  if (marquee) initCarousel(marquee)
}
