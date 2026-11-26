/*
 * A plain name for a signed-in device, from the description its browser sends (the user
 * agent): which browser, on which kind of device. Only for showing; nothing depends on it.
 */

export interface DeviceName {
  /** e.g. Chrome, Safari, Firefox, Edge, Samsung Internet, or undefined when unknown. */
  browser?: string
  /** e.g. Android, iPhone, iPad, Windows, Mac, Linux, or undefined when unknown. */
  system?: string
}

/** Checked in order: the first match wins (Edge and Samsung Internet also say "Chrome"). */
const BROWSERS: [RegExp, string][] = [
  [/edg(?:e|a|ios)?\//i, 'Edge'],
  [/samsungbrowser\//i, 'Samsung Internet'],
  [/(?:opr|opera)\//i, 'Opera'],
  [/firefox\/|fxios\//i, 'Firefox'],
  [/chrome\/|crios\//i, 'Chrome'],
  [/safari\//i, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/iphone/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/android/i, 'Android'],
  [/windows/i, 'Windows'],
  [/macintosh|mac os x/i, 'Mac'],
  [/cros/i, 'ChromeOS'],
  [/linux/i, 'Linux'],
]

export function deviceName(userAgent: string): DeviceName {
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1],
    system: SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1],
  }
}
