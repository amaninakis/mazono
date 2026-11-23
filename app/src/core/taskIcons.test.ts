import { describe, expect, it } from 'vitest'
import { TASK_ICONS } from './defaults'
import { taskIconName } from './taskIcons'

describe('taskIconName', () => {
  it('has a line icon for every emoji the app offers', () => {
    for (const emoji of TASK_ICONS) {
      expect(taskIconName(emoji)).toBeTruthy()
    }
  })

  it('draws the harvest olive with our own icon', () => {
    expect(taskIconName('🫒')).toBe('mazono:olive')
  })

  it('finds scissors saved with or without the emoji mark', () => {
    expect(taskIconName('✂️')).toBe('lucide:scissors')
    expect(taskIconName('✂')).toBe('lucide:scissors')
  })

  it('leaves other emoji and empty values to be shown as they are', () => {
    expect(taskIconName('🍋')).toBeUndefined()
    expect(taskIconName('')).toBeUndefined()
    expect(taskIconName(undefined)).toBeUndefined()
  })
})
