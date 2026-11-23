/**
 * The app's icons: Lucide (https://lucide.dev) line icons, bundled into the app at build time
 * by Nuxt Icon's Vite plugin (vite.config.ts), so they work offline and look the same on every
 * phone. `mazono:` icons are our own, drawn in the same style in `src/assets/icons/`.
 */
export const ICONS = {
  today: 'lucide:circle-plus',
  history: 'lucide:calendar-days',
  oil: 'lucide:droplet',
  money: 'lucide:euro',
  reports: 'lucide:chart-column',
  settings: 'lucide:sliders-horizontal',
  calendar: 'lucide:calendar',
  clear: 'lucide:x',
  plus: 'lucide:plus',
  trash: 'lucide:trash-2',
  transfer: 'lucide:arrow-right-left',
  chevronLeft: 'lucide:chevron-left',
  chevronRight: 'lucide:chevron-right',
  archive: 'lucide:archive',
  restore: 'lucide:archive-restore',
  user: 'lucide:user',
  users: 'lucide:users',
  fields: 'lucide:map',
  sack: 'mazono:sack',
  tasks: 'lucide:list-checks',
  backup: 'lucide:database-backup',
  download: 'lucide:download',
} as const

export type IconName = keyof typeof ICONS
