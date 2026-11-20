# HarvestLog — Design

> **Harvesting olives is hard work. Keeping track of it shouldn't be.**

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

**Users are not technical.** Many growers are not tech-savvy. Using the app must need nothing beyond general familiarity with phone apps:

- Plain words in the grower's language, no technical terms on the main screens.
- Say **ελαιόλαδο** / **olive oil** in every text (genitive *ελαιολάδου*; with a possessive *το ελαιόλαδό σας*). The one exception is the short label under the drop icon in the bottom menu: **Λάδι** / **Oil**.
- Every setting has a sensible default; nothing is required except what the task needs.
- Self-hosting is done once by a helper (family member, cooperative, technician). The grower only opens a link and adds it to the home screen, with a short in-app guide for that step.
- Mistakes are easy to undo; nothing is lost by tapping the wrong button.

**Logging is never extra work.** The harvest is physically hard; the app must not add a chore on top of it. Recording a day takes a few taps with tired, dirty hands, and it should feel rewarding, almost like a game:

- Visible progress: each field fills up as trees are harvested; the season total grows with every save.
- Small rewards at the right moment: today's yield after saving, a short note when a field is finished, the season's numbers put another way ("this year's oil fills 6 bathtubs"), best day so far.
- No guilt: no nagging, no broken streaks, no red warnings for missed days. Reminders are gentle and stop when asked.

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

The app is a TypeScript PWA with a local database on the device and a small sync server (v0.5), and Capacitor will wrap the same code for Android/iOS, so one codebase covers all three.

| Layer | Choice | Why |
| --- | --- | --- |
| UI | Vue 3 (Composition API, `<script setup>`) + TypeScript + Vite, mobile-first. Nuxt (SPA mode) + Nuxt UI was considered: it would mean restyling every screen for little gain at this size, so it is not used for now; the lint setup works with either. | Approachable for new contributors; single-file components keep markup, logic and style together; the same code runs in the browser and in Capacitor. |
| Local storage | IndexedDB via Dexie | Works with no signal in the field; instant saves. |
| Sync (v0.5) | REST sync with per-record timestamps and UUIDs | UUIDs let records be created offline without ID clashes. |
| Server (v0.5) | Node + Fastify, SQLite by default | One small container; easy to back up. |
| Packaging | One Docker image (Caddy) + docker-compose | Home server, Raspberry Pi, NAS or VPS. |
| Mobile (later) | Capacitor wrapper of the same web app | No rewrite; adds native camera and notifications. |
| i18n | i18next with i18next-vue, one JSON file per language | Translators only edit JSON; Greek plural forms handled. |
| Licence | MIT | May move to AGPL-3.0 later; that would apply to new versions only. |

**Design rules (keep these in every PR)**

- All business logic (yield, allocation, stock, seasons) lives in `app/src/core/`, free of UI code, with unit tests.
- No server-only features in the core flows. The app must work fully offline.
- Touch targets are at least 48 px. Steppers must be usable with gloves.
- Text is never below 12 px, and only three font weights are used (400, 500, 600); hierarchy comes from size.
- Dialogs work by keyboard too: focus moves in and stays in, Escape closes, focus returns to what opened them.
- **Drafts**: the Today, production and money forms keep what was typed but not saved on the device (`core/drafts.ts`, `ui/draft.ts`), only the values changed from how the form started. Coming back shows "Continuing your unsaved entry" with *Start over*; leaving shows a gentle note that it was kept; saving clears it. Drafts older than 7 days are dropped.
- **Checking a box when you leave it** (forms with rules: account, new password, adding a person, dates): never while typing; the message goes as soon as it is corrected; saving checks every box and moves to the first problem (`ui/fieldChecks.ts`).
- **Settings in sections**: `/settings` shows the language and a list of sections with a one-line summary each (Account, People, Fields, Units, Mill and oil, Money, Task types, General, Data); `/settings/<section>` shows one section with a back link. On a computer the list stays on the left. Archiving in lists is an icon on phones, icon and word on wider screens.
- **Icons**: one set of simple line icons (`ui/AppIcon.vue`, `ui/icons.ts`) in the text colour, so the app looks the same on every phone; emoji stay only where the grower chooses them (task types) and in the records board.
- **Computer and tablet** (768 px and wider): the bottom bar becomes a side menu; forms stay a 640 px column; from 1024 px Money, Oil and History put the summary or calendar on the left and the list on the right.
- Deleting work, a production, a move or a money entry is undone from the toast, not confirmed first (fast and forgiving). A question first only for what cannot be undone: deleting an account or a grove, removing a person, or a change that would leave oil missing.
- Store quantities in base units (kg, trees, units) and format them only for display.
- Every user-facing string goes through i18n, in both `en.json` and `el.json`.
- Write for non-technical users: plain words, no jargon on the main screens, a default for every choice.
- Code follows `@maninak/eslint-config`: `npm run lint` must report 0 problems (enforced in CI and by a pre-commit hook).
- Every record has a UUID `id`, a `farmId`, `updatedAt`, and is soft-deleted (`deletedAt`) so it can sync.
- Data can always be exported (JSON now, CSV later), so users are never locked in.

**Multi-user and multi-farm**: one installation serves many farms (tenants), each with its own users. Every table carries a farm id, and the server will enforce it on every request. When several people log offline, sync resolves conflicts per record: the last edit wins, and an edit history keeps anything from being lost silently.

**Hosting**: one Docker image (amd64 + arm64), configured by environment variables, with data in a mounted volume. There are two documented setups:

- **VPS, public**: Caddy provides automatic HTTPS. Sign-up is invite-only by default, with login rate limiting (from v0.5).
- **Home lab, private**: no ports open to the internet; reach it over Tailscale, using `tailscale serve` for an HTTPS address.

Both need HTTPS, because browsers only allow offline mode and "install app" over HTTPS. Target footprint: under 256 MB RAM when idle.

### Server and sync — v0.5a

- **Server**: Node 22 + Fastify (`app/server`), data in one SQLite file (Node's built-in `node:sqlite`, so no native packages) in `/data`, with a daily `VACUUM INTO` copy kept for 14 days. The same container serves the web app. Node runs the TypeScript directly (type stripping), so there is no server build step.
- **Accounts**: the first account is the **installation owner** and administrator of the groves it creates. Passwords are hashed with scrypt; at least 8 characters. Usernames are 2–40 letters or digits, not case-sensitive. Ten wrong passwords for the same name from the same address block sign-in for 15 minutes.
- **Sessions**: a random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS), valid for 90 days after the last use. Sign-in forms carry `autocomplete` hints so phones and browsers can remember the password. Signing out removes the farm's data from that device (it stays on the server) and warns first about changes not sent yet.
- **Sync** (`src/sync/engine.ts`): every local write marks the row "not yet sent" (`_dirty`, set by Dexie hooks; rows written by the sync itself are not marked). A sync sends those rows (all rows the first time a farm syncs on a device), then receives every row changed on the server since the device's last sequence number. Each row keeps the newer version (`updatedAt`). The server stores each row as JSON with an increasing sequence number, refuses a change older than what it has (and sends its version back), and corrects a phone clock that is more than a minute off by the difference between the phone's and its own time.
- **When**: 1.5 s after a change, every minute, when the phone comes back online and when the app is opened again. A signed-in phone opens and works without signal.
- **Signing in on a new device**: a loading screen stays until the account's data has arrived (with "try again" if it fails); the first-time setup is never shown then, so nobody starts an empty grove by mistake. Every device syncs all the groves of the account; when the app opens, an empty open grove gives way to one that has data. Settings → Account lists the groves when there is more than one, to open another or remove an empty one (refused by the server for a grove with data).
- **Without a server** (e.g. `npm run preview`, or v0.4 deployments) the app works on its own as before.

### People and permissions — v0.5b

- **Roles**: in each grove a person is an **administrator** (sees and changes everything, manages people) or a **user** with a level per area: *no*, *see* or *change*. Areas: **Work** (Today and the Journal), **Oil**, **Money**, **Reports** (see only) and **Settings**. Ready-made sets: **Worker** (changes work, nothing else), **Family** (changes work and oil, sees money, reports and settings), **Accountant** (sees oil, money and reports, changes nothing). The rules live in `src/core/access.ts`, shared by the app and the server.
- **The server enforces them**: a sync only sends the tables a person may see (`readableTables`), so data they may not see never reaches their phone, and it refuses changes to tables they may not change (`writableTables`) by sending its own version back. The app hides pages and buttons to match, removes tables that are no longer allowed, and reloads the grove when someone's access changes.
- **Adding someone** (Settings → People, administrators only): a username and a **temporary password**, typed by the administrator or suggested (two Greeklish words and a number, e.g. `elia-ladi-27`). The screen then shows what to hand over. At the first sign-in they must choose their own password before anything syncs. An administrator can give a new temporary password later (this signs them out everywhere), change their access, or remove them from the grove; what they logged stays.
- **Safety**: the installation owner always stays an administrator, and a grove always keeps at least one administrator. Only the owner can add a person who already has an account in another grove (they keep their own password), and only the owner can create someone who **starts their own grove** as its administrator. A person can be in several groves.
- **Removing someone** from their last grove deletes their account, so the username is free again; what they logged keeps their name.
- **Accounts on this server** (Settings, installation owner only): every account with when it was last active, whether it waits for a new password or for its own grove, and its groves (role and number of people; the grove's name only if the owner is in it — the owner does not see other people's data). The owner can give anyone a new temporary password, or delete an account: groves nobody else uses go with it (confirmed by typing the username); an account that is the only administrator of a grove others use is kept until someone else becomes administrator.
- **Who logged it**: the server stamps `createdBy` on new work, mill, stock and money records; the Journal shows "Logged by …" for entries made by someone else.

## Core concepts

The **farming year** (called "season" in the code, *χρονιά* in Greek) is the backbone. It holds all the work that leads to one harvest: it starts with the spring work on **1 March** and ends on the last day of February, so a harvest and mill visits that run into January or February still count for that year's crop. It is named by the year it starts in ("2026"). The start month can be changed in Settings. Field work, mill production and oil stock belong to a farming year; **money is always per calendar year** (1 Jan – 31 Dec), as taxes are. Until v0.4 the year started in October and was labelled "2025–26"; existing farms were moved to March by a database upgrade (v5).

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
| User, membership | username, password hash, must-change flag; per grove: role (administrator / user) and a level per area (none / see / change) | v0.5b |

Trees remaining in a field for a task = trees in the field − trees logged for that task type in the current season. All task types that record a harvest count together (a tree harvested under one harvest task is not left for another), and share "field finished"; other tasks such as pruning or spraying count on their own. A field also counts as finished when an entry marks it "field finished", because not every tree is harvested every year.

**Field yield and tree yield.** When not all trees of a field are harvested, the two per-tree figures differ:

| Figure | Calculation | Example: field of 30 trees, 20 harvested, 30 sacks |
| --- | --- | --- |
| Tree yield | output ÷ trees harvested | 1.5 sacks per harvested tree |
| Field yield | output ÷ all trees in the field | 1.0 sack per tree |

Tree yield shows how productive the bearing trees were. Field yield shows what the whole field produced, and is the figure for comparing fields and seasons (alternate bearing). Farm yield = total output ÷ trees in all fields. Both are calculated in `harvestYields()` in `app/src/core/progress.ts`.

**Trees worked is optional.** If the user never enters it, the app still works: field and farm yield use the field's tree count, tree yield shows "–", and trees left cannot be counted, so the field is closed with "Field finished" (planned: the app offers it at the end of the harvest).

Users join farms through a membership with a role; one person can belong to several farms. Harvest entries link to extractions through an **allocation** record, so one day's harvest can feed several mill batches.

## Today screen (home) — v0.1


The trees box starts with the trees of a usual day of that work: the average trees per work day for the task (tasks counted together count together, and a day's fields add up), from this farming year's days, or all earlier years' before the first one, and 0 with no days at all. It is never more than the trees still left in the chosen field (if the field has a tree count). It follows the field, task and date until the user changes the number. A × button beside the box (shown above 0) sets it to 0 without opening the keyboard.
The app opens here. Everything for one entry sits on a single scrollable page with a sticky **Save** button.

**Shared top area**

- Task type chips: Harvest · Pruning · Fertilizer · Weed whacking · + New. The default is the task active this month (from each type's active months). When several overlap, the one logged most recently wins.
- Date: today by default. One smart button beside the date: on today it says "Yesterday", on any other day "Today" (back to today in one tap). Then ‹ date ›, with a date picker. On a typical phone (393 px, the phone's own font) it all fits on one line with every target 48 px: the date box is as wide as its date where `field-sizing` is supported. Smaller phones wrap it to two lines.
- Field picker: unfinished fields come first and show "12 of 22 left". The default is the field worked most recently that still has trees left. Finished fields are greyed out but still selectable.

**Input kinds**

| Kind | Used by | Inputs |
| --- | --- | --- |
| harvest | Harvest | trees, plus one row per unit (mix units; whole steps with a separate +½ button) |
| trees | Pruning | trees |
| quantity | Fertilizer | product (autocomplete), amount, unit (kg / bags / L), optional trees |
| done | Weed whacking | only "field finished" |

The trees counter cannot go above the trees left in the field. Reaching the last tree switches "field finished" on automatically (and off again if the number goes back down, unless the user set the switch by hand).

Units have a singular and an optional plural name ("1 τσουβάλι", "8,5 τσουβάλια"); the plural is used for amounts above one. The presets come with plurals in every language.

Every kind also has a "field finished" toggle and notes. Workers and hours appear only with the Labour module on. Users can create their own task types (spraying, irrigation, tilling…) by choosing one of these four kinds; no new code is needed.

After saving, a confirmation shows units per tree for the day, and for the season so far in that field both the tree yield and the field yield (when they differ), with **Undo**. The form keeps the date and task, so logging the next field is quick.

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

**Unit weights** are optional. The app works them out from extractions (olives kg ÷ units): first from batches with a single unit type, then for mixed batches as data grows. A user-entered weight is used until there is enough data. *(v0.2 learns from single-unit batches; in a mixed batch a unit with no known weight counts as the average of the known ones.)*

**How v0.2 implements it**

- Charges are always visible, one row per charge type, each with its % of the oil. A charge with a usual % in Settings is filled in from the oil kg until the user types a value.
- The first storage place (by default "At the mill") gets the rest of the net oil; the others are typed in.
- Harvest days are pre-ticked when they are from the same season, on or before the extraction date and on or after the previous extraction, plus leftovers of days already partly milled. "Part" sets how many units of a day went into this batch.
- An extraction is one record holding its charges, storage and allocations (`Extraction` in `app/src/core/types.ts`). Stock is never stored as a number: it is calculated from extractions (oil in) and stock movements (transfers, own use; sales in v0.3) in `stockLevels()`.
- After saving: yield, net oil, kg of olives per unit (single unit type) and kg of oil per tree.
- The Oil page shows season totals, the extractions, an estimate of oil per field (≈, with kg per tree in the field) and the stock table.

## Season overview and oil stock — v0.2

- **Extractions this season**: one row per mill visit (date, olives, oil, yield, charges with %, net, acidity, stored) with a totals row and a season selector.
- **Oil stock**: rows = vintage (season), columns = location, cells = kg on hand. Tap a cell to see its movements.
- Stock actions besides sales: **transfer** (e.g. mill → home) and **own use / gift**.
- **Oil can never quietly go missing**: a sale, transfer or own use cannot take more than is on hand (the amount on hand is shown to the gram). Editing or deleting a production, or deleting a transfer, that would leave less oil than was already sold or moved out asks first ("Oil would be missing", with place, season and kg; *Save / Delete anyway* or *Cancel*), via `newShortfalls()`. A place that is short anyway shows in red with the exact amount (e.g. −0,02, never "−0") and the Oil page lists it with how to fix it. An existing sale can be saved again with the same or fewer kg. *(0.6.2)*

## Costs, sales and income — v0.3

| Entry | Fields | Behaviour |
| --- | --- | --- |
| Expense | date, business name (autocomplete), € amount, category, invoice no.?, receipt photo? | Category is remembered per business. Expenses are not linked to fields. |
| Oil sale | date, buyer, kg, €/kg → total, optional fee (% or €), vintage + location sold from | Deducts from that stock; warns if stock would go negative. Default = oldest vintage at the mill. The fee is remembered per buyer. |
| Other income | date, source, € amount, category (subsidy, VAT refund, other) | Autocomplete like expenses. |

Totals per **calendar year**: income, expenses, net result, and the value of remaining stock at the last sale price; the user chooses which places' oil counts for that value (e.g. only the oil at the mill). Farming years are used only for field work, mill production and oil stock. An optional tax estimate % shows an after-tax figure.

**How v0.3 implements it**

- One `Transaction` record per expense, oil sale or other income, and `Category` records for expense and income categories (built-in ones are translated; users can rename, add and archive).
- An oil sale can record the oil's acidity (optional); a new sale starts with the previous sale's acidity.
- An oil sale stores its kg, € per kg, season (vintage) and place; `stockLevels()` subtracts it, so stock and money cannot disagree. The kg cannot exceed what that season's oil has in that place.
- **Oil not recorded in the app** (e.g. sold before the user started): a sale can come from a season with no extractions in the app. It counts as income but does not reduce stock, and is marked "not from recorded stock". As soon as that season's extractions are entered, the sale is deducted from that season's stock automatically (`isUntrackedSale()` / `trackedVintages()`), so entering past data later never double-counts.
- The category last used with a business is filled in when the business is typed again (`categoryForParty()`).
- **Sale fee** (optional, e.g. a mill's 1% transaction fee): entered as % of kg × price or as euros. The sale's `amount` is the money received (after the fee); the fee is kept in `fee` (and `feePercent` when given as %). Totals count the money received and show the fees; the average price per kg is before fees. The last fee used with a buyer is filled in again (`feeForBuyer()`).
- Tax estimate = net result × tax % when the result is positive. Remaining stock is valued at the price of the most recent sale.
- Money amounts use the date and number format setting: "1.234,50 €" in Greek style, "€1,234.50" otherwise.
- Receipt photos are left for later (v1.0+).
- After saving an entry, the Money page opens on the calendar year of its date (the Oil page on the season of an extraction), and the save message names it, so past entries never seem to disappear.

## Reports — v0.4

0. **This year** (the first tab): how the current farming year is going. Units collected (e.g. sacks) and in how many harvest days, olives in kg (the mill weights of this year's productions, plus an estimate for units not yet weighed: kg per unit from this year's weigh-ins, else earlier years', else the user's estimate in Settings; each weigh-in is listed with the exact kg per unit of the harvest days that went into it, and a production entered without harvest days ticked is taken to cover its weight's worth of the waiting units), oil (and after mill charges), units per harvest day, trees harvested out of all trees in the fields in use (a bar), and trees per work day for each task type where trees are entered. A chart of running totals through the year (one chip per harvest unit, oil, or trees harvested), with lines joining the days something was added, compared with an earlier year the user picks (up to four, newest first) or the **average** of the earlier years (dashed). This year's line runs on, flat, to today; under the chart: "By today: this year 24,5 sacks, last year 37,5 sacks (−35%)" and the whole-year total of the comparison. Logic in `core/yearReport.ts`.
1. **Field × year comparison**: olives collected (units, the default), oil kg, olives per tree, oil per tree or yield (each field's share of the olives and oil of the productions it went into), by field and year, with a caption naming the unit ("In sacks per tree"). Shows alternate bearing at a glance.
2. **Years side by side**: olives (καρπός), oil, oil after charges and yield per year in a table; chips choose which one the bar chart shows, and every bar carries its value.
3. **Yield through the year**: yield of each extraction by date (axis in the farm's yield style: 1/4, 1/5… or %), for up to three years the user picks (more cannot be told apart reliably by colour), with date labels on the 1st and 15th of each month.
4. **Cost of your oil (per calendar year)**: income, expenses, net; cost per kg of net oil; break-even price. Money stays per calendar year and is set against the oil of the farming year with the same number: the 2026 costs of pruning, spraying and harvest produce the 2026 oil (including mill visits in January–February 2027). Cost per kg = expenses ÷ net oil; break-even price = (expenses − other income) ÷ net oil.

5. **Records**: all-time bests (best year for oil and for yield, best field-year for oil per tree, field with the most oil, best and biggest production, biggest harvest day, most trees in a day, lowest acidity, best sale price), the numbers **put another way**, and lifetime totals. Logic in `core/records.ts` and `core/comparisons.ts`.
   - *Put another way* replaces achievement badges, which did not suit growers. This year's and all years' oil, olives and trees are compared with everyday things (volume: bottle … Olympic pool; weight: 17-kilo oil tin, donkey, cow, small car, farm pickup, elephant, lorry, blue whale; length: Parthenon, football pitch, running track, Rio–Antirrio bridge), plus "oil for a family of four for N years" (about 12 kg per person a year in Greece) and "N village salads".
   - Not a fixed list: for each number the objects that fit best are found (a few of them, not 0.0004 of a pool) and said the way people do ("6½ bathtubs", "about a cow", "¾ of a cow"). Which one shows changes daily and with *Show another*, never the same object twice on the screen. Each card says what comes next ("18 litres more for 7 bathtubs") with a bar from the last whole one.
   - "This year" is the latest farming year with a production (until the first one, the year before, named).

How they work:
- All reports are on one Reports page (in the bottom bar), one tab each, with a short plain-words explanation and an empty-state hint.
- Field oil is the field's share of each extraction by olive weight (the same estimate as the Oil page). "Per tree" uses the trees entered as harvested, or the field's tree count when none were entered. Cells are shaded darker for bigger values; tapping a cell shows its details.
- Charts are plain SVG (no chart library): bars for season totals, lines for yield (up to three seasons, each season keeping its colour). Every mark can be tapped for its numbers; tables carry the same data.
- CSV export of each report: `;` columns and decimal commas in Greek number style, `,` and decimal points otherwise, UTF-8 with BOM so Excel shows Greek text.

Ideas for later: harvest progress compared with last season; kg per unit over time; charges as % of oil per season; acidity by field and date; rain vs yield (see Weather integration); labour days per field; CSV/PDF export of any report.

## Settings

- **Language**: chosen per phone and open to everyone, whatever their permissions; it is kept when signing out. The grove's language is only the starting point for a phone that has not chosen one (and is updated when someone who may change settings picks a language). *(v0.5b)*
- **General**: season start month, yield format (1/x or %), farm name. *(v0.1)*
- **Date and number format**: Automatic, Greek (15/11/2026 · 1.234,5), British or American, separate from the language. Browsers do not pass on the operating system's region setting (e.g. macOS English with region Greece), so "Automatic" also looks at the time zone. Date fields show dates in this format rather than the browser's. *(v0.2)*
- **Fields, units, task types**: add, edit, archive (never delete fields with history), colours, icons, active months. *(v0.1)*
- **Optional modules**, off by default and set per farm: Labour (workers, hours; wages and costs later). *(v0.1)*
- **Data**: JSON backup export/restore *(v0.1)*; CSV export, spreadsheet import, sync status, automatic backups *(later)*.
- **Mill and charges**: mills, charge types with default %, storage locations. *(v0.2)*
- **Finance**: categories, tax estimate %. *(v0.3)*
- **Users and farms**: invitations, roles, switching farms, instance admin. *(v0.5)*

## Future features

These are planned but not yet scheduled in detail. Open an issue before starting on one.

**Daily reminder**

- Once a task has been logged in the current season, a notification at 16:00 on any day with no entry: "Nothing logged today — what did you do?". Tapping it opens Today.
- The time can be changed, or reminders turned off, in Settings.
- The user can mark a task as "ended for this season" (on Today or from the reminder). When every started task has ended, reminders stop until a new task is logged.
- Limitation: a web app gets scheduled notifications only through web push from the server (on iPhone only when added to the home screen, iOS 16.4+). Reminders therefore arrive with the sync server; the native apps can schedule them on the phone itself.

**Location-aware default field**

- Each field can store its centre: "Use my current location" while standing in it, or a pin on a map (OpenStreetMap).
- On Today, if the phone is within about 300 m of a field's centre, that field is preselected, ahead of "last field worked". If several are close, the nearest wins.
- Location is used only while the app is open, only with permission, and never leaves the farm's own data.

**Equipment log**

- Equipment list (tractor, olive shaker, chainsaw, brush cutter, sprayer, nets): name, type, purchase date, notes.
- Use: link equipment to task entries, or log hours and fuel.
- Service: date, work done, cost (added to Money as an expense), next service due by date or hours, with a reminder.

**Weather integration**

- Daily rain and temperature from local weather services: in Greece the meteo.gr / National Observatory of Athens stations, with Open-Meteo as a free worldwide fallback. The nearest station is chosen from the fields' locations.
- Reports: rain in chosen months (e.g. Sep–Nov) against oil yield and olives per tree, one point per season. With few seasons the app labels it as an indication, not proof.
- Open question: meteo.gr has no official public API, so its terms need checking; a CSV import of station data is the fallback.

**Tasks per tree (optional)**

- Off by default; for growers who want to follow individual trees. Example: while harvesting, mark tree 12 for pruning later in the season.
- **Tree number per field**: numbering restarts at 1 in every field ("Monastiri #12"), which is easier to remember than one farm-wide number. Only trees that need it get a number; the field's tree count stays the main figure.
- **Marking the tree in the field**, whichever suits the grower: a number sprayed on the trunk, a numbered tag nailed to the bark, or an NFC tag. The NFC tag stores a link to that tree, so scanning it with any phone opens the tree in the app (iPhones read link tags natively; Android too). A printed weatherproof QR code is a cheaper alternative.
- **Marks**: needs pruning, sick / pests, did not bear, replant, or a custom note, with an optional photo. Added in two taps from the harvest screen ("Mark a tree" → number → mark).
- **Follow-up**: when pruning that field, Today lists the marked trees ("3 trees marked: #4, #12, #18") and ticking them off closes the marks. Each tree keeps its own history.
- Data: Tree (farm, field, number unique per field, optional NFC tag id, location, notes) and Tree mark (tree, mark type or task type, note, photo, created, done).

## Decisions

| Topic | Decision |
| --- | --- |
| Users | Multiple users. One installation hosts many farms, each with its own group of users. |
| Harvest split | One day's harvest can be split across several extractions. |
| Unit weights | Optional; the app calculates them from collected data. |
| Farming year | Starts 1 March (spring work) and ends in February, named by its year ("2026"); configurable. Money uses calendar years. |
| Labour | Opt-in module, off by default. |
| Fertilizer cost per field | Not included. |
| Spreadsheet import | To be decided; maybe selected seasons, or test data only. |
| Weather | Planned: local weather services, rain vs oil yield in reports (see Future features). |
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
| Farming year ≠ tax year | Field work and oil use farming years (March–February); money uses calendar years. |

## Roadmap

1. **v0.1 — Field log** ✅: setup wizard, fields, units, Today screen (four tasks + custom), journal and calendar, offline storage, EN/EL, multi-farm data model.
2. **v0.2 — Mill and stock** ✅: extraction form with charges, harvest linking with splits and allocation, season overview, stock by vintage and location.
3. **v0.3 — Money** ✅: expenses, sales (deducting stock), other income, totals by calendar year.
4. **v0.4 — Reports** ✅: the four reports above, CSV export.
5. **v0.5a — Server and sync** ✅: server in the Docker image, administrator account, sign-in, offline sync between devices, daily backups.
6. **v0.5b — Users** ✅: administrators and users; per page, a user can see it or also change it; ready-made sets (worker, family, accountant); a temporary first password (typed by the admin or suggested) that must be changed at first sign-in; data a user may not see never reaches their phone; the installation owner can create new groves with their own administrator; one person in several groves; the last administrator cannot be removed; entries show who logged them.
7. **v1.0+**: Android/iOS builds (Capacitor), weather integration, daily reminders, location-aware default field, equipment log, tasks per tree (tree numbers and NFC tags), Labour reports, spreadsheet import, receipt photos, more languages.
