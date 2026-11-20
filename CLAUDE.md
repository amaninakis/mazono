# Working on Mazono

Read `docs/DESIGN.md` (what to build and why) and `CONTRIBUTING.md` before changing code.

## Code rules (always)

- All code must comply with `@maninak/eslint-config` (`app/eslint.config.mjs`). Before every commit, in `app/`:
  `npm run lint` (0 problems, warnings included), `npm run typecheck`, `npm test`, `npm run build`.
  Use `npm run lint -- --fix` first; fix the rest by hand. Do not disable rules or add `eslint-disable`
  comments to get around them.
- Names: descriptive; one-letter names only `i`, `j`, `x`, `y`, `z`, `_`. Translations: `$t()` in templates,
  `const { t: translate } = useTranslation()` in scripts.
- Function declarations, not arrow-function constants. No nested ternaries (use lookups or `if`).
- Components have multi-word names (`TodayPage.vue`, `NumberStepper.vue`); import `RouterLink`/`RouterView`.
- Business logic goes in `app/src/core/` with unit tests. Every user-facing string goes in both
  `en.json` and `el.json`.
- Users are not technical: plain words, sensible defaults, easy undo (see `docs/DESIGN.md`).
