/**
 * Task types keep the emoji they were saved with (in the database, backups and sync), so
 * nothing needs converting. The app draws each one as a line icon in the same style as the
 * rest of the app; an emoji without an icon is shown as it is.
 */
export const TASK_ICON_NAMES: Record<string, string> = {
  '🫒': 'mazono:olive',
  '✂️': 'lucide:scissors',
  '🧪': 'lucide:flask-conical',
  '🌿': 'lucide:sprout',
  '💧': 'lucide:droplet',
  '🚜': 'lucide:tractor',
  '🔥': 'lucide:flame',
  '🐛': 'lucide:bug',
  '🪓': 'lucide:axe',
  '📋': 'lucide:clipboard-list',
}

/** The line icon for a task type's saved emoji, or undefined to show the emoji itself. */
export function taskIconName(saved: string | undefined): string | undefined {
  if (!saved) {
    return undefined
  }

  // Some phones save ✂ without the "show as emoji" mark (U+FE0F), others with it.
  return TASK_ICON_NAMES[saved] ?? TASK_ICON_NAMES[`${saved.replace(/️/g, '')}️`]
}
