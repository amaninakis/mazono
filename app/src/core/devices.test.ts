import { describe, expect, it } from 'vitest'
import { deviceName } from './devices'

describe('deviceName', () => {
  it('names common phones and computers', () => {
    const cases: [string, string | undefined, string | undefined][] = [
      [
        'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Chrome',
        'Android',
      ],
      [
        'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
        'Samsung Internet',
        'Android',
      ],
      [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        'Safari',
        'iPhone',
      ],
      [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Edge',
        'Windows',
      ],
      [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0',
        'Firefox',
        'Mac',
      ],
      ['', undefined, undefined],
    ]

    for (const [agent, browser, system] of cases) {
      expect(deviceName(agent)).toEqual({ browser, system })
    }
  })
})
