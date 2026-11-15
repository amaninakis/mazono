# Contributing to HarvestLog

Thanks for helping! Bug reports, translations and pull requests are all welcome.

1. **Read the [design document](docs/DESIGN.md)** first. It explains what the app should do,
   the roadmap, and the design rules every change should follow.
2. **For bigger changes, open an issue first** describing what you want to build, so we can agree
   on the approach before you spend time on it.
3. **Keep pull requests focused**: one feature or fix per pull request.

## Before you open a pull request

```bash
cd app
npm install
npm run typecheck
npm test
npm run build
```

- Put business logic in `app/src/core/` with unit tests.
- Add every new user-facing text to both `en.json` and `el.json` (a test checks they match).
  If you don't speak Greek, add the English text to `el.json` too and mention it in the pull request.
- Make sure the app still works offline and on a phone-sized screen.
- Remember that many users are not technical: use plain words and give every choice a sensible default.

## Translations

See [Translating](README.md#translating) in the README.
