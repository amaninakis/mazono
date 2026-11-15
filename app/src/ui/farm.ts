import type { TFunction } from 'i18next'
import type {
  Category,
  ChargeType,
  Extraction,
  FarmSettings,
  Field,
  Mill,
  StockMovement,
  StorageLocation,
  TaskEntry,
  TaskType,
  Transaction,
  Unit,
} from '../core/types'
import type { FarmRepo } from '../db/repo'
import { type ComputedRef, inject, type InjectionKey, provide } from 'vue'

export interface FarmData {
  repo: FarmRepo
  farmName: string
  settings: FarmSettings
  fields: Field[] // includes archived, excludes deleted
  units: Unit[]
  taskTypes: TaskType[]
  entries: TaskEntry[]
  mills: Mill[]
  chargeTypes: ChargeType[]
  locations: StorageLocation[]
  extractions: Extraction[]
  stockMovements: StockMovement[]
  categories: Category[]
  transactions: Transaction[]
}

const FARM_KEY: InjectionKey<ComputedRef<FarmData>> = Symbol('farm')

export function provideFarm(farm: ComputedRef<FarmData>) {
  provide(FARM_KEY, farm)
}

/** The current farm's data, kept live from the local database. */
export function useFarm(): ComputedRef<FarmData> {
  const farm = inject(FARM_KEY)
  if (!farm) {
    throw new Error('useFarm used outside the farm shell')
  }

  return farm
}

export function taskName(translate: TFunction, type: TaskType): string {
  return type.builtin && type.name === type.builtin
    ? translate(`task.${type.builtin}`)
    : type.name
}

export function chargeName(translate: TFunction, chargeType: ChargeType): string {
  return chargeType.builtin && chargeType.name === chargeType.builtin
    ? translate(`chargeType.${chargeType.builtin}`)
    : chargeType.name
}

export function locationName(translate: TFunction, location: StorageLocation): string {
  return location.builtin && location.name === location.builtin
    ? translate(`location.${location.builtin}`)
    : location.name
}

export function categoryName(translate: TFunction, category: Category): string {
  return category.builtin && category.name === category.builtin
    ? translate(`category.${category.builtin}`)
    : category.name
}
