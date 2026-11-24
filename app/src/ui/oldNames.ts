import { renamedSettingKey } from '../core/names'

/**
 * Settings this phone saved before the app was renamed (the language, unsaved form drafts)
 * move to their new names, once, before anything reads them. Each is copied first and only
 * then removed, so nothing is lost if the phone stops halfway.
 */
export function moveOldSettings() {
  let storage: Storage
  try {
    storage = window.localStorage
  } catch {
    return // storage blocked (e.g. some private modes): nothing was saved either
  }

  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
  for (const key of keys) {
    const renamed = key ? renamedSettingKey(key) : undefined
    const value = key ? storage.getItem(key) : null
    if (!key || !renamed || value == null) {
      continue
    }

    try {
      if (storage.getItem(renamed) == null) {
        storage.setItem(renamed, value)
      }
      storage.removeItem(key)
    } catch {
      // Storage full: keep the old one, it is still read next time.
    }
  }
}

moveOldSettings()
