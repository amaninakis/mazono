#!/usr/bin/env python3
"""
Builds the Mazono brand files: icons, the wordmark and the logo (SVG), and the PNGs the
app and the phones need. Everything is drawn here from a few shapes, so the files stay in
step with each other and with docs/BRAND.md.

    python3 brand/build.py path/to/comfortaa-latin-700-normal.woff2

The font is Comfortaa Bold (SIL Open Font License), for example from the npm package
@fontsource/comfortaa. Its letters are turned into outlines, so the wordmark needs no font.
Needs: Python 3 with fontTools and brotli, and rsvg-convert (librsvg) for the PNGs.
"""

import math
import subprocess
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parent / 'app' / 'public'
PNG = ROOT / 'png'

# The palette (see docs/BRAND.md).
RIPE = '#3B2436'  # ripe olive: the brand colour
INK = '#2A1A26'  # ripe olive, darkest: text on light backgrounds
OIL = '#C2CB55'  # olive oil
SURFACE = '#E6EBB0'  # the light line on the oil's surface
GROVE = '#8A9A5B'  # the olive in the wordmark
SHINE = '#F2F5D6'
CREAM = '#F6F1E7'  # text on dark backgrounds, light backgrounds

# The mark, on a 130 × 130 grid: olive oil filling two thirds of the tile, its surface a
# gentle wave, and a big olive leaf in it.
WAVE = 'M0 43Q33 33 65 43T130 43'
OIL_FILL = WAVE + 'V130H0Z'
LEAF = 'M24 120Q28 64 104 52Q98 114 24 120Z'
VEIN = 'M30 114Q62 88 100 56'
# One colour: the oil as a single shape with the leaf cut out of it.
MONO = 'M8 43Q36 33 65 43T122 43V108Q122 122 108 122H22Q8 122 8 108Z ' + LEAF


def svg(width, height, body, view=None, label='Mazono'):
    view = view or f'0 0 {width} {height}'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{view}" role="img" aria-label="{label}">\n{body}\n</svg>\n'
    )


def mark(small=False, inset=False, clip='tile'):
    """The oil and the leaf. `small` drops the surface line and the vein (16–32 px);
    `inset` shrinks the leaf into the safe circle of phones that crop icons round."""
    line = '' if small else f'<path d="{WAVE}" fill="none" stroke="{SURFACE}" stroke-width="3"/>'
    vein = '' if small else f'<path d="{VEIN}" fill="none" stroke="{OIL}" stroke-width="2.2"/>'
    leaf = f'<path d="{LEAF}" fill="{RIPE}"/>{vein}'
    if inset:
        leaf = f'<g transform="translate(65 65) scale(0.74) translate(-65 -70)">{leaf}</g>'
    return f'<g clip-path="url(#{clip})"><path d="{OIL_FILL}" fill="{OIL}"/>{line}</g>{leaf}'


def tile(rounded=True, small=False, inset=False, clip='tile'):
    shape = '<rect width="130" height="130" rx="28"/>' if rounded else '<rect width="130" height="130"/>'
    return (
        f'<defs><clipPath id="{clip}">{shape}</clipPath></defs>'
        f'<g clip-path="url(#{clip})"><rect width="130" height="130" fill="{RIPE}"/></g>'
        f'{mark(small, inset, clip)}'
    )


def icon(rounded=True, small=False, inset=False):
    """The app icon. Rounded for browsers and the logo; full-bleed for phones that cut
    their own shape (Apple; Android "maskable", with the leaf inside the safe circle)."""
    return svg(512, 512, tile(rounded, small, inset), '0 0 130 130')


def monochrome(fill=RIPE):
    return svg(512, 512, f'<path d="{MONO}" fill="{fill}" fill-rule="evenodd"/>', '0 0 130 130')


class Wordmark:
    """'Mazono' in Comfortaa Bold outlines. The last o is an olive: as tall as the o, a
    little narrower and tilted, outlined in the letters' own stroke weight and colour."""

    def __init__(self, font_path):
        self.font = TTFont(font_path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.cap = self.font['OS/2'].sCapHeight
        # Comfortaa's strokes are even: the capital I is exactly one stroke wide.
        i_min, _, i_max, _ = self.bounds('I')
        self.stroke = i_max - i_min

    def bounds(self, char):
        pen = BoundsPen(self.glyphs)
        self.glyphs[self.cmap[ord(char)]].draw(pen)
        return pen.bounds

    def letter(self, char, x):
        name = self.cmap[ord(char)]
        pen = SVGPathPen(self.glyphs)
        # Font units point up; SVG points down.
        self.glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        return pen.getCommands(), self.font['hmtx'][name][0]

    def olive(self, x, ink, fill):
        x_min, y_min, x_max, y_max = self.bounds('o')
        cx, cy = x + (x_min + x_max) / 2, -(y_min + y_max) / 2
        tilt = math.radians(16)
        # Outer edge as tall as the o; 0.88 as wide as tall, like an olive.
        outer_ry = (y_max - y_min) / 2 / math.hypot(math.cos(tilt), 0.88 * math.sin(tilt))
        outer_rx = 0.88 * outer_ry
        rx, ry = outer_rx - self.stroke / 2, outer_ry - self.stroke / 2
        rotate = f'rotate(-16 {cx:.1f} {cy:.1f})'
        body = (
            f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}" '
            f'stroke="{ink}" stroke-width="{self.stroke:.0f}" transform="{rotate}"/>'
        )
        if fill == 'none':
            return body
        sx, sy = cx - 0.32 * rx, cy - 0.36 * ry
        return body + (
            f'<ellipse cx="{sx:.1f}" cy="{sy:.1f}" rx="{0.17 * rx:.1f}" ry="{0.26 * ry:.1f}" '
            f'fill="{SHINE}" opacity="0.85" transform="{rotate}"/>'
        )

    def build(self, ink, fill=GROVE):
        """The word's SVG body and its box (left, top, width, height) in font units."""
        x, letters, olive = 0.0, [], ''
        for i, char in enumerate('Mazono'):
            if i == 5:
                olive = self.olive(x, ink, fill)
                x += self.font['hmtx'][self.cmap[ord('o')]][0]
            else:
                path, advance = self.letter(char, x)
                letters.append(path)
                x += advance
        pad = 30
        box = (-pad, -(self.cap + pad), x + 2 * pad, self.cap + 2 * pad + 20)
        return f'<path d="{" ".join(letters)}" fill="{ink}"/>{olive}', box


def view(box):
    return ' '.join(f'{value:.0f}' for value in box)


def wordmark(word, ink, fill=GROVE):
    body, box = word.build(ink, fill)
    return svg(round(box[2] / 4), round(box[3] / 4), body, view(box))


def logo(word, ink, stacked=False):
    """The icon and the word. Side by side: the icon 1.35 × the capital height, centred on
    the capitals. Stacked: the icon above, the word centred under it."""
    body, (left, top, width, height) = word.build(ink)
    if stacked:
        size = 2.2 * word.cap
        icon_x = left + width / 2 - size / 2
        icon_y = top - 0.35 * word.cap - size
        box = (left, icon_y - 30, width, top + height - icon_y + 30)
    else:
        size = 1.35 * word.cap
        gap = 0.4 * word.cap
        icon_x = left - gap - size
        icon_y = -word.cap / 2 - size / 2
        box_top = min(top, icon_y - 30)
        box_bottom = max(top + height, icon_y + size + 30)
        box = (icon_x - 30, box_top, left + width - icon_x + 30, box_bottom - box_top)
    clip = 'logo-tile'
    placed = f'<g transform="translate({icon_x:.1f} {icon_y:.1f}) scale({size / 130:.4f})">{tile(clip=clip)}</g>'
    return svg(round(box[2] / 4), round(box[3] / 4), placed + body, view(box))


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    print('wrote', path.relative_to(ROOT.parent))


def png(source, target, size):
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', str(target), str(source)], check=True)
    print('wrote', target.relative_to(ROOT.parent))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    word = Wordmark(sys.argv[1])

    files = {
        'icon.svg': icon(),
        'icon-full.svg': icon(rounded=False),
        'icon-maskable.svg': icon(rounded=False, inset=True),
        'favicon.svg': icon(small=True),
        'icon-monochrome.svg': monochrome(),
        'wordmark.svg': wordmark(word, INK),
        'wordmark-light.svg': wordmark(word, CREAM),
        'wordmark-mono.svg': wordmark(word, RIPE, fill='none'),
        'logo.svg': logo(word, INK),
        'logo-light.svg': logo(word, CREAM),
        'logo-stacked.svg': logo(word, INK, stacked=True),
        'logo-stacked-light.svg': logo(word, CREAM, stacked=True),
    }
    for name, text in files.items():
        write(ROOT / name, text)

    # What the app serves (see app/vite.config.ts, app/index.html and ui/AppLogo.vue).
    for name in ('icon.svg', 'favicon.svg', 'wordmark.svg', 'wordmark-light.svg'):
        write(PUBLIC / name, files[name])
    png(ROOT / 'icon.svg', PUBLIC / 'icon-192.png', 192)
    png(ROOT / 'icon.svg', PUBLIC / 'icon-512.png', 512)
    png(ROOT / 'icon-maskable.svg', PUBLIC / 'maskable-512.png', 512)
    png(ROOT / 'icon-full.svg', PUBLIC / 'apple-touch-icon.png', 180)
    black = ROOT / 'monochrome-black.tmp.svg'
    write(black, monochrome('#000000'))
    png(black, PUBLIC / 'monochrome-512.png', 512)
    black.unlink()

    # The same, kept with the brand for other uses (store, website, print).
    for name, size in (('icon', 1024), ('icon', 512), ('icon', 192), ('icon-full', 1024), ('favicon', 32), ('favicon', 16)):
        png(ROOT / f'{name}.svg', PNG / f'{name}-{size}.png', size)


if __name__ == '__main__':
    main()
