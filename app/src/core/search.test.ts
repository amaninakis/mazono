import { describe, expect, it } from 'vitest'
import { searchKey, suggestNames } from './search'

const names = [
  'ΚΑΛΟΓΡΙΔΗΣ',
  'Αγροτικός Συνεταιρισμός',
  'Kalogridis Fuel',
  'Ελαιουργείο Καλού',
  'ΟΠΕΚΕΠΕ',
]

describe('searchKey', () => {
  it('ignores case, accents and final sigma', () => {
    expect(searchKey(' Καλογρίδης ')).toBe('καλογριδησ')
    expect(searchKey('ΚΑΛΟΓΡΙΔΗΣ')).toBe('καλογριδησ')
  })
})

describe('suggestNames', () => {
  it('matches without caring about accents or capitals', () => {
    expect(suggestNames(names, 'καλογ')).toEqual(['ΚΑΛΟΓΡΙΔΗΣ'])
    expect(suggestNames(names, 'συνετ')).toEqual(['Αγροτικός Συνεταιρισμός'])
  })

  it('puts names that start with the text first, then word starts, then the rest', () => {
    expect(suggestNames(['Ελαιουργείο Καλού', 'Καλού Α.Ε.', 'Μικαλου'], 'καλου')).toEqual([
      'Καλού Α.Ε.',
      'Ελαιουργείο Καλού',
      'Μικαλου',
    ])
  })

  it('shows the most used names when nothing is typed, and hides an exact match', () => {
    expect(suggestNames(names, '', 2)).toEqual(['ΚΑΛΟΓΡΙΔΗΣ', 'Αγροτικός Συνεταιρισμός'])
    expect(suggestNames(names, 'οπεκεπε')).toEqual([])
  })
})
