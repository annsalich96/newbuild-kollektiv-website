// Geteilte Navigations-Logik (Sticky-Leiste + Mobile-Menue-Toggle), von
// main.ts (Startseite) UND event-form.ts (Event-Unterseiten) genutzt, da
// beide dieselbe Nav-Leiste im Markup haben (siehe scripts/event-page.
// template.html und index.html).

// Floating Nav (Desktop .site-nav / Mobile .mobile-nav-bar): bleibt an der
// normalen Position, bis sie beim Runterscrollen oben aus dem Viewport
// laufen wuerde — erst dann wird sie fixiert. position:sticky allein reicht
// nicht, da beide Leisten im DOM innerhalb eines kurzen Hero-Bereichs sitzen
// und sich dadurch schon nach kurzer Scrolldistanz wieder loesen wuerden.
// Die urspruengliche Position wird einmalig gemessen (vor jedem Fixieren
// neu, falls sich die Seite/Schriftgroessen aendern), damit es bei jeder
// Viewport-Breite (Desktop/Mobile-Umschaltung) korrekt bleibt.
export function initStickyNav() {
  document.querySelectorAll<HTMLElement>('.site-nav, .mobile-nav-bar').forEach((bar) => {
    let naturalTop: number | null = null
    let stuckOffset = 0

    // Misst den CSS-"top"-Wert von .is-stuck (z.B. 0.125*Balken bei der
    // Desktop-Nav, 0 bei der Mobile-Leiste) live ueber das Layout, statt ihn
    // hier als Zahl zu duplizieren — bleibt so automatisch korrekt, egal was
    // in style.css eingestellt ist. Kurzes synchrones An/Abschalten der
    // Klasse fuer die Messung erzeugt keinen sichtbaren Flackerer, da der
    // Browser erst nach Ende dieses Scripts neu zeichnet.
    const measureStuckOffset = () => {
      const wasStuck = bar.classList.contains('is-stuck')
      if (!wasStuck) bar.classList.add('is-stuck')
      const top = bar.getBoundingClientRect().top
      if (!wasStuck) bar.classList.remove('is-stuck')
      return top
    }

    const update = () => {
      if (!bar.classList.contains('is-stuck')) {
        naturalTop = bar.getBoundingClientRect().top + window.scrollY
      }
      if (naturalTop === null) return
      // Fixiert wird schon, sobald die Leiste an ihrer natuerlichen Position
      // den Sticky-Abstand (stuckOffset) erreichen wuerde — nicht erst wenn
      // sie komplett am oberen Rand ankaeme. So passiert der Wechsel zu
      // position:fixed nahtlos ohne sichtbaren Sprung (Absprache).
      // +2px Toleranz: manche mobile Browser liefern beim Zurueckscrollen an
      // die Seitenspitze einen minimal von 0 abweichenden scrollY (Rundungs-
      // /Adressleisten-Artefakt) — bei der Mobile-Leiste (stuckOffset ~ 0)
      // blieb sie dadurch faelschlich im blurry/sticky Zustand haengen,
      // obwohl man sichtbar ganz oben war.
      const threshold = naturalTop - stuckOffset + 2
      bar.classList.toggle('is-stuck', window.scrollY > threshold)
    }

    stuckOffset = measureStuckOffset()
    update()
    window.addEventListener('scroll', update, { passive: true })

    // Nur bei echter Breitenaenderung zuruecksetzen (z.B. Geraet gedreht),
    // nicht bei jedem 'resize' — mobile Browser feuern 'resize' auch, wenn
    // beim Scrollen die Adressleiste ein-/ausblendet (Hoehenaenderung). Ein
    // Reset genau in diesem Moment konnte eine falsche Ruheposition
    // einfangen (Bug: Leiste blieb nach dem Hochscrollen faelschlich im
    // schwebenden/blurry Zustand haengen).
    let lastWidth = window.innerWidth
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      bar.classList.remove('is-stuck')
      naturalTop = null
      stuckOffset = measureStuckOffset()
      update()
    })
  })
}

export function initMobileNavToggle() {
  const navToggle = document.querySelector<HTMLButtonElement>('.mobile-nav-toggle')
  const navPanel = document.querySelector<HTMLElement>('.mobile-nav-panel')

  if (navToggle && navPanel) {
    navToggle.addEventListener('click', () => {
      const isOpen = !navPanel.hidden
      navPanel.hidden = isOpen
      navToggle.setAttribute('aria-expanded', String(!isOpen))
    })

    navPanel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navPanel.hidden = true
        navToggle.setAttribute('aria-expanded', 'false')
      })
    })
  }
}
