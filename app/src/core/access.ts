import type { SyncTable } from './syncFormat'

/*
 * Who may see and change what in a grove. Shared by the app (to show the right pages) and the
 * server (which enforces it: data a person may not see never reaches their phone).
 *
 * Administrators may do everything. Other users get a level per area:
 *   work      Today and the Journal (field work)
 *   oil       the Oil page (productions, stock, mills)
 *   money     the Money page (expenses, sales, income)
 *   reports   the Reports page (see only)
 *   settings  fields, units, task types, charges, categories…
 */

export type Role = 'admin' | 'user'
export type Level = 'none' | 'see' | 'change'
export type Area = 'work' | 'oil' | 'money' | 'reports' | 'settings'
export type Permissions = Record<Area, Level>

export const AREAS: Area[] = ['work', 'oil', 'money', 'reports', 'settings']

export interface Access {
  role: Role
  permissions: Permissions
}

const NONE: Permissions = {
  work: 'none',
  oil: 'none',
  money: 'none',
  reports: 'none',
  settings: 'none',
}
const ALL: Permissions = {
  work: 'change',
  oil: 'change',
  money: 'change',
  reports: 'see',
  settings: 'change',
}

/** Ready-made sets an administrator can pick when adding someone. */
export const PRESETS = {
  /** Logs field work; sees nothing else. */
  worker: { ...NONE, work: 'change' },
  /** Logs work and oil, sees money and reports, cannot change money or settings. */
  family: { work: 'change', oil: 'change', money: 'see', reports: 'see', settings: 'see' },
  /** Sees money, oil and reports; changes nothing. */
  accountant: { ...NONE, oil: 'see', money: 'see', reports: 'see' },
} satisfies Record<string, Permissions>

export type PresetName = keyof typeof PRESETS

/** The preset these permissions match, if any. */
export function presetOf(permissions: Permissions): PresetName | undefined {
  return (Object.keys(PRESETS) as PresetName[]).find((name) =>
    AREAS.every((area) => PRESETS[name][area] === permissions[area]),
  )
}

/** Permissions as stored (fills in missing areas, and reports can only be seen). */
export function cleanPermissions(value: unknown): Permissions {
  const given = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<Area, unknown>
  >
  const levels: Level[] = ['none', 'see', 'change']
  const clean = { ...NONE }
  for (const area of AREAS) {
    const level = given[area]
    if (typeof level === 'string' && levels.includes(level as Level)) {
      clean[area] = level as Level
    }
  }
  if (clean.reports === 'change') {
    clean.reports = 'see'
  }

  return clean
}

/** The effective permissions of a member (administrators have them all). */
export function effectivePermissions(access: Access): Permissions {
  return access.role === 'admin' ? ALL : access.permissions
}

/** May this member see (or, with `level` "change", change) this area? */
export function can(access: Access | undefined, area: Area, level: 'see' | 'change' = 'see') {
  if (!access) {
    return false
  }
  const has = effectivePermissions(access)[area]

  return level === 'see' ? has !== 'none' : has === 'change'
}

/** Rows every member needs to use the app at all (names of fields, units, tasks…). */
const BASE: SyncTable[] = ['farms', 'settings', 'fields', 'units', 'taskTypes']
const OIL: SyncTable[] = ['extractions', 'stockMovements', 'mills', 'chargeTypes', 'locations']
const MONEY: SyncTable[] = ['transactions', 'categories']

/** Tables whose rows this member receives. */
export function readableTables(access: Access): Set<SyncTable> {
  const tables = new Set<SyncTable>(BASE)
  function add(list: SyncTable[]) {
    for (const table of list) {
      tables.add(table)
    }
  }

  function sees(area: Area) {
    return can(access, area)
  }
  // The Oil page links productions to harvest days; Money sells from oil stock; Reports use
  // field work and oil. So each of those also brings the data it is built on.
  if (sees('work') || sees('oil') || sees('money') || sees('reports')) {
    add(['entries'])
  }
  if (sees('oil') || sees('money') || sees('reports')) {
    add(OIL)
  }
  if (sees('money')) {
    add(MONEY)
  }

  return tables
}

/** Tables this member may change. */
export function writableTables(access: Access): Set<SyncTable> {
  const tables = new Set<SyncTable>()
  function add(list: SyncTable[]) {
    for (const table of list) {
      tables.add(table)
    }
  }
  if (can(access, 'settings', 'change')) {
    add([
      'farms',
      'settings',
      'fields',
      'units',
      'taskTypes',
      'mills',
      'chargeTypes',
      'locations',
      'categories',
    ])
  }
  if (can(access, 'work', 'change')) {
    add(['entries'])
  }
  if (can(access, 'oil', 'change')) {
    // Productions also mark harvest days as milled (allocations live on the production), and
    // a new mill can be added from the production form.
    add(['extractions', 'stockMovements', 'mills'])
  }
  if (can(access, 'money', 'change')) {
    add(['transactions'])
  }

  return tables
}

/** Changes whenever what a member may see changes (the device then re-loads that grove). */
export function accessSignature(access: Access): string {
  return [...readableTables(access)].sort().join(',')
}
