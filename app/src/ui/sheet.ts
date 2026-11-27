import { ref } from 'vue'

/**
 * The task form opens as a sheet sliding up over the page it was opened from, so it is plain
 * that it sits on top of the pages and closes back to it. These are the addresses shown that
 * way, and the page beneath (its full address), set by App.vue and used by the form to close.
 */
export function isSheetPath(path: string) {
  return path === '/new' || path.startsWith('/entry/')
}

/** The page under the sheet, and where closing it goes: the home page when opened directly. */
export const sheetBackdrop = ref('/')
