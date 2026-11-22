<p align="center"><img src="../brand/logo.svg" alt="Mazono" width="420"></p>

# Mazono — Brand guide

How Mazono looks and sounds, and how to use its logo, colours and words. The files are in
[`brand/`](../brand), drawn by [`brand/build.py`](../brand/build.py), so they stay in step
with each other and with this guide.

## The name

**Mazono** comes from the Greek verb *μαζώνω* (ma-ZO-no), "to gather, to collect". On Crete,
where much of Greece's olive oil is produced, it is the word for harvesting the olive trees,
the same root as *λιομάζωμα*, the olive harvest.

- Written **Mazono**: capital M, the same Latin spelling in every language, so the icon, the
  website and word of mouth all match.
- Pronounced **ma-ZO-no**, stress on the middle syllable.
- Formerly HarvestLog. Internal names (the database, saved settings, the backup format, the
  Docker service and volume) keep that first name, so existing installs lose nothing.

**Story (About screen)**

- English: *Named after μαζώνω (ma-ZO-no), the word olive growers on the Greek island of
  Crete have used for generations for harvesting their olives.*
- Ελληνικά: *Πήρε το όνομά του από το «μαζώνω», τη λέξη που χρησιμοποιούν εδώ και γενιές οι
  ελαιοπαραγωγοί της Κρήτης για το μάζεμα των ελιών.*

## Lines

| Use | English | Ελληνικά |
|---|---|---|
| Tagline (website, store page, welcome screen) | Harvesting olives is hard work. Managing your grove shouldn't be. | Το μάζεμα των ελιών είναι σκληρή δουλειά. Η διαχείριση του ελαιώνα σας δεν χρειάζεται να είναι. |
| Short line (under the logo) | — (use the tagline) | Η ελαιοσυγκομιδή, οργανωμένη. |

Store subtitles are short (30 characters on the App Store): use the short line, or the name
alone.

## Voice

The app's voice, unchanged (see [DESIGN.md](DESIGN.md)): plain words in the grower's
language, warm and practical, no technical terms. Greek first.

- Say **ελαιόλαδο** / **olive oil**; ελιές always in the plural (or *καρπός*).
- Honest about the work: the harvest is hard, the app should not add to it.
- Show the real harvest (hands, nets, crates, sacks, the 17-kilo tin, morning light), not
  the clichés of olive oil packaging (gold foil, script fonts, bottles, framing branches).

## Why ripe olive

Dark green and olive gold is how nearly every olive oil brand looks. Mazono keeps the olive
oil and the green, but its own colour is **ripe olive**: in November and December the olives
turn from green through violet to black, and that is exactly when the harvest happens. It is
the colour of the moment the app is for, and nobody else in the category uses it.

## Logo

<p><img src="../brand/icon.svg" alt="" width="96"> &nbsp; <img src="../brand/logo.svg" alt="Mazono logo" width="360"></p>

**Icon.** A green olive with a big leaf, rising like a sun over a hill of olive oil, with a
grove-green hill behind, on a ripe-olive tile: the grove, the fruit and the oil in one
landscape. No outlines; shapes and colour only. It matches the green hill at the top of the
app's pages.

**Wordmark.** *Mazono* in Comfortaa Bold, turned into outlines (no font needed). The last o
is an olive: as tall as the o, a little narrower and tilted, outlined in the letters' own
stroke weight and colour, and filled **Grove** green. It is always green.

| File | Use |
|---|---|
| `brand/icon.svg` | The app icon, rounded. |
| `brand/icon-full.svg` | Full-bleed square, for phones that round it themselves (Apple). |
| `brand/icon-maskable.svg` | Full-bleed, the olive and leaf a little smaller and lower so a round crop (Android) keeps them. |
| `brand/favicon.svg` | 16–32 px: no surface line, no leaf vein, no shine on the olive. |
| `brand/icon-monochrome.svg` | One colour: the olive, the leaf and the oil hill, a thin gap between hill and olive (print, stamps, Android themed icons). |
| `brand/wordmark.svg` / `wordmark-light.svg` | Ripe-olive letters for light backgrounds / cream letters for dark ones. |
| `brand/wordmark-mono.svg` | One colour: the olive is its outline only. |
| `brand/logo.svg` / `logo-light.svg` | Icon and wordmark side by side. |
| `brand/logo-stacked.svg` / `logo-stacked-light.svg` | Icon above the word: start-up screen, website, print. |
| `brand/png/` | PNG exports (1024, 512, 192, 32, 16). |

**Using the logo**

- Leave space around it at least as wide as the olive.
- Smallest sizes: icon 16 px (use the favicon below 48 px); wordmark 14 px tall.
- On light backgrounds use the ripe-olive letters; on dark ones, cream letters. The olive
  stays green on both.
- In one-colour printing use the one-colour icon and wordmark (the olive becomes its outline).
- Don't recolour the olive (no violet, no orange), stretch, rotate, outline or add shadows.
  Don't put the full-colour icon on busy photos; use the one-colour version there.

## Colours

| Name | Hex | Role |
|---|---|---|
| **Ripe olive** | `#3B2436` | The brand colour: the icon's tile, start-up screen, website buttons, print. |
| **Ink** | `#2A1A26` | Text on light backgrounds. |
| **Olive oil** | `#C2CB55` | The oil in the icon; highlights. |
| **Grove** | `#8A9A5B` | The olive in the icon and the wordmark; secondary green for illustrations. |
| **Hill** | `#DCE5C4` / `#25301C` | The green hill at the top of the app's pages (light / dark theme). |
| **Cream** | `#F6F1E7` | Backgrounds; text on ripe olive. |
| **Canvas** | `#D9C9A3` | The sack cloth: labels, tags, texture, print. |

**In the app** (`app/src/styles.css`) the colours follow the time of day:

| | Light | Dark |
|---|---|---|
| Ground `--bg` / cards `--card` | Cream `#F6F1E7` / white | Night plum `#17111A` / `#221822` |
| Text `--ink` / quiet text `--muted` | Ink `#2A1A26` / `#6F6168` | `#F1E9EE` / `#B3A2AE` |
| Actions `--accent` (buttons, selected, links) | Ripe olive `#3B2436`, cream text | Olive oil `#C2CB55`, ink text |
| Growth `--grow` (progress bars, income, shading) | `#5F7230` | `#A9BD63` |
| The hill `--hill` | `#DCE5C4` | `#25301C` |

Every page (not the first-start screens) opens with a green hill: the page title sits in it,
the small logo at the right end of the same row on phones, and the wavy lower edge falls in
the space before the content, so nothing covers it. The hill grows with the row (a title that
wraps, Oil's year picker); on a page whose title row has its own control (Oil, Journal), the
logo steps aside on phones. The phone's top bar takes the same green. Ripe olive by day and olive
oil by night mark what to press; green marks what is growing. Task colours stay the grower's
own.

**Contrast** (checked; aim for 4.5:1 for text, 3:1 for graphics)

| Pair | Ratio | |
|---|---|---|
| Cream on Ripe olive | 12.5:1 | ✓ text |
| Ink on Cream | 14.6:1 | ✓ text |
| Olive oil on Ripe olive (the leaf and the oil hill in the icon) | 8.0:1 | ✓ graphic and text |
| Grove on Ripe olive | 4.6:1 | ✓ graphic |
| Grove on Cream | 2.7:1 | only as the olive, inside its dark outline; never text |
| White or Cream on Olive oil | 1.6–1.8:1 | ✗ never |
| Ink on Olive oil (dark-theme buttons) | 9.4:1 | ✓ text |
| Olive oil on night card `#221822` | 9.8:1 | ✓ text |
| Muted `#6F6168` on Cream / on the hill | 5.2:1 / 4.5:1 | ✓ text |
| Growth `#5F7230` on white | 5.3:1 | ✓ text |
| Muted `#B3A2AE` on the night hill | 5.7:1 | ✓ text |

On the app's dark theme the ripe tile's edge is subtle (1.3:1); the olive-oil hill and leaf
inside it (8:1) are what make the small icon stand out there.

## Type

- **Wordmark and display** (the logo, website headings, posters, T-shirts): Comfortaa Bold
  (SIL Open Font License). It has Greek: *Η ελαιοσυγκομιδή, οργανωμένη.*
- **App and body text:** the phone's own font (fast, offline, readable in the sun).

## Texture

The canvas of the olive sacks: a fine woven pattern in Canvas tones, for the website and print.
Never behind small text, never on the icon.

## Ideas for later

- **A living icon:** in the app (start-up screen, top bar, the "This year" report) the olive
  could rise over the hill with the season's progress, like a sun through the day. The
  home-screen icon always shows it risen.
- **The ripening palette** (green olive → olive oil → violet → ripe) for charts and field
  progress, so colour carries meaning.

## History

The first logo (November 2026) was an olive-oil drop with a leaf-shaped shine on Mediterranean
blue, with a lowercase wordmark whose o's were olives. It was replaced the next day: blue with a
drop recalled another Greek olive oil brand, and the drop's point beside the lowercase letters
read like an "A", echoing a well-known online shop.

The second icon (November 2026) was a big ripe-olive leaf in olive oil filling two thirds of
the tile. It was replaced a few days later by the olive over the hill, together with the
app's new colours, so the icon and the screens tell the same story.

## Rebuilding the files

```sh
npm pack @fontsource/comfortaa@5 && tar xzf fontsource-comfortaa-*.tgz
python3 brand/build.py package/files/comfortaa-latin-700-normal.woff2
```

Needs Python 3 with `fonttools` and `brotli`, and `rsvg-convert`. It writes `brand/` and the
icons the app serves in `app/public/`.
