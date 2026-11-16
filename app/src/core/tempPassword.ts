/*
 * Suggested temporary passwords: two everyday Greek words in Latin letters and a number,
 * e.g. "elia-vouno-42". Easy to read out or write down, no keyboard switching on the phone,
 * and only used once (the person chooses their own at first sign-in).
 */
const WORDS = [
  'elia',
  'ladi',
  'dentro',
  'vouno',
  'ilios',
  'nero',
  'petra',
  'kladi',
  'karpos',

  'chorafi',
  'fyllo',
  'riza',
  'aloni',
  'ampeli',
  'kipos',
  'synnefo',
  'thalassa',
  'vrochi',
  'aeras',

  'chioni',
  'fengari',
  'asteri',
  'louloudi',
  'melissa',
  'kalathi',
  'skala',
  'dromos',
  'ryaki',
  'portokali',

  'lemoni',
]

/** `random(count)` returns a whole number from 0 to count − 1 (crypto-strong by default). */
export function suggestTemporaryPassword(
  random: (count: number) => number = cryptoRandom,
): string {
  const first = WORDS[random(WORDS.length)]
  let second = WORDS[random(WORDS.length)]
  if (second === first) {
    second = WORDS[(WORDS.indexOf(first) + 1) % WORDS.length]!
  }

  return `${first}-${second}-${10 + random(90)}`
}

function cryptoRandom(count: number): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)

  return value[0] % count
}
