/**
 * Text for matching: lower case, no accents, Greek final sigma as σ ("Καλογρίδης" →
 * "καλογριδησ").
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('el')
    .replaceAll('ς', 'σ')
    .trim()
}

/**
 * Names that match what is being typed, ignoring case and accents: names that start with it
 * first, then names with a word that starts with it, then any other match. Keeps the given
 * order (most used first) within each group. The exact name already typed is left out.
 */
export function suggestNames(names: string[], typed: string, limit = 5): string[] {
  const query = searchKey(typed)
  if (!query) {
    return names.slice(0, limit)
  }
  const starts: string[] = []
  const wordStarts: string[] = []
  const contains: string[] = []
  for (const name of names) {
    const key = searchKey(name)
    if (key === query) {
      continue
    }
    if (key.startsWith(query)) {
      starts.push(name)
    } else if (key.split(/[\s\-.&/]+/).some((word) => word.startsWith(query))) {
      wordStarts.push(name)
    } else if (key.includes(query)) {
      contains.push(name)
    }
  }

  return [...starts, ...wordStarts, ...contains].slice(0, limit)
}
