/**
 * Which bottom-menu tab a page belongs to, by its path: a tab's own pages and the pages opened
 * from it ("/oil/new" is the Oil tab's, "/settings/fields" the Settings tab's), and editing a
 * task ("/entry/…") is the "/" tab's. -1 when none of `tabs` fits.
 */
export function tabOf(path: string, tabs: string[]) {
  const own = tabs.findIndex(
    (tab) => tab !== '/' && (path === tab || path.startsWith(`${tab}/`)),
  )
  if (own !== -1) {
    return own
  }

  return path === '/' || path.startsWith('/entry/') ? tabs.indexOf('/') : -1
}

/** The tab `step` away (-1 the one before, +1 the one after), or undefined past either end. */
export function neighbourTab(path: string, tabs: string[], step: -1 | 1) {
  const index = tabOf(path, tabs)
  return index === -1 ? undefined : tabs[index + step]
}
