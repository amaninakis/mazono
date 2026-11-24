import type { InjectionKey } from 'vue'

/**
 * Set for a page drawn beside the current one while swiping between pages: it is only looked
 * at, so it must not save anything (drafts) or react as if it were open.
 */
export const PAGE_PREVIEW: InjectionKey<boolean> = Symbol('page preview')
