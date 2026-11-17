/** The app's line icons, on a 24×24 grid. Drawn by AppIcon.vue. */
export type IconName =
  | 'today'
  | 'history'
  | 'oil'
  | 'money'
  | 'reports'
  | 'settings'
  | 'calendar'
  | 'trash'
  | 'transfer'
  | 'chevronLeft'
  | 'chevronRight'
  | 'archive'
  | 'user'
  | 'users'
  | 'fields'
  | 'sack'
  | 'tasks'
  | 'backup'
  | 'download'
  | 'restore'

/** Each icon as SVG path data on a 24×24 grid ("circle:cx,cy,r" for circles). */
export const ICONS: Record<IconName, string[]> = {
  today: ['circle:12,12,9', 'M12 8v8', 'M8 12h8'],
  history: [
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M16 3v4',
    'M8 3v4',
    'M3 10h18',
  ],
  oil: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'],
  money: ['M17 6.5A7 7 0 1 0 17 17.5', 'M4 10h9', 'M4 14h9'],
  reports: ['M3 20h18', 'M6 20v-7', 'M12 20V5', 'M18 20v-10'],
  settings: [
    'M4 7h10',
    'M18 7h2',
    'M4 12h3',
    'M11 12h9',
    'M4 17h12',
    'circle:16,7,2',
    'circle:9,12,2',
    'circle:18,17,2',
  ],
  calendar: [
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M16 3v4',
    'M8 3v4',
    'M3 10h18',
  ],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  transfer: ['M4 8h15', 'M16 5l3 3-3 3', 'M20 16H5', 'M8 13l-3 3 3 3'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  archive: [
    'M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M5 9v10h14V9',
    'M10 13h4',
  ],
  user: ['circle:12,8,4', 'M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  users: [
    'circle:9,8,3.5',
    'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
    'M16 4.6a3.5 3.5 0 0 1 0 6.8',
    'M18 14.3c1.8.7 3 2.9 3 5.7',
  ],
  fields: ['M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z', 'M9 4v13.5', 'M15 6.5V20'],
  sack: ['M7 8c0-2 2.2-4 5-4s5 2 5 4', 'M5 8h14l-1.5 12h-11z'],
  tasks: [
    'M9 6h11',
    'M9 12h11',
    'M9 18h11',
    'circle:4.5,6,1',
    'circle:4.5,12,1',
    'circle:4.5,18,1',
  ],
  restore: ['M4 12a8 8 0 1 0 2.3-5.7', 'M4 4v4h4'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  backup: [
    'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z',
    'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ],
}
