// Lebendiger Verlauf (Ann 2026-11-25, dritte Fassung): eine halbtransparente
// KOPIE des eigenen Hintergrund-Verlaufs liegt ueber dem Original und
// verschiebt sich sehr langsam minimal dagegen. Dadurch wandert nur der
// Farbschwerpunkt leicht - exakt dieselben Farben, keine zusaetzlichen
// Farbflecken. Die Ebene gehoert zum Hintergrund und scrollt normal mit;
// die Bewegung haengt nur an der Zeit, nicht am Scrollen.
// Nur transform wird animiert (Grafikkarte, kein Neumalen). Das Korn liegt
// als oberste Ebene darueber (.verlauf-korn), damit es gleich stark bleibt.
// Bei "Bewegung reduzieren" nichts davon.
export function initVerlauf(host: HTMLElement | null) {
  if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const welle = document.createElement('div')
  welle.className = 'verlauf-welle'
  welle.setAttribute('aria-hidden', 'true')
  welle.innerHTML = '<div class="verlauf-welle__kopie"></div>'
  const korn = document.createElement('div')
  korn.className = 'verlauf-korn'
  korn.setAttribute('aria-hidden', 'true')
  host.prepend(welle)
  welle.after(korn)
  host.classList.add('has-verlauf')
}
