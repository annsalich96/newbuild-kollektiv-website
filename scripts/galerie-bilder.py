"""Event-Galerie: ausgewaehlte Fotos web-tauglich ins Repo legen und in events.json eintragen.

Aufruf (Originalfotos aus Photos des Events, ohne Wasserzeichen, 20-25 Stueck):
    python3 scripts/galerie-bilder.py <event-slug> <foto1.jpg> <foto2.jpg> ...

Schreibt public/galerie/<slug>/<slug>-01.jpg ... (lange Kante 1600 px, JPEG ohne Metadaten,
deutlich unter dem 4,5-MB-Limit von Pages CMS) und setzt das Feld "gallery" des Events in
src/content/events.json. Vorhandene Bilder des Events werden ersetzt.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
LONG_EDGE = 1600


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    slug, sources = sys.argv[1], [Path(p) for p in sys.argv[2:]]
    events_file = ROOT / 'src/content/events.json'
    data = json.loads(events_file.read_text('utf-8'))
    event = next((e for e in data['events'] if e['slug'] == slug), None)
    if not event:
        sys.exit(f'Kein Event mit Slug "{slug}" in events.json')

    out_dir = ROOT / 'public/galerie' / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.jpg'):
        old.unlink()

    paths = []
    for i, src in enumerate(sources, 1):
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
        name = f'{slug}-{i:02d}.jpg'
        im.save(out_dir / name, 'JPEG', quality=80, optimize=True, progressive=True)
        paths.append(f'/galerie/{slug}/{name}')
        print(f'{name}  {(out_dir / name).stat().st_size // 1024} KB  <- {src.name}')

    event['gallery'] = paths
    events_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
    print(f'{len(paths)} Bilder fuer {slug} eingetragen')


if __name__ == '__main__':
    main()
