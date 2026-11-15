# HarvestLog — Design

This document explains what HarvestLog is meant to become and why it is built the way it is.
Read it before opening a pull request for a new feature, so your change fits the plan.
For setup and development commands, see the [README](../README.md).

## Overview

HarvestLog is a self-hosted, open-source app that replaces the yearly olive spreadsheet. It lets you:

- log field work from your phone in under 30 seconds;
- record each mill extraction;
- track oil in storage and money in and out;
- compare fields and seasons over time.

**Goals**

- Fast daily logging in the field, one-handed, with poor or no signal.
- Link each day's harvest to the extraction it went into, so oil per field and per tree can be calculated.
- Know at any moment how much oil is stored, where, and from which season.
- Season and year-over-year statistics without manual formulas.

**Principles**

- One screen per task, smart defaults, minimal typing.
- Offline-first: data is saved on the device and syncs to the server when online.
- English and Greek from day one, with every string translatable. Numbers and dates follow the user's locale (Greek uses comma decimals).
- Web first (installable PWA), with a code structure that can be wrapped into Android/iOS apps later without a rewrite.

## Background: how growers track this today

The design is based on a real grower's spreadsheet covering several seasons. Its useful lessons:

| What growers track today | What it means for the app |
| --- | --- |
| Per extraction: olives kg, oil kg, yield, mill fee, bug spraying (Δάκος), VAT, final kg, acidity, oil stored | The extraction form needs all of these, including acidity. |
| Mill fee is usually 11–15% of the oil, bug spraying 0.4–1%, VAT 1.4–2%, often a fixed rate per mill and season | Charges can be entered as kg **or** auto-filled from a default %. |
| The harvest log has date, field, sacks, trees and the mill receipt number | The receipt number links harvest days to an extraction. Store it. |
| Half sacks (8.5, 1.5) | Unit quantities use 0.5 steps, not whole numbers only. |
| Oil per harvest row = extraction oil split in proportion to sacks | This is the allocation method (see below). |
| Some harvest rows have no tree count | The tree count per entry is optional. |
| Oil from earlier seasons is sold years later and kept in more than one place | Stock is tracked **per season (vintage)** and **per location** (mill, home). |
| Tax estimates and VAT refunds | Optional tax estimate setting; VAT refund is an income category. |
| Local weather station data | Optional weather data for reports (rain vs yield), later. |

## Platform and architecture

The app is a TypeScript PWA with a local database on the device. A small sync server comes later, and Capacitor will wrap the same code for Android/iOS, so one codebase covers all three.

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React + TypeScript + Vite, mobile-first | Large ecosystem; the same code runs in the browser and in Capacitor. |
| Local storage | IndexedDB via Dexie | Works with no signal in the field; instant saves. |
| Sync (v0.5) | REST sync with per-record timestamps and UUIDs | UUIDs let records be created offline without ID clashes. |
| Server (v0.5) | Node + Fastify, SQLite by default | One small container; easy to back up. |
| Packaging | One Docker image (Caddy) + docker-compose | Home server, Raspberry Pi, NAS or VPS. |
| Mobile (later) | Capacitor wrapper of the same web app | No rewrite; adds native camera and notifications. |
| i18n | i18next, one JSON file per language, ICU plurals | Translators only edit JSON; Greek plural forms handled. |
| Licence | MIT | May move to AGPL-3.0 later; that would apply to new versions only. |

**Design rules (keep these in every PR)**

- All business logic (yield, allocation, stock, seasons) lives in `app/src/core/`, free of UI code, with unit tests.
- No server-only features in the core flows. The app must work fully offline.
- Touch targets are at least 48 px. Steppers must be usable with gloves.
- Store quantities in base units (kg, trees, units) and format them only for display.
- Every user-facing string goes through i18n, in both `en.json` and `el.json`.
- Every record has a UUID `id`, a `farmId`, `updatedAt`, and is soft-deleted (`deletedAt`) so it can sync.
- Data can always be exported (JSON now, CSV later), so users are never locked in.

**Multi-user and multi-farm**: one installation serves many farms (tenants), each with its own users. Every table carries a farm id, and the server will enforce it on every request. When several people log offline, sync resolves conflicts per record: the last edit wins, and an edit history keeps anything from being lost silently.

**Hosting**: one Docker image (amd64 + arm64), configured by environment variables, with data in a mounted volume. There are two documented setups:

- **VPS, public**: Caddy provides automatic HTTPS. Sign-up is invite-only by default, with login rate limiting (from v0.5).
- **Home lab, private**: no ports open to the internet; reach it over Tailscale, using `tailscale serve` for an HTTPS address.

Both need HTTPS, because browsers only allow offline mode and "install app" over HTTPS. Target footprint: under 256 MB RAM when idle.

## Core concepts

The **season** is the backbone. A harvest season runs across two calendar years: with the default start month of October, season 2025 runs from 1 Oct 2025 to 30 Sep 2026 and is labelled "2025–26". Field work and extractions belong to a season. Money is reported per season and per calendar (tax) year.

| Entity | Key fields | Status |
| --- | --- | --- |
| Farm | name | v0.1 |
| Field | name, trees, notes, archived | v0.1 |
| Unit | name, approx. kg (optional), default flag | v0.1 |
| Task type | name, colour, icon, input kind (harvest / trees / quantity / done), active months | v0.1 |
| Task entry | date, field, task type, trees?, unit quantities?, product + amount?, field finished, workers/hours?, notes | v0.1 |
| Extraction | date, mill, receipt no., olives kg, oil kg, acidity % | v0.2 |
| Allocation | harvest entry, extraction, units assigned | v0.2 |
| Charge | extraction, charge type, kg (or % applied) | v0.2 |
| Stock movement | date, vintage, location, kg (+ in / − out), reason (extraction, sale, transfer, own use) | v0.2 |
| Transaction | date, type (expense / sale / other income), counterparty, category, € amount, kg and €/kg for sales, vintage | v0.3 |
| User, membership | email, role per farm (owner / editor / viewer) | v0.5 |

Trees remaining in a field for a task = trees in the field − trees logged for that task type in the current season. A field also counts as finished when an entry marks it "field finished", because not every tree is harvested every year.

Users join farms through a membership with a role; one person can belong to several farms. Harvest entries link to extractions through an **allocation** record, so one day's harvest can feed several mill batches.

## Today screen (home) — v0.1

The app opens here. Everything for one entry sits on a single scrollable page with a sticky **Save** button.

**Shared top area**

- Task type chips: Harvest · Pruning · Fertilizer · Weed whacking · + New. The default is the task active this month (from each type's active months). When several overlap, the one logged most recently wins.
- Date: today by default, with a quick "Yesterday" and a date picker.
- Field picker: unfinished fields come first and show "12 of 22 left". The default is the field worked most recently that still has trees left. Finished fields are greyed out but still selectable.

**Input kinds**

| Kind | Used by | Inputs |
| --- | --- | --- |
| harvest | Harvest | trees, plus one row per unit (mix units, 0.5 steps) |
| trees | Pruning | trees |
| quantity | Fertilizer | product (autocomplete), amount, unit (kg / bags / L), optional trees |
| done | Weed whacking | only "field finished" |

Every kind also has a "field finished" toggle and notes. Workers and hours appear only with the Labour module on. Users can create their own task types (spraying, irrigation, tilling…) by choosing one of these four kinds; no new code is needed.

After saving, a confirmation shows units per tree for the day and the season average for that field, with **Undo**. The form keeps the date and task, so logging the next field is quick.

## Journal and calendar — v0.1

- A month calendar with one coloured dot per task type done that day (up to 3, then "+"). Each task type also has an icon, so colour is never the only signal.
- Previous / next day navigation, and a list of that day's entries: tap to edit, delete with undo.
- Planned: extraction days get their own marker; filter by task or field; a whole-season log view.

## Oil extraction — v0.2

One form per mill visit, in four blocks. Results update live as numbers are typed.

1. **Basics**: date, mill (remembered), receipt number, olives kg, oil kg → **yield 1/4.3** (olives ÷ oil), or as a % if set in Settings. Acidity is optional.
2. **Charges in oil** (collapsed by default): mill fee, bug spraying, VAT, plus "+ Add charge". Each shows its % of the oil extracted. Default % per charge comes from Settings and can be corrected to the mill's exact kg. **Net oil = oil extracted − all charges.**
3. **Where the oil went**: by default all net oil is "stored at mill". It can be split between locations (e.g. home and mill), creating stock movements tagged with the season.
4. **Which harvest days went into this batch**: a multiselect list of harvest entries not yet fully allocated, newest first ("18 Nov · Monastiri · 7 sacks"). Entries since the previous extraction are pre-ticked. An entry can be split, e.g. 4 of 7 sacks to this batch, with the rest left for the next one.

**How oil is allocated to fields**

Each harvest entry gets a share of the batch's oil in proportion to its estimated olive weight:

```
oil_i = oil_batch × Σ_u (n_iu × w_u) / Σ_j Σ_u (n_ju × w_u)
```

Here n is the number of units of type u in entry i, and w is that unit's weight. With a single unit type the weights cancel out, so it is a plain split by sacks. Per-field oil figures are estimates and are shown with "≈".

**Unit weights** are optional. The app works them out from extractions (olives kg ÷ units): first from batches with a single unit type, then for mixed batches as data grows. A user-entered weight is used until there is enough data.

## Season overview and oil stock — v0.2

- **Extractions this season**: one row per mill visit (date, olives, oil, yield, charges with %, net, acidity, stored) with a totals row and a season selector.
- **Oil stock**: rows = vintage (season), columns = location, cells = kg on hand. Tap a cell to see its movements.
- Stock actions besides sales: **transfer** (e.g. mill → home) and **own use / gift**.

## Costs, sales and income — v0.3

| Entry | Fields | Behaviour |
| --- | --- | --- |
| Expense | date, business name (autocomplete), € amount, category, invoice no.?, receipt photo?, field? | Category is remembered per business. |
| Oil sale | date, buyer, kg, €/kg → total, vintage + location sold from | Deducts from that stock; warns if stock would go negative. Default = oldest vintage at the mill. |
| Other income | date, source, € amount, category (subsidy, VAT refund, other) | Autocomplete like expenses. |

Totals: income, expenses, net result, and the value of remaining stock at the last sale price. A toggle switches between calendar year (for tax) and season (for farm economics). An optional tax estimate % shows an after-tax figure.

## Reports — v0.4

1. **Field × season comparison**: oil kg, oil per tree or units per tree, by field and season. Shows alternate bearing at a glance.
2. **Season totals over the years**: olives, oil, net oil and yield per season.
3. **Yield through the season**: yield of each extraction by date, to help decide when to harvest.
4. **Economics per season**: income, expenses, net; cost per kg of net oil; break-even price.

Ideas for later: harvest progress compared with last season; kg per unit over time; charges as % of oil per season; acidity by field and date; rain and temperature vs yield (Open-Meteo); labour days per field; CSV/PDF export of any report.

## Settings

- **General**: language, season start month, yield format (1/x or %), farm name. *(v0.1)*
- **Fields, units, task types**: add, edit, archive (never delete fields with history), colours, icons, active months. *(v0.1)*
- **Optional modules**, off by default and set per farm: Labour (workers, hours; wages and costs later). *(v0.1)*
- **Data**: JSON backup export/restore *(v0.1)*; CSV export, spreadsheet import, sync status, automatic backups *(later)*.
- **Mill and charges**: mills, charge types with default %, storage locations. *(v0.2)*
- **Finance**: categories, tax estimate %. *(v0.3)*
- **Users and farms**: invitations, roles, switching farms, instance admin. *(v0.5)*

## Decisions

| Topic | Decision |
| --- | --- |
| Users | Multiple users. One installation hosts many farms, each with its own group of users. |
| Harvest split | One day's harvest can be split across several extractions. |
| Unit weights | Optional; the app calculates them from collected data. |
| Season start | 1 October by default (configurable). |
| Labour | Opt-in module, off by default. |
| Fertilizer cost per field | Not included. |
| Spreadsheet import | To be decided; maybe selected seasons, or test data only. |
| Weather | Later. |
| Licence | MIT for now. |
| Hosting | Docker on any host: a VPS with public access, or a home lab reached through Tailscale. |

## Known concerns

| Concern | How the design handles it |
| --- | --- |
| Mixed units in one harvest (1 pallet bin + 3 sacks) cannot be compared without weights | Optional unit weights, learned from extractions over time. |
| Oil per harvest day is never measured | Proportional allocation, shown as estimates (≈). Taking each field's olives to the mill separately gives exact figures. |
| Trees are not all harvested every year | "Field finished" closes a field for the season regardless of the count. |
| Harvest and pruning seasons overlap | Default by active months, then by the most recently logged task. |
| Data only on one phone can be lost | Offline-first with server sync (v0.5), scheduled backups and one-tap export. |
| Harvest season ≠ tax year | Totals can switch between season and calendar year. |

## Roadmap

1. **v0.1 — Field log** ✅: setup wizard, fields, units, Today screen (four tasks + custom), journal and calendar, offline storage, EN/EL, multi-farm data model.
2. **v0.2 — Mill and stock**: extraction form with charges, harvest linking with splits and allocation, season overview, stock by vintage and location.
3. **v0.3 — Money**: expenses, sales (deducting stock), other income, totals by season and calendar year.
4. **v0.4 — Reports**: the four reports above, CSV export.
5. **v0.5 — Self-hosting**: sync server, login, farms and roles, backups, translator guide.
6. **v1.0+**: Android/iOS builds (Capacitor), Labour reports, spreadsheet import, weather data, receipt photos, more languages.
