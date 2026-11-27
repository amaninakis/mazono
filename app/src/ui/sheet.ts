import { ref } from 'vue'

/**
 * The entry forms (work, a production, money) open as a sheet sliding up over the page they
 * were opened from, so it is plain that they sit on top of the pages and close back to it.
 * These are the addresses shown that way, and the page beneath (its full address), set by
 * App.vue and used by the forms to close.
 */
export function isSheetPath(path: string) {
  return (
    path === '/new' ||
    path.startsWith('/entry/') ||
    path.startsWith('/oil/') ||
    path.startsWith('/money/')
  )
}

/** The page a form opened directly (a link, a reload) sits over: its own tab. */
export function sheetParent(path: string) {
  if (path.startsWith('/oil/')) {
    return '/oil'
  }

  return path.startsWith('/money/') ? '/money' : '/'
}

/** The page under the sheet, and where closing it goes. */
export const sheetBackdrop = ref('/')
