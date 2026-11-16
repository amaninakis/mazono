import type { HarvestDB } from '../db/db'
import { SYNC_TABLES } from '../core/syncFormat'
import { forgetSync } from './engine'

/* The groves (farms) on this device: which one is open, and removing one. */

/** Tables whose rows count as "data you entered"; the rest are defaults from setup. */
const DATA_TABLES = [
  'fields',
  'entries',
  'extractions',
  'transactions',
  'stockMovements',
  'mills',
]

/** Does the grove hold anything the user entered (fields, work, productions, money…)? */
export async function groveHasData(database: HarvestDB, farmId: string): Promise<boolean> {
  for (const table of DATA_TABLES) {
    const count = await database
      .table(table)
      .where('farmId')
      .equals(farmId)
      .filter((row: { deletedAt?: number }) => !row.deletedAt)
      .count()
    if (count > 0) {
      return true
    }
  }

  return false
}

/** Delete every row of a grove from this device (it may still be on the server). */
export async function removeLocalGrove(database: HarvestDB, farmId: string): Promise<void> {
  const tables = SYNC_TABLES.map((table) => database.table(table))
  await database.transaction('rw', [...tables, database.meta], async () => {
    await database.farms.delete(farmId)
    await database.settings.delete(farmId)

    for (const table of SYNC_TABLES) {
      if (table !== 'farms' && table !== 'settings') {
        await database.table(table).where('farmId').equals(farmId).delete()
      }
    }
  })
  await forgetSync(database, farmId)
  if ((await database.meta.get('currentFarmId'))?.value === farmId) {
    await database.meta.delete('currentFarmId')
  }
}

/**
 * Open the right grove: keep the open one if it holds data; otherwise open a grove that does
 * (e.g. after a grove was created by mistake on a new phone), or the first one there is.
 * Returns the id of the grove opened, if it changed.
 */
export async function chooseCurrentGrove(database: HarvestDB): Promise<string | undefined> {
  const farms = await database.farms.toArray()
  const current = (await database.meta.get('currentFarmId'))?.value
  const isOpen = farms.some((farm) => farm.id === current)
  if (current && isOpen && (await groveHasData(database, current))) {
    return undefined
  }

  for (const farm of farms) {
    if (farm.id !== current && (await groveHasData(database, farm.id))) {
      await database.meta.put({ key: 'currentFarmId', value: farm.id })
      return farm.id
    }
  }
  if (!isOpen && farms[0]) {
    await database.meta.put({ key: 'currentFarmId', value: farms[0].id })
    return farms[0].id
  }

  return undefined
}
