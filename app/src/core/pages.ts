/**
 * Which bottom-menu tab a page belongs to, by its path: a tab's own pages and the pages opened
 * from it ("/oil/new" is the Oil tab's, "/settings/fields" the Settings tab's). The home tab
 * ("/") also owns the pages opened from the home page: the task form ("/new", "/entry/…") and,
 * when it has no tab of its own, the journal. -1 when none of `tabs` fits.
 */
export function tabOf(path: string, tabs: string[]) {
  const own = tabs.findIndex(
    (tab) => tab !== '/' && (path === tab || path.startsWith(`${tab}/`)),
  )
  if (own !== -1) {
    return own
  }

  const fromHome =
    path === '/' ||
    path === '/new' ||
    path.startsWith('/entry/') ||
    path.startsWith('/journal')

  return fromHome ? tabs.indexOf('/') : -1
}

/** The tab `step` away (-1 the one before, +1 the one after), or undefined past either end. */
export function neighbourTab(path: string, tabs: string[], step: -1 | 1) {
  const index = tabOf(path, tabs)
  return index === -1 ? undefined : tabs[index + step]
}
