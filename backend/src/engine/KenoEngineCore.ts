// ---------------------------------------------------------------------------
// Keno — Core Game Rules (single-player wager variant)
//
// - The board is numbers 1–80
// - The player picks between 1 and 10 numbers ("spots")
// - The house draws 20 numbers at random (no replacement)
// - Wins are based on how many of the player's picks match the draw ("catches")
// - Payout = bet × paytable[spotsPicked][catches]
//
// Kept free of DB / socket dependencies so it can be unit-tested directly,
// mirroring the pure-logic pattern of ProbabilityEngine.ts. The room-based
// multiplayer Keno lives in ./KenoEngine (class KenoEngine).
// ---------------------------------------------------------------------------

export const KENO_TOTAL_NUMBERS = 80;
export const KENO_NUM_DRAWS = 20;
export const KENO_MIN_PICKS = 1;
export const KENO_MAX_PICKS = 10;

// Standard Keno multiplier paytable: spotsPicked -> catches -> multiplier.
// Missing entries pay 0 (no win), e.g. 10 spots with 0–2 catches.
export const KENO_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 1: 1, 2: 12 },
  3: { 2: 3, 3: 43 },
  4: { 2: 2, 3: 20, 4: 150 },
  5: { 2: 1, 3: 6, 4: 100, 5: 800 },
  6: { 2: 1, 3: 6, 4: 50, 5: 350, 6: 1500 },
  7: { 3: 2, 4: 20, 5: 100, 6: 800, 7: 5000 },
  8: { 3: 2, 4: 15, 5: 100, 6: 500, 7: 2500, 8: 10000 },
  9: { 3: 1, 4: 5, 5: 40, 6: 200, 7: 1000, 8: 5000, 9: 20000 },
  10: { 3: 1, 4: 4, 5: 20, 6: 100, 7: 400, 8: 2000, 9: 10000, 10: 50000 },
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Draws `count` unique numbers from the inclusive range [min, max].
 * Same pattern as the private helper used by BingoEngine.generateBingoGrid.
 */
const getRandomUniqueNumbers = (min: number, max: number, count: number): number[] => {
  const poolSize = max - min + 1;
  if (!Number.isInteger(count) || count < 0 || count > poolSize) {
    throw new Error(`Cannot draw ${count} unique numbers from a pool of ${poolSize}.`);
  }
  const pool = Array.from({ length: poolSize }, (_, i) => min + i);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
};

/** Returns the full Keno board: numbers 1–80. */
export const generateKenoBoard = (): number[] =>
  Array.from({ length: KENO_TOTAL_NUMBERS }, (_, i) => i + 1);

/** Draws `count` (default 20) unique winning numbers from 1–80. */
export const drawKenoNumbers = (count: number = KENO_NUM_DRAWS): number[] =>
  getRandomUniqueNumbers(1, KENO_TOTAL_NUMBERS, count);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface KenoPickValidation {
  valid: boolean;
  error?: string;
}

/** Validates a set of picks: 1–10 unique integers in the range 1–80. */
export const validateKenoPicks = (picks: number[]): KenoPickValidation => {
  if (!Array.isArray(picks) || picks.length < KENO_MIN_PICKS) {
    return { valid: false, error: `You must pick at least ${KENO_MIN_PICKS} number.` };
  }
  if (picks.length > KENO_MAX_PICKS) {
    return { valid: false, error: `You can pick at most ${KENO_MAX_PICKS} numbers.` };
  }
  if (new Set(picks).size !== picks.length) {
    return { valid: false, error: 'Duplicate numbers are not allowed.' };
  }
  for (const n of picks) {
    if (!Number.isInteger(n) || n < 1 || n > KENO_TOTAL_NUMBERS) {
      return { valid: false, error: `Numbers must be integers between 1 and ${KENO_TOTAL_NUMBERS}.` };
    }
  }
  return { valid: true };
};

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/** Counts how many of the player's picks appear in the drawn numbers. */
export const countKenoMatches = (picks: number[], drawn: number[]): number => {
  const drawnSet = new Set(drawn);
  return picks.filter((n) => drawnSet.has(n)).length;
};

/** Returns the payout multiplier for a given number of spots and catches (0 = loss). */
export const getKenoPayoutMultiplier = (pickCount: number, matches: number): number =>
  KENO_PAYTABLE[pickCount]?.[matches] || 0;

export interface KenoSettleResult {
  bet: number;
  picks: number[];
  drawn: number[];
  matches: number;
  multiplier: number;
  payout: number; // bet × multiplier (0 on a loss — bet is kept by the house)
  isWin: boolean;
}

/** Resolves a Keno round: counts matches and computes the payout. */
export const settleKenoRound = (bet: number, picks: number[], drawn: number[]): KenoSettleResult => {
  const matches = countKenoMatches(picks, drawn);
  const multiplier = getKenoPayoutMultiplier(picks.length, matches);
  return {
    bet,
    picks: [...picks],
    drawn: [...drawn],
    matches,
    multiplier,
    payout: multiplier * bet,
    isWin: multiplier > 0,
  };
};

// ---------------------------------------------------------------------------
// KenoGame — single-round lifecycle (pure/in-memory state machine)
// ---------------------------------------------------------------------------

export type KenoGameState = 'WAITING_FOR_PICKS' | 'DRAWING' | 'SETTLED';

export class KenoGame {
  public state: KenoGameState = 'WAITING_FOR_PICKS';
  public bet: number;
  public picks: number[] = [];
  public drawn: number[] = [];
  public result: KenoSettleResult | null = null;

  constructor(bet: number) {
    if (!Number.isFinite(bet) || bet <= 0) {
      throw new Error('Bet must be a positive number.');
    }
    this.bet = bet;
  }

  /** Locks in the player's picks. Only allowed before the draw starts. */
  public placePicks(picks: number[]): void {
    if (this.state !== 'WAITING_FOR_PICKS') {
      throw new Error('Cannot change picks once the draw has started.');
    }
    const validation = validateKenoPicks(picks);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    this.picks = [...picks];
  }

  /** Performs the random draw of winning numbers. */
  public draw(count: number = KENO_NUM_DRAWS): number[] {
    if (this.state !== 'WAITING_FOR_PICKS') {
      throw new Error('Draw has already been made.');
    }
    if (this.picks.length === 0) {
      throw new Error('Place your picks before drawing.');
    }
    const drawn = drawKenoNumbers(count); // throws before any state change on invalid count
    this.state = 'DRAWING';
    this.drawn = drawn;
    return this.drawn;
  }

  /** Settles the round and returns the final result (idempotent). */
  public settle(): KenoSettleResult {
    if (this.state === 'WAITING_FOR_PICKS') {
      throw new Error('Draw numbers before settling.');
    }
    if (this.state === 'SETTLED' && this.result) {
      return this.result;
    }
    this.result = settleKenoRound(this.bet, this.picks, this.drawn);
    this.state = 'SETTLED';
    return this.result;
  }
}
