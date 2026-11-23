# Contributing to Mazono

Thanks for helping! Bug reports, translations and pull requests are all welcome.

1. **Read the [design document](docs/DESIGN.md)** first. It explains what the app should do,
   the roadmap, and the design rules every change should follow.
2. **For bigger changes, open an issue first** describing what you want to build, so we can agree
   on the approach before you spend time on it.
3. **Keep pull requests focused**: one feature or fix per pull request.
4. **Accept the [Contributor Licence Agreement](CLA.md)** in your first pull request: a bot asks you to
   comment with one sentence. You keep the copyright in your work; you allow the project to use it
   under the AGPL and under other licences (for paid plans and app stores). If part of your pull
   request comes from somewhere else, say where and under which licence.

Mazono is licensed under the [GNU AGPL-3.0-or-later](LICENSE). The name and logo are not; see
[TRADEMARKS.md](TRADEMARKS.md).

## Before you open a pull request

```bash
cd app
npm install        # also installs the pre-commit hook
npm run lint       # must report 0 problems (warnings count too)
npm run server     # optional: the sync server on port 8787, for npm run dev
npm run typecheck
npm test
npm run build
```

## Code style

The code follows [`@maninak/eslint-config`](https://github.com/maninak/eslint-config) (ESLint + Prettier,
configured in `app/eslint.config.mjs`). In short: no semicolons, single quotes, 2-space indent, descriptive
names (no one-letter names except `i`, `j`, `x`, `y`, `z`, `_`), function declarations instead of arrow
constants, no nested ternaries, explicit `public`/`private` in classes, multi-word component names.

- `npm run lint -- --fix` fixes most problems automatically.
- A pre-commit hook (simple-git-hooks + lint-staged) lints and fixes the files you commit.
- CI fails if `npm run lint` reports any problem.
- In VS Code, install the recommended extensions; the workspace settings fix files on save.

- Put business logic in `app/src/core/` with unit tests.
- Add every new user-facing text to both `en.json` and `el.json` (a test checks they match).
  If you don't speak Greek, add the English text to `el.json` too and mention it in the pull request.
- Make sure the app still works offline and on a phone-sized screen.
- Remember that many users are not technical: use plain words and give every choice a sensible default.

## Translations

See [Translating](README.md#translating) in the README.

Greek terms used in the app (keep them consistent):

| English | Greek |
|---|---|
| mill (olive mill) | ελαιοτριβείο |
| mill extraction / production run | παραγωγή |
| farming year (the code's "season") | χρονιά |
| harvest | μάζεμα |
| net oil | καθαρό λάδι |
