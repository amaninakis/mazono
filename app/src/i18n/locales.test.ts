import { describe, expect, it } from 'vitest';
import el from './locales/el.json';
import en from './locales/en.json';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('translations', () => {
  it('Greek has exactly the same keys as English', () => {
    expect(keys(el).sort()).toEqual(keys(en).sort());
  });
});
