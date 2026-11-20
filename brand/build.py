#!/usr/bin/env python3
"""
Builds the Mazono brand files: icons, the wordmark and the logo (SVG), and the PNGs the
app and the phones need. Everything is drawn here from a few shapes, so the files stay in
step with each other and with BRAND.md.

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

# The palette (see BRAND.md).
SKY = '#2A6699'
OIL = '#C2CB55'
GROVE = '#8A9A5B'
CANVAS = '#D9C9A3'
DEEP_OLIVE = '#2B3317'
SHINE = '#F2F5D6'
LIGHT_INK = '#ECEEE4'

# The mark, on a 130 × 130 grid: an olive-oil drop whose shine is an olive leaf.
DROP = 'M65 18C53 44 36 60 36 82A29 29 0 0 0 94 82C94 60 77 44 65 18Z'
LEAF = 'M47 92Q46 70 63 58Q66 80 47 92Z'
VEIN = 'M48 90Q55 76 62 60'
# Fuller and without the vein, for 16–32 px (favicon), where detail turns to a smudge.
SMALL_DROP = 'M65 10C50 40 30 58 30 84A35 35 0 0 0 100 84C100 58 80 40 65 10Z'
SMALL_LEAF = 'M44 96Q42 70 62 56Q66 82 44 96Z'


def svg(width, height, body, view=None, label='Mazono'):
    view = view or f'0 0 {width} {height}'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{view}" role="img" aria-label="{label}">\n{body}\n</svg>\n'
    )


def mark(small=False):
    if small:
        return f'<path d="{SMALL_DROP}" fill="{OIL}"/><path d="{SMALL_LEAF}" fill="{SHINE}"/>'
    return (
        f'<path d="{DROP}" fill="{OIL}"/><path d="{LEAF}" fill="{SHINE}"/>'
        f'<path d="{VEIN}" fill="none" stroke="{OIL}" stroke-width="1.5"/>'
    )


def icon(rounded=True, small=False):
    """The app icon. Rounded for browsers and the logo; full-bleed square for phones that
    cut their own shape (Android maskable, Apple), whose safe circle the drop stays inside."""
    corner = ' rx="28"' if rounded else ''
    return svg(512, 512, f'<rect width="130" height="130"{corner} fill="{SKY}"/>{mark(small)}', '0 0 130 130')


def monochrome(fill=DEEP_OLIVE):
    """One colour on transparent: the leaf is cut out of the drop."""
    return svg(512, 512, f'<path d="{DROP} {LEAF}" fill="{fill}" fill-rule="evenodd"/>', '0 0 130 130')


class Wordmark:
    """'mazono' in Comfortaa Bold outlines, with both o's drawn as grove-green olives."""

    def __init__(self, font_path):
        self.font = TTFont(font_path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.ex = self.font['OS/2'].sxHeight
        self.em = self.font['head'].unitsPerEm

    def letter(self, char, x):
        name = self.cmap[ord(char)]
        pen = SVGPathPen(self.glyphs)
        # Font units point up; SVG points down.
        self.glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        bounds = BoundsPen(self.glyphs)
        self.glyphs[name].draw(bounds)
        return pen.getCommands(), self.font['hmtx'][name][0], bounds.bounds

    def olive(self, x):
        """An olive tilted -16°, as tall as the letters and dipping below the baseline by the
        same small overshoot as a round letter, so it sits on the line like an 'o'."""
        tilt = math.radians(16)
        ry = 0.5 * 1.0 * self.ex / math.hypot(math.cos(tilt), 0.74 * math.sin(tilt))
        rx = 0.74 * ry
        half_height = math.hypot(ry * math.cos(tilt), rx * math.sin(tilt))
        half_width = math.hypot(rx * math.cos(tilt), ry * math.sin(tilt))
        overshoot = 0.012 * self.em
        advance = 2 * half_width + 0.11 * self.em
        cx, cy = x + advance / 2, overshoot - half_height
        sx, sy = cx - 0.3 * rx, cy - 0.38 * ry
        body = (
            f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{GROVE}" '
            f'transform="rotate(-16 {cx:.1f} {cy:.1f})"/>'
        )
        shine = (
            f'<ellipse cx="{sx:.1f}" cy="{sy:.1f}" rx="{0.24 * rx:.1f}" ry="{0.31 * ry:.1f}" '
            f'fill="{SHINE}" opacity="0.7" transform="rotate(-16 {sx:.1f} {sy:.1f})"/>'
        )
        return body + shine, advance, half_height - overshoot + half_height

    def build(self, ink):
        x, letters, olives, top = 0.0, [], [], 0.0
        for char in 'mazono':
            if char == 'o':
                drawn, advance, height = self.olive(x)
                olives.append(drawn)
                top = max(top, height)
            else:
                path, advance, bounds = self.letter(char, x)
                letters.append(path)
                top = max(top, bounds[3])
            x += advance
        pad = 20
        view = f'{-pad} {-(top + pad):.0f} {x + 2 * pad:.0f} {top + 2 * pad:.0f}'
        body = f'<path d="{" ".join(letters)}" fill="{ink}"/>' + ''.join(olives)
        return body, view, x + 2 * pad, top + 2 * pad


def logo(word, ink, rounded=True):
    """The icon beside the wordmark: the icon is 1.9 × the x-height, centred on the letters."""
    body, view, width, height = word.build(ink)
    left, top = (float(value) for value in view.split()[:2])
    size = 1.9 * word.ex
    gap = 0.45 * word.ex
    icon_y = -word.ex / 2 - size / 2
    corner = 28 if rounded else 0
    tile = (
        f'<g transform="translate({left - size - gap:.1f} {icon_y:.1f}) scale({size / 130:.4f})">'
        f'<rect width="130" height="130" rx="{corner}" fill="{SKY}"/>{mark()}</g>'
    )
    min_y = min(top, icon_y - 20)
    max_y = max(top + height, icon_y + size + 20)
    min_x = left - size - gap - 20
    full = f'{min_x:.0f} {min_y:.0f} {left + width - min_x:.0f} {max_y - min_y:.0f}'
    w, h = (float(value) for value in full.split()[2:])
    return svg(round(w / 4), round(h / 4), tile + body, full)


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

    write(ROOT / 'icon.svg', icon())
    write(ROOT / 'icon-full.svg', icon(rounded=False))
    write(ROOT / 'favicon.svg', icon(small=True))
    write(ROOT / 'icon-monochrome.svg', monochrome())
    for name, ink in (('wordmark', DEEP_OLIVE), ('wordmark-light', LIGHT_INK)):
        body, view, width, height = word.build(ink)
        write(ROOT / f'{name}.svg', svg(round(width / 4), round(height / 4), body, view))
    write(ROOT / 'logo.svg', logo(word, DEEP_OLIVE))
    write(ROOT / 'logo-light.svg', logo(word, LIGHT_INK))

    # What the app serves (see app/vite.config.ts and app/index.html).
    write(PUBLIC / 'icon.svg', icon())
    write(PUBLIC / 'favicon.svg', icon(small=True))
    for name, ink in (('wordmark', DEEP_OLIVE), ('wordmark-light', LIGHT_INK)):
        body, view, width, height = word.build(ink)
        write(PUBLIC / f'{name}.svg', svg(round(width / 4), round(height / 4), body, view))
    png(ROOT / 'icon.svg', PUBLIC / 'icon-192.png', 192)
    png(ROOT / 'icon.svg', PUBLIC / 'icon-512.png', 512)
    png(ROOT / 'icon-full.svg', PUBLIC / 'maskable-512.png', 512)
    png(ROOT / 'icon-full.svg', PUBLIC / 'apple-touch-icon.png', 180)
    write(ROOT / 'tmp-mono-black.svg', monochrome('#000000'))
    png(ROOT / 'tmp-mono-black.svg', PUBLIC / 'monochrome-512.png', 512)
    (ROOT / 'tmp-mono-black.svg').unlink()

    # The same, kept with the brand for other uses (store, website, print).
    for name, size in (('icon', 1024), ('icon', 512), ('icon', 192), ('icon-full', 1024), ('favicon', 32), ('favicon', 16)):
        png(ROOT / f'{name}.svg', PNG / f'{name}-{size}.png', size)


if __name__ == '__main__':
    main()
