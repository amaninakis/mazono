/**
 * Domain types shared by the UI, the local database and (later) the sync server.
 * Every record carries `farmId` so one installation can host many farms.
 * Quantities are stored in base units; formatting happens only in the UI.
 */

export type ISODate = string // 'YYYY-MM-DD'

export interface BaseRecord {
  id: string // UUID, created on the device so records can be made offline
  farmId: string
  updatedAt: number // ms epoch, used by sync later
  deletedAt?: number // soft delete, so deletions can sync
}

export interface Farm {
  id: string
  name: string
  createdAt: number
}

export type YieldFormat = 'ratio' | 'percent'
export type Language = 'en' | 'el'
/** Date and number style: Greek (15/11/2026, 1.234,5), British, American, or detected. */
export type DateFormat = 'auto' | 'GR' | 'GB' | 'US'

export interface FarmSettings {
  farmId: string
  language: Language
  yieldFormat: YieldFormat
  dateFormat?: DateFormat
  /** Optional tax estimate, % of a positive net result. */
  taxPercent?: number
  seasonStartMonth: number // 1-12, default 10 (October)
  labourEnabled: boolean
  setupDone: boolean
}

export interface Field extends BaseRecord {
  name: string
  trees: number // 0 = unknown
  notes?: string
  archived: boolean
  order: number
}

export interface Unit extends BaseRecord {
  name: string
  /** Plural form, used for amounts above one ("8,5 τσουβάλια"). Optional. */
  pluralName?: string
  /** Optional user estimate in kg. The app will refine it from extractions (v0.2). */
  approxKg?: number
  isDefault: boolean
  archived: boolean
}

/** How a task type collects its data. */
export type InputKind = 'harvest' | 'trees' | 'quantity' | 'done'

export type BuiltinTask = 'harvest' | 'pruning' | 'fertilizer' | 'weeding'

export interface TaskType extends BaseRecord {
  /** Set for the four built-in types; their name comes from translations. */
  builtin?: BuiltinTask
  name: string // used for custom types (and as fallback)
  color: string
  icon: string
  inputKind: InputKind
  activeMonths: number[] // 1-12
  archived: boolean
  order: number
}

export interface UnitAmount {
  unitId: string
  amount: number
}

export interface TaskEntry extends BaseRecord {
  date: ISODate
  fieldId: string
  taskTypeId: string
  trees?: number // harvest, pruning, quantity kinds
  quantities?: UnitAmount[] // harvest kind
  product?: string // quantity kind
  amount?: number // quantity kind
  amountUnit?: string // quantity kind: kg, bags, L
  fieldFinished: boolean
  workers?: number // labour module
  hours?: number // labour module
  notes?: string
}

/* ---------- v0.2: mill, oil and stock ---------- */

export type BuiltinCharge = 'millFee' | 'bugSpraying' | 'vat'

/** A charge the mill keeps in oil (mill fee, bug spraying, VAT…). */
export interface ChargeType extends BaseRecord {
  builtin?: BuiltinCharge
  name: string
  /** % of the oil extracted, used to pre-fill the kg. Optional. */
  defaultPercent?: number
  archived: boolean
  order: number
}

export type BuiltinLocation = 'mill' | 'home'

/** Where oil is kept (at the mill, at home…). */
export interface StorageLocation extends BaseRecord {
  builtin?: BuiltinLocation
  name: string
  archived: boolean
  order: number
}

export interface Mill extends BaseRecord {
  name: string
  archived: boolean
}

export interface ChargeAmount {
  chargeTypeId: string
  kg: number
}

export interface StoredAmount {
  locationId: string
  kg: number
}

/** Part (or all) of a harvest entry's units that went into an extraction. */
export interface Allocation {
  entryId: string
  quantities: UnitAmount[]
}

/** One mill visit. Its stored oil is the stock coming in, tagged with the season (vintage). */
export interface Extraction extends BaseRecord {
  date: ISODate
  millId?: string
  receiptNo?: string
  oliveKg: number
  oilKg: number
  acidity?: number
  charges: ChargeAmount[]
  storage: StoredAmount[]
  allocations: Allocation[]
  notes?: string
}

export type StockMovementKind = 'transfer' | 'ownUse' | 'sale'

/** Oil leaving a location (own use, sale) or moving between locations. */
export interface StockMovement extends BaseRecord {
  date: ISODate
  /** Season start year of the oil (its vintage). */
  vintage: number
  kind: StockMovementKind
  fromLocationId: string
  toLocationId?: string // transfers only
  kg: number
  notes?: string
}

/* ---------- v0.3: money ---------- */

export type TransactionKind = 'expense' | 'sale' | 'income'

export type BuiltinCategory =
  | 'fuel'
  | 'supplies'
  | 'equipment'
  | 'labour'
  | 'transport'
  | 'otherExpense'
  | 'subsidy'
  | 'vatRefund'
  | 'otherIncome'

/** Expense or income category (sales need none). */
export interface Category extends BaseRecord {
  kind: 'expense' | 'income'
  builtin?: BuiltinCategory
  name: string
  archived: boolean
  order: number
}

/** Money in or out. An oil sale also takes its kg out of stock. */
export interface Transaction extends BaseRecord {
  date: ISODate
  kind: TransactionKind
  /** Business, buyer or source, e.g. "Kalogridis fuel", "Agrocoop", "ΟΠΕΚΕΠΕ". */
  party: string
  categoryId?: string
  /** Euros. For a sale: the money received, i.e. kg × price per kg minus any fee. */
  amount: number
  // sales
  kg?: number
  pricePerKg?: number
  /** Fee kept from a sale (e.g. the mill's 1% transaction fee), in euros. */
  fee?: number
  /** Set when the fee was entered as a percentage of kg × price. */
  feePercent?: number
  vintage?: number
  locationId?: string
  // expenses
  invoiceNo?: string
  fieldId?: string
  notes?: string
}
