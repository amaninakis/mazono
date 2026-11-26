import { MIN_PASSWORD_LENGTH } from './syncFormat.ts'

/*
 * Passwords that are too easy to guess. Checked on the phone (to say so straight away) and on
 * the server (which decides), whenever a new password is set. Works without internet: a short
 * list of the passwords tried first by anyone guessing, plus simple patterns.
 */

/** Passwords guessed first, whole (already in lower case). */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',

  '12341234',
  '11223344',
  '12121212',
  '123123123',
  '147258369',
  '159753456',
  '987654321',

  '1q2w3e4r',
  '1q2w3e4r5t',
  'q1w2e3r4',
  'qwertyui',
  'qwertyuiop',
  'asdfghjk',
  'asdfghjkl',

  'zxcvbnm1',
  'qazwsxedc',
  '1qaz2wsx',
  'zaq12wsx',
  'iloveyou',
  'trustno1',
  'sunshine',

  'princess',
  'football',
  'baseball',
  'superman',
  'starwars',
  'whatever',
  'computer',

  'internet',
  'letmein1',
  'welcome1',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'changeme',

  'abcd1234',
  'aa123456',
  'qwerty123',
  'qwerty12',
  'asdf1234',
  'zaq1zaq1',
  'michael1',

  'jennifer',
  'password',
  'password1',
  'password12',
  'password123',
  'admin123',

  'administrator',
  'qwertyuiop123',
  'aaaaaaaa',
  'abcdefgh',

  'abcdefg1',
])

/**
 * Words that are guessed with a number or sign after them ("elies2024", "kodikos!"): common
 * English and Greek words (in Greek and Latin letters), and words about the app and olives.
 */
const COMMON_WORDS = new Set([
  // English
  'password',
  'passw0rd',
  'pass',
  'admin',
  'administrator',
  'welcome',
  'letmein',

  'qwerty',
  'qwertz',
  'azerty',
  'abc',
  'abcd',
  'love',
  'iloveyou',
  'monkey',
  'dragon',

  'master',
  'secret',
  'summer',
  'winter',
  'spring',
  'autumn',
  'football',
  'hello',
  'freedom',

  'shadow',
  'sunshine',
  'princess',
  'olive',
  'olives',
  'oliveoil',
  'harvest',
  'farm',
  'farmer',

  'user',
  'test',
  'guest',
  'login',
  'default',

  'changeme',
  // Greek, in Latin letters
  'kodikos',
  'kwdikos',
  'agapi',
  'agaph',
  'kalimera',
  'kalinixta',
  'ellada',

  'hellas',
  'elia',
  'elies',
  'elaia',
  'elaies',
  'ladi',
  'elaiolado',
  'eleolado',
  'mazono',

  'mazwnw',
  'mazoma',
  'xorafi',
  'chorafi',
  'kriti',
  'crete',
  'chania',
  'xania',

  'irakleio',
  'heraklion',
  'rethymno',
  'agios',
  'panagia',
  'giorgos',
  'yiorgos',
  'maria',

  'eleni',
  'nikos',
  'kostas',
  'giannis',
  'dimitris',
  'manolis',
  'olympiakos',

  'olympiacos',
  'panathinaikos',
  'pao',
  'paok',
  'aek',
  'ofi',

  'thira',
  // Greek
  'κωδικός',
  'κωδικος',
  'αγάπη',
  'αγαπη',
  'καλημέρα',
  'καλημερα',
  'ελλάδα',

  'ελλαδα',
  'ελιά',
  'ελια',
  'ελιές',
  'ελιες',
  'λάδι',
  'λαδι',
  'ελαιόλαδο',
  'ελαιολαδο',

  'μαζώνω',
  'μαζωνω',
  'χωράφι',
  'χωραφι',
  'κρήτη',
  'κρητη',
  'χανιά',
  'χανια',
  'ηράκλειο',

  'ηρακλειο',
  'mazono123',
])

export type PasswordProblem = 'password-short' | 'password-common'

/**
 * What is wrong with a new password, or undefined when it is fine: too short, or easy to
 * guess (on the list; a common word with only numbers or signs added; the user name; one
 * character or a short pattern repeated; a run such as 12345678 or abcdefgh).
 */
export function passwordProblem(password: string, username = ''): PasswordProblem | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'password-short'
  }
  const lower = password.toLowerCase()
  const name = username.trim().toLowerCase()
  const word = lower.replace(/\P{L}+$/u, '').replace(/^\P{L}+/u, '')
  if (
    COMMON_PASSWORDS.has(lower) ||
    COMMON_WORDS.has(lower) ||
    (word.length >= 3 && COMMON_WORDS.has(word)) ||
    (name.length >= 3 && (lower.includes(name) || word === name)) ||
    isRepeated(lower) ||
    isRun(lower)
  ) {
    return 'password-common'
  }

  return undefined
}

/** One character or a short pattern over and over: "aaaaaaaa", "abcabcab", "12121212". */
function isRepeated(text: string): boolean {
  for (let size = 1; size <= 3; size++) {
    const pattern = text.slice(0, size)
    if (pattern.repeat(Math.ceil(text.length / size)).startsWith(text)) {
      return true
    }
  }

  return false
}

/** Each character one after the previous, up or down: "12345678", "hgfedcba". */
function isRun(text: string): boolean {
  const codes = [...text].map((character) => character.codePointAt(0)!)
  const step = codes[1] - codes[0]
  if (Math.abs(step) !== 1) {
    return false
  }

  return codes.every((code, index) => index === 0 || code - codes[index - 1] === step)
}
