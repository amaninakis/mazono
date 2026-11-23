<p align="center"><img src="brand/logo.svg" alt="Mazono" width="420"></p>

# Mazono

> **Harvesting olives is hard work. Managing your grove shouldn't be.**

Named after *μαζώνω* (ma-ZO-no), the word olive growers on the Greek island of Crete have used
for generations for harvesting their olives. (Formerly HarvestLog; see [the brand guide](docs/BRAND.md).)

Open-source, self-hosted app for olive growers: log field work in seconds, follow olive oil
production season by season, and compare fields and years.

Available in **English** and **Ελληνικά**. Works offline on your phone as an installable web app (PWA).

> Status: **v0.5b – people and permissions**. Next: Android/iOS apps and more (see [Roadmap](#roadmap)).

## What it does

### People and permissions (v0.5b)

- Administrators add people in **Settings → People** with a temporary password (type your own
  or press *Suggest*). At their first sign-in they choose their own password.
- Choose what each person may **see** or **change**: Work (Today, Journal), Oil, Money, Reports and
  Settings, or pick a ready-made set: **Worker**, **Family** or **Accountant**.
- The server checks every change, and data someone may not see never reaches their phone.
- The Journal shows **who logged** each entry. Give a new temporary password or remove someone
  at any time; what they logged stays.
- The installation owner can also create someone who **starts their own grove**.
- The owner sees **every account on the server** (without other people's data) and can give
  anyone a new temporary password or delete an account.

### Server, sign-in and sync (v0.5a)

- Run the server once (Docker) and every phone or computer signs in to the same data.
- The **first account** is the administrator. The data already on that phone is uploaded.
- Phones keep working **without signal**; changes are sent when they are back online, and
  arrive on the other devices within a minute (or with "Sync now" in Settings).
- If two phones change the same record, the newer change wins (phone clocks that are off are
  corrected by the server).
- Stay signed in for 90 days of not using the app; the phone's password manager can remember
  the password. Wrong passwords are slowed down after 10 tries.
- The server keeps **14 daily backups** of its database.

Work is grouped by **farming year**: from the spring work (1 March) to the end of the harvest and
the last mill visit (February), named by its year. Money is counted per calendar year.

### Reports (v0.4)

- **Fields by year**: olives collected, oil, olives per tree or oil per tree for every field and year,
  with the unit named above the table, shaded so good and poor years (alternate bearing) stand out.
- **Years side by side**: olives, oil, oil after charges or yield per year as a labelled bar chart,
  with the same figures in a table.
- **Yield through the year**: the yield of each mill visit by date, for up to three chosen years,
  to help decide when to harvest.
- **Records**: all-time bests (best year, best field, biggest harvest day, lowest acidity, best price…),
  milestone badges with progress, and lifetime totals.
- **Cost of your oil**: per calendar year, income, expenses and net result set against the oil of the
  same year, giving the cost per kg and the break-even price.
- **CSV export** of every report, ready for Excel (Greek or English number style).

### Money (v0.3)

- **Expenses** with business name (remembered, with its category), amount, category and invoice no.
- **Oil sales**: buyer, kg and € per kg → total, with an optional fee (% or €, remembered per buyer). The oil is taken out of stock, by default from the oldest
  season at the mill, and you cannot sell more than you have.
- **Other income** such as subsidies (ΟΠΕΚΕΠΕ) or VAT refunds.
- **Totals** by calendar year: oil sales (kg and average price), other income, expenses,
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

- **First-run setup**: language, collection units (sack, half sack, crate, pallet bin… or your own,
  with an optional approximate weight) and your fields with tree counts.
- **Today screen**: the task for the season is preselected (harvest, pruning, fertilizer,
  weed whacking, or your own task types). The field you worked last is preselected while it still
  has trees left. Steppers with ± buttons, or type the number (comma or dot decimals).
- **Harvest**: trees harvested, trees left in the field, collected units (mix several units,
  0.5 steps). After saving you see units per tree for the day, and the season's yield per harvested
  tree and per tree in the field. Entering trees is optional; the field's tree count is used instead.
- **Journal**: day by day, with a month calendar showing a coloured dot for each task type.
  Tap an entry to edit it; delete with undo.
- **Settings**: fields, units, task types (colour, icon, suggested months), farming year start (March),
  optional labour tracking, JSON backup export / restore.
- Data is stored on the device (IndexedDB) and the app works without signal.

## Run it

### With Docker (home lab or server)

```bash
git clone https://github.com/amaninakis/olive-harvest.git
cd olive-harvest
docker compose up -d --build
```

The app is now on port **8080**. Open it and create the administrator account. Browsers only
allow offline mode, "Install app" and secure sign-in over HTTPS, so:

- **Home lab with Tailscale** (nothing opened to the internet):
  `tailscale serve --bg 8080` → open `https://<machine-name>.<tailnet>.ts.net` on your phone.
- **Public server with a domain**: point the domain's DNS to the server, then
  `SITE_ADDRESS=harvest.example.com docker compose --profile https up -d --build`.
  Caddy runs in front and gets an HTTPS certificate automatically.

Data lives in the `harvestlog_data` Docker volume (the Docker names keep the app's first name, so
existing installs keep their data) (`/data` in the container): the database
`harvestlog.db` and the last 14 daily copies in `backups/`. To back up elsewhere, copy the newest
file from `backups/`.

**Upgrading from v0.4 or earlier** (app only, no server): run `docker compose up -d --build`
again and open the app on the phone that has your data. It asks you to create the administrator
account, then uploads everything that phone holds.

Hardware needs are tiny: any Raspberry Pi 3/4/5, NAS or the smallest VPS is enough.

### For development

```bash
cd app
npm install
npm run server   # the sync server on port 8787 (data in app/data)
npm run dev      # http://localhost:5173 (talks to the server above, or works on its own)
npm run lint     # ESLint + Prettier (@maninak/eslint-config), must be clean
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
  src/sync/          sign-in and sync with the server (api, sync engine, account state)
app/server/          the server: Fastify + SQLite (Node's built-in), accounts, sync, backups
deploy/Caddyfile     optional HTTPS front for a public server (docker compose --profile https)
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
3. **v0.3 – Money** ✅: expenses, oil sales, subsidies and other income, totals by calendar year
4. **v0.4 – Reports** ✅: field × season comparison, season totals, yield through the season, cost of
   your oil per year, CSV export
5. **v0.5a – Server and sync** ✅: server, administrator account, sign-in, offline sync between
   devices, daily backups
6. **v0.5b – Users** ✅: more people with per-area access (see / change), temporary first
   password, more groves per installation
7. **v1.0+**: Android/iOS apps (Capacitor), daily reminders, location-aware default field,
   equipment log, tasks per tree (numbered or NFC-tagged trees), weather integration, labour reports, spreadsheet import

## Licence

Copyright (C) 2026 Andreas Maninakis.

Mazono is free software: you can use, change and share it under the
[GNU Affero General Public License, version 3 or later](LICENSE) (AGPL-3.0-or-later).
If you run a changed version for other people, for example on a public server, you must offer them
its source code under the same licence.

- **Name and logo:** "Mazono" and its logo are not covered by the AGPL. Forks are welcome under their
  own name and logo; see [TRADEMARKS.md](TRADEMARKS.md).
- **Contributing:** contributors accept the [Contributor Licence Agreement](CLA.md) once, in their
  first pull request. You keep the copyright in your work; the CLA lets the project also offer
  commercial plans and app-store releases.
- **Earlier versions:** Mazono (then HarvestLog) was MIT-licensed up to version 0.12.0. Copies of those
  versions stay under MIT; everything after them is AGPL-3.0-or-later.
