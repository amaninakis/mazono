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
GROVE = '#8A9A5B'  # the olive in the icon and the wordmark
SHINE = '#F2F5D6'
CREAM = '#F6F1E7'  # text on dark backgrounds, light backgrounds

# The mark, on a 130 × 130 grid: a green olive with a big leaf, resting in the dip of a
# wavy sea of olive oil that rises on both sides of it, and a longer, darker wave behind
# that climbs to the right. No outlines: shapes and colour only.
OLIVE = (65, 58, 22, 28)  # cx, cy, rx, ry, tilted −16°
LEAF = 'M71 32Q80 4 118 6Q110 40 71 32Z'
VEIN = 'M76 30Q94 18 114 8'
# The olive and its leaf, lowered into the dip and leaning over to the left.
FRUIT = 'translate(0 12) rotate(-17 65 58)'
# Both waves are sine waves drawn as smooth curves (within 0.01 of the true wave):
# the oil: middle 87, height 8, length 130, crest at x 12 (its dip lies under the olive);
# behind: middle 78, height 9, length 176, crest at x −44.
HILL = '#67654A'  # grove green at 55 % over ripe olive
BACK_HILL = 'M0 78.00C5.42 79.74 10.83 81.48 16.25 82.93C21.67 84.39 27.08 85.56 32.50 86.25C37.92 86.95 43.33 87.16 48.75 86.87C54.17 86.58 59.58 85.77 65.00 84.59C70.42 83.40 75.83 81.84 81.25 80.15C86.67 78.46 92.08 76.65 97.50 75.01C102.92 73.36 108.33 71.90 113.75 70.84C119.17 69.79 124.58 69.15 130.00 69.02V130H0Z'
CREST = 'M0 80.31C5.42 79.16 10.83 78.74 16.25 79.17C21.67 79.60 27.08 80.86 32.50 82.62C37.92 84.37 43.33 86.58 48.75 88.63C54.17 90.68 59.58 92.54 65.00 93.69C70.42 94.84 75.83 95.26 81.25 94.83C86.67 94.40 92.08 93.14 97.50 91.38C102.92 89.63 108.33 87.42 113.75 85.37C119.17 83.32 124.58 81.46 130.00 80.31'
OIL_HILL = CREST + 'V130H0Z'


def svg(width, height, body, view=None, label='Mazono'):
    view = view or f'0 0 {width} {height}'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{view}" role="img" aria-label="{label}">\n{body}\n</svg>\n'
    )


def olive(small=False, fill=GROVE):
    cx, cy, rx, ry = OLIVE
    rotate = f'rotate(-16 {cx} {cy})'
    body = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" transform="{rotate}"/>'
    if small or fill != GROVE:
        return body
    return body + (
        f'<ellipse cx="{cx - 0.38 * rx:.1f}" cy="{cy - 0.38 * ry:.1f}" rx="{0.16 * rx:.1f}" '
        f'ry="{0.22 * ry:.1f}" fill="{SHINE}" opacity="0.3" transform="{rotate}"/>'
    )


def fruit(small=False, inset=False):
    """The olive and its leaf. `inset` sinks them a little behind the hill so they fit the
    safe circle of phones that crop icons round."""
    vein = '' if small else f'<path d="{VEIN}" fill="none" stroke="{RIPE}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>'
    body = f'<g transform="{FRUIT}">{olive(small)}<path d="{LEAF}" fill="{OIL}"/>{vein}</g>'
    if inset:
        body = f'<g transform="translate(65 88) scale(0.82) translate(-65 -88)">{body}</g>'
    return body


def mark(small=False, inset=False, clip='tile'):
    """The wave behind, the olive and leaf, and the oil in front. `small` drops the oil's
    surface line, the vein and the shine (16–32 px)."""
    line = '' if small else f'<path d="{CREST}" fill="none" stroke="{SURFACE}" stroke-width="3"/>'
    return (
        f'<g clip-path="url(#{clip})"><path d="{BACK_HILL}" fill="{HILL}"/>{fruit(small, inset)}'
        f'<path d="{OIL_HILL}" fill="{OIL}"/>{line}</g>'
    )


def tile(rounded=True, small=False, inset=False, clip='tile'):
    shape = '<rect width="130" height="130" rx="28"/>' if rounded else '<rect width="130" height="130"/>'
    return (
        f'<defs><clipPath id="{clip}">{shape}</clipPath></defs>'
        f'<g clip-path="url(#{clip})"><rect width="130" height="130" fill="{RIPE}"/></g>'
        f'{mark(small, inset, clip)}'
    )


def icon(rounded=True, small=False, inset=False):
    """The app icon. Rounded for browsers and the logo; full-bleed for phones that cut
    their own shape (Apple; Android "maskable", with the olive inside the safe circle)."""
    return svg(512, 512, tile(rounded, small, inset), '0 0 130 130')


def monochrome(fill=RIPE):
    """One colour, for Android's themed icons: the olive, the leaf and the oil hill, with a
    thin gap where the hill passes in front of the olive."""
    cx, cy, rx, ry = OLIVE
    shapes = (
        f'<g transform="translate(65 88) scale(0.82) translate(-65 -88)"><g transform="{FRUIT}">'
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate(-16 {cx} {cy})"/>'
        f'<path d="{LEAF}"/></g></g><path d="{OIL_HILL}"/>'
    )
    body = (
        '<defs><clipPath id="safe"><rect x="8" y="8" width="114" height="114" rx="14"/></clipPath>'
        '<mask id="gap"><rect width="130" height="130" fill="#fff"/>'
        f'<path d="{CREST}" fill="none" stroke="#000" stroke-width="7"/></mask></defs>'
        f'<g clip-path="url(#safe)" mask="url(#gap)" fill="{fill}">{shapes}</g>'
    )
    return svg(512, 512, body, '0 0 130 130')


class Wordmark:
    """'Mazono' in Comfortaa Bold outlines. The stressed o (ma-ZO-no) is an olive: the
    typeface's own o, filled grove green with a light shine, so it still reads as a letter.
    An olive leaf in the letters' colour sits over it as its accent (the Greek tonos, ό),
    which also shows other readers where the stress falls."""

    OLIVE_INDEX = 3  # the o in "Maz-o-no"
    # The leaf, from its foot, before turning: full and soft, like Comfortaa's shapes.
    LEAF = 'M0 0C73 -49 61 -194 0 -270C-61 -194 -73 -49 0 0Z'
    # Where its foot sits from the o's origin, and how far it leans to the right. Close to
    # Comfortaa's own tonos on ό, a little nearer the o and leaning a little more.
    LEAF_FOOT = (360, -574)
    LEAF_LEAN = 34

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
        """The green inside the o's ring, its shine, and the leaf above it."""
        x_min, y_min, x_max, y_max = self.bounds('o')
        cx, cy = x + (x_min + x_max) / 2, -(y_min + y_max) / 2
        radius = (y_max - y_min) / 2 - self.stroke / 2
        foot_x, foot_y = self.LEAF_FOOT
        leaf = (
            f'<path d="{self.LEAF}" fill="{ink}" '
            f'transform="translate({x + foot_x:.0f} {foot_y}) rotate({self.LEAF_LEAN})"/>'
        )
        if fill == 'none':
            return '', leaf
        rotate = f'rotate(-16 {cx:.1f} {cy:.1f})'
        inside = (
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{radius:.1f}" fill="{fill}"/>'
            f'<ellipse cx="{cx - 0.34 * radius:.1f}" cy="{cy - 0.36 * radius:.1f}" '
            f'rx="{0.16 * radius:.1f}" ry="{0.24 * radius:.1f}" fill="{SHINE}" opacity="0.85" '
            f'transform="{rotate}"/>'
        )
        return inside, leaf

    def build(self, ink, fill=GROVE):
        """The word's SVG body and its box (left, top, width, height) in font units."""
        x, letters, inside, leaf = 0.0, [], '', ''
        for i, char in enumerate('Mazono'):
            if i == self.OLIVE_INDEX:
                inside, leaf = self.olive(x, ink, fill)
            path, advance = self.letter(char, x)
            letters.append(path)
            x += advance
        pad = 30
        top = self.cap + 70  # the leaf rises a little above the capitals
        box = (-pad, -(top + pad), x + 2 * pad, top + 2 * pad + 20)
        return f'{inside}<path d="{" ".join(letters)}" fill="{ink}"/>{leaf}', box


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
