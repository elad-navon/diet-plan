import { tokenize, tokensEquivalent, type SearchToken } from './normalize';
import { POPULAR_FOOD_IDS } from './popular';
import { type FoodRecord } from './types';

interface IndexEntry {
  food: FoodRecord;
  tokens: SearchToken[];
  nameLength: number;
  /** Score adjustment known in advance: popular foods up, dried / raw / powdered down. */
  prior: number;
}

export interface FoodIndex {
  readonly entries: readonly IndexEntry[];
}

/** Relevance weights (docs/PRODUCT_SPEC.md C.3: exact > prefix > contains; frequent foods first). */
export const SEARCH_SCORE = {
  exact: 3,
  prefix: 2,
  contains: 1,
  /** The name starts with the first query word. */
  startsWithQuery: 2,
  perUse: 0.5,
  maxUse: 3,
  /** Shorter, more generic names win ties against long specific ones. */
  perNameToken: 0.05,
  perNameCharacter: 0.002,
  /** A food from the curated everyday list. */
  popular: 3,
  /** Dried, powdered, raw/uncooked: rarely what someone logged, and easy to mistake for the cooked food. */
  unusualState: -1.5,
} as const;

/** Words marking a food in an unusual state. Compared on normalized tokens (final letters unified). */
const UNUSUAL_STATE_WORDS = new Set(
  [
    'מיובש',
    'מיובשת',
    'אבקה',
    'אבקת',
    'גולמי',
    'גולמית',
    'מרוכז',
    'מרוכזת',
    'קפוא',
    'קפואה',
    'יבש',
  ].flatMap((word) => tokenize(word).map((token) => token.raw)),
);
const NOT_WORD = tokenize('לא')[0]?.raw ?? '';
const COOKED_PREFIX = tokenize('מבושל')[0]?.raw.slice(0, 4) ?? '';

function statePrior(tokens: readonly SearchToken[]): number {
  for (const [i, token] of tokens.entries()) {
    if (UNUSUAL_STATE_WORDS.has(token.raw)) return SEARCH_SCORE.unusualState;
    // "לא מבושל" (uncooked): not the food people normally log.
    if (token.raw === NOT_WORD && tokens[i + 1]?.raw.startsWith(COOKED_PREFIX)) {
      return SEARCH_SCORE.unusualState;
    }
  }
  return 0;
}

export function buildFoodIndex(
  foods: readonly FoodRecord[],
  popularIds: ReadonlySet<string> = POPULAR_FOOD_IDS,
): FoodIndex {
  return {
    entries: foods.map((food) => {
      const tokens = tokenize(food.name);
      return {
        food,
        tokens,
        nameLength: food.name.length,
        prior: (popularIds.has(food.id) ? SEARCH_SCORE.popular : 0) + statePrior(tokens),
      };
    }),
  };
}

export interface SearchOptions {
  /** Maximum results (default 20). */
  limit?: number;
  /** How many times the user ate each food (by id): foods they eat often rank higher. */
  usage?: ReadonlyMap<string, number>;
}

const MIN_QUERY_LENGTH = 2;

function matchScore(query: SearchToken, tokens: readonly SearchToken[]): number {
  let best = 0;
  for (const token of tokens) {
    if (tokensEquivalent(query, token)) return SEARCH_SCORE.exact;
    if (token.raw.startsWith(query.raw)) {
      best = Math.max(best, SEARCH_SCORE.prefix);
    } else if (query.raw.length >= 3 && token.raw.includes(query.raw)) {
      best = Math.max(best, SEARCH_SCORE.contains);
    }
  }
  return best;
}

interface Scored {
  food: FoodRecord;
  score: number;
  nameLength: number;
}

function rank(scored: Scored[], limit: number): FoodRecord[] {
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.nameLength - b.nameLength ||
      a.food.name.localeCompare(b.food.name, 'he') ||
      a.food.id.localeCompare(b.food.id),
  );
  return scored.slice(0, limit).map((item) => item.food);
}

/**
 * Finds foods whose name contains every word of `query` (as whole words, word beginnings while
 * typing, or - for 3+ letters - anywhere inside a word). Number is ignored (ביצה = ביצים), as are
 * quote marks, niqqud and full/defective spelling (קוטג' = קוטג, עגבנייה = עגבניה). When no food matches
 * every word, foods matching some of the words are offered instead, best first. Deterministic: ties are
 * broken by name length, then name, then id.
 */
export function searchFoods(
  index: FoodIndex,
  query: string,
  options: SearchOptions = {},
): FoodRecord[] {
  const queryTokens = tokenize(query);
  const queryLength = queryTokens.reduce((sum, token) => sum + token.raw.length, 0);
  if (queryTokens.length === 0 || queryLength < MIN_QUERY_LENGTH) return [];
  const limit = options.limit ?? 20;

  const full: Scored[] = [];
  const partial: Scored[] = [];
  for (const entry of index.entries) {
    let score = 0;
    let matched = 0;
    for (const queryToken of queryTokens) {
      const tokenScore = matchScore(queryToken, entry.tokens);
      if (tokenScore > 0) {
        matched += 1;
        score += tokenScore;
      }
    }
    if (matched === 0) continue;

    const first = entry.tokens[0];
    const firstQuery = queryTokens[0];
    if (first && firstQuery && matchScore(firstQuery, [first]) >= SEARCH_SCORE.prefix) {
      score += SEARCH_SCORE.startsWithQuery;
    }
    score +=
      entry.prior -
      SEARCH_SCORE.perNameToken * entry.tokens.length -
      SEARCH_SCORE.perNameCharacter * entry.nameLength +
      Math.min(SEARCH_SCORE.maxUse, options.usage?.get(entry.food.id) ?? 0) * SEARCH_SCORE.perUse;

    const item = { food: entry.food, score, nameLength: entry.nameLength };
    (matched === queryTokens.length ? full : partial).push(item);
  }

  return rank(full.length > 0 || queryTokens.length < 2 ? full : partial, limit);
}
