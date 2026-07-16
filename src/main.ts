import './style.css'

// Fotogalerien haben keine sichtbare Scrollleiste — Scrollen per Ziehen mit
// der linken Maustaste (zusätzlich zu Wheel/Trackpad, die weiterhin funktionieren).
function enableDragScroll(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return

  let isDown = false
  let startX = 0
  let scrollStart = 0

  el.addEventListener('mousedown', (e) => {
    isDown = true
    startX = e.pageX
    scrollStart = el.scrollLeft
    el.classList.add('is-dragging')
  })

  window.addEventListener('mouseup', () => {
    if (!isDown) return
    isDown = false
    el.classList.remove('is-dragging')
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDown) return
    e.preventDefault()
    el.scrollLeft = scrollStart - (e.pageX - startX)
  })
}

enableDragScroll('.team-row-wrap')
enableDragScroll('.photo-gallery-2-wrap')
