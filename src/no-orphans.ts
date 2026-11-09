// Keine einzelnen Woerter allein in der letzten Zeile (Ann, 2026-11-09).
// Zusaetzlich zu `text-wrap: pretty` in style.css, das nicht jeder Browser
// kann: die letzten beiden Woerter jedes Textblocks werden mit einem
// geschuetzten Leerzeichen verbunden, brechen also nur gemeinsam um.
// Laeuft am Ende jedes Seiten-Einstiegs (main.ts, event-form.ts, ...),
// nachdem die Inhalte aus content/*.json eingesetzt sind.

const BLOCKS = 'p, h1, h2, h3, dd, li, blockquote'
// Laengere Wortpaare nicht verbinden - sonst koennten sie in schmalen
// Kaesten (Mobile) ueber den Rand ragen.
const MAX_PAIR_LENGTH = 24

const lastTextNode = (el: Element): Text | null => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim()) last = node as Text
  }
  return last
}

export function avoidOrphans(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => {
    // Nur Bloecke mit eigenem Text, nicht Container weiterer Bloecke.
    if (el.querySelector(BLOCKS)) return
    const node = lastTextNode(el)
    if (!node?.textContent) return
    const text = node.textContent.replace(/\s+$/, '')
    const match = text.match(/(\S+) (\S+)$/)
    if (!match || match[0].length > MAX_PAIR_LENGTH) return
    node.textContent =
      text.slice(0, text.length - match[0].length) + `${match[1]} ${match[2]}` + node.textContent.slice(text.length)
  })
}
