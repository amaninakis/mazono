# HarvestLog

> **Harvesting olives is hard work. Keeping track of it shouldn't be.**

Open-source, self-hosted app for olive growers: log field work in seconds, follow olive oil
production season by season, and compare fields and years.

Available in **English** and **Ελληνικά**. Works offline on your phone as an installable web app (PWA).

> Status: **v0.3 – money**. Reports are coming next (see [Roadmap](#roadmap)).

## What it does

### Money (v0.3)

- **Expenses** with business name (remembered, with its category), amount, category and invoice no.
- **Oil sales**: buyer, kg and € per kg → total. The oil is taken out of stock, by default from the oldest
  season at the mill, and you cannot sell more than you have.
- **Other income** such as subsidies (ΟΠΕΚΕΠΕ) or VAT refunds.
- **Totals** by harvest season or calendar year: oil sales (kg and average price), other income, expenses,
  net result, an optional tax estimate, and the value of the oil still in stock at your last sale price.

### Mill and oil stock (v0.2)

- **Mill extraction form**: olives and oil kg with live yield (1/4.3 or %), acidity, receipt number and mill.
- **Charges kept in oil** (mill fee, bug spraying, VAT, or your own), each shown as % of the oil and
  filled in from your usual % if you set one. Net oil is calculated for you.
- **Where the oil went**: split the net oil between the mill, home or your own places.
- **Harvest days → extraction**: tick the harvest days that went to the mill (pre-ticked since the last
  visit); send only part of a day when needed. Oil is shared between fields in proportion to the olives,
  and kg per unit (e.g. per sack) is learned from your extractions.
- **Oil page**: season totals, every extraction, oil per field (≈) and per tree, and **oil in stock**
  by season and place, with transfers (mill → home) and own use / gifts.

### Field log (v0.1)

- **First-run setup**: language, packaging units (sack, half sack, crate, pallet bin… or your own,
  with an optional approximate weight) and your fields with tree counts.
- **Today screen**: the task for the season is preselected (harvest, pruning, fertilizer,
  weed whacking, or your own task types). The field you worked last is preselected while it still
  has trees left. Steppers with ± buttons, or type the number (comma or dot decimals).
- **Harvest**: trees harvested, trees left in the field, collected units (mix several units,
  0.5 steps). After saving you see units per tree for the day, and the season's yield per harvested
  tree and per tree in the field. Entering trees is optional; the field's tree count is used instead.
- **Journal**: day by day, with a month calendar showing a coloured dot for each task type.
  Tap an entry to edit it; delete with undo.
- **Settings**: fields, units, task types (colour, icon, suggested months), season start month,
  optional labour tracking, JSON backup export / restore.
- Data is stored on the device (IndexedDB) and the app works without signal.

## Run it

### With Docker (home lab or server)

```bash
git clone https://github.com/amaninakis/olive-harvest.git
cd olive-harvest
docker compose up -d --build
```

The app is now on port **8080**. Browsers only allow offline mode and "Install app" over HTTPS, so:

- **Home lab with Tailscale** (nothing opened to the internet):
  `tailscale serve --bg 8080` → open `https://<machine-name>.<tailnet>.ts.net` on your phone.
- **Public server with a domain**: point the domain's DNS to the server, then in
  `docker-compose.yml` set `SITE_ADDRESS: harvest.example.com` and use ports `80:80` and `443:443`.
  Caddy gets an HTTPS certificate automatically.

Hardware needs are tiny: any Raspberry Pi 3/4/5, NAS or the smallest VPS is enough.

### For development

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in app/dist
```

## Design and contributing

- [docs/DESIGN.md](docs/DESIGN.md) — what the app should become, the data model, every screen,
  decisions taken and the roadmap. Start here before proposing a feature.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to prepare a pull request.

## Project layout

```
app/                 the web app (Vue 3 + TypeScript + Vite)
  src/core/          business logic, no UI (seasons, field progress, defaults) + tests
  src/db/            local database (Dexie / IndexedDB), multi-farm from the start
  src/i18n/locales/  translation files (en.json, el.json)
  src/screens/       Setup, Today, Journal, Settings (Vue single-file components)
  src/ui/            shared components (Stepper, Toggle, Modal, Toast) and farm state
deploy/Caddyfile     web server config used by the Docker image
```

## Translating

1. Copy `app/src/i18n/locales/en.json` to `app/src/i18n/locales/<code>.json` (e.g. `de.json`).
2. Translate the values (keep the keys and the `{{placeholders}}`).
3. Register the language in `app/src/i18n/index.ts`.

A test checks that every language has the same keys as English.

## Roadmap

1. **v0.1 – Field log** ✅
2. **v0.2 – Mill and stock** ✅: extractions, yield (1/x or %), oil charges (mill fee, bug spraying,
   VAT…), linking harvest days to extractions (with splits), oil stock by season and location
3. **v0.3 – Money** ✅: expenses, oil sales, subsidies and other income, totals by season or calendar year
4. **v0.4 – Reports**: field × season comparison, season totals, yield through the season, economics
5. **v0.5 – Self-hosting**: sync server, login, multiple farms and users with roles, backups
6. **v1.0+**: Android/iOS apps (Capacitor), daily reminders, location-aware default field,
   equipment log, tasks per tree (numbered or NFC-tagged trees), weather integration, labour reports, spreadsheet import

## Licence

[MIT](LICENSE)
