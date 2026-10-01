const NIQQUD = /[֑-ׇ]/g;
/** Apostrophes, geresh and gershayim in all their keyboard variants - dropped, so "קוטג'" = "קוטג". */
const QUOTES = /["'`´׳״‘’“”]/g;
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/gu;

const FINAL_TO_REGULAR: Record<string, string> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

export interface SearchToken {
  /** The word as normalized (final letters unified, repeated י/ו collapsed); used for prefix matching. */
  raw: string;
  /** For a plural ending in ים/ות: the word without that ending (ביצים -> ביצ). Otherwise empty. */
  plural: string;
  /** For a word ending in ה: the word without it (ביצה -> ביצ), to pair it with its plural. Otherwise empty. */
  singularBase: string;
}

const unifyFinalLetters = (word: string): string =>
  word.replace(/[ךםןףץ]/g, (letter) => FINAL_TO_REGULAR[letter] ?? letter);

/** Spelling varies between full and defective writing (עגבנייה/עגבניה): collapse repeated י and ו. */
const collapseRepeatedVowelLetters = (word: string): string =>
  word.replace(/י{2,}/g, 'י').replace(/ו{2,}/g, 'ו');

const isHebrewWord = (word: string): boolean => /^[א-ת]+$/.test(word);

function toToken(word: string): SearchToken {
  const raw = unifyFinalLetters(collapseRepeatedVowelLetters(word));
  let plural = '';
  let singularBase = '';
  if (isHebrewWord(raw) && raw.length >= 4) {
    if (raw.endsWith('ימ') || raw.endsWith('ות')) plural = raw.slice(0, -2);
    else if (raw.endsWith('ה')) singularBase = raw.slice(0, -1);
  }
  return { raw, plural, singularBase };
}

/**
 * Splits text into comparable tokens: no niqqud, no quote marks, punctuation as separators,
 * Latin lower-cased, final letters unified (ם = מ).
 */
export function tokenize(text: string): SearchToken[] {
  return text
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(QUOTES, '')
    .toLowerCase()
    .split(NOT_LETTER_OR_DIGIT)
    .filter((word) => word.length > 0)
    .map(toToken);
}

/**
 * Same word, allowing for number: ביצה = ביצים, פיתה = פיתות, תפוח = תפוחים. A word is deliberately
 * NOT equal to its "ה" form (חלב is milk, חלבה is halva).
 */
export function tokensEquivalent(a: SearchToken, b: SearchToken): boolean {
  if (a.raw === b.raw) return true;
  if (
    a.plural !== '' &&
    (a.plural === b.plural || a.plural === b.raw || a.plural === b.singularBase)
  ) {
    return true;
  }
  return b.plural !== '' && (b.plural === a.raw || b.plural === a.singularBase);
}

/** The whole text as one normalized string (tokens joined by single spaces). */
export function normalizeHebrew(text: string): string {
  return tokenize(text)
    .map((token) => token.raw)
    .join(' ');
}
