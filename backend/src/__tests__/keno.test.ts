import {
  KENO_TOTAL_NUMBERS,
  KENO_NUM_DRAWS,
  KENO_MIN_PICKS,
  KENO_MAX_PICKS,
  generateKenoBoard,
  drawKenoNumbers,
  validateKenoPicks,
  countKenoMatches,
  getKenoPayoutMultiplier,
  settleKenoRound,
  KenoGame,
} from '../engine/KenoEngineCore';

// ---------------------------------------------------------------------------
// generateKenoBoard
// ---------------------------------------------------------------------------
describe('generateKenoBoard', () => {
  it('should return 80 numbers (1-80)', () => {
    const board = generateKenoBoard();
    expect(board.length).toBe(KENO_TOTAL_NUMBERS);
    expect(board).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  });

  it('should only contain integers in the range 1-80', () => {
    const board = generateKenoBoard();
    for (const n of board) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(80);
    }
  });

  it('should contain each number exactly once', () => {
    const board = generateKenoBoard();
    expect(new Set(board).size).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// drawKenoNumbers
// ---------------------------------------------------------------------------
describe('drawKenoNumbers', () => {
  it('should draw 20 unique numbers by default', () => {
    const drawn = drawKenoNumbers();
    expect(drawn.length).toBe(KENO_NUM_DRAWS);
    expect(new Set(drawn).size).toBe(KENO_NUM_DRAWS);
  });

  it('should respect a custom draw count', () => {
    const drawn = drawKenoNumbers(5);
    expect(drawn.length).toBe(5);
  });

  it('should only draw numbers within the board range', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const drawn = drawKenoNumbers();
      for (const n of drawn) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(80);
      }
    }
  });

  it('should never draw the same number twice across attempts', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const drawn = drawKenoNumbers();
      const unique = new Set(drawn);
      expect(unique.size).toBe(drawn.length);
    }
  });

  it('should draw all numbers when count equals the board size', () => {
    const drawn = drawKenoNumbers(KENO_TOTAL_NUMBERS);
    expect(drawn.sort((a, b) => a - b)).toEqual(
      Array.from({ length: KENO_TOTAL_NUMBERS }, (_, i) => i + 1)
    );
  });

  it('should throw when the draw count exceeds the board size', () => {
    expect(() => drawKenoNumbers(KENO_TOTAL_NUMBERS + 1)).toThrow('unique numbers');
  });

  it('should throw on a negative draw count', () => {
    expect(() => drawKenoNumbers(-1)).toThrow('unique numbers');
  });
});

// ---------------------------------------------------------------------------
// validateKenoPicks
// ---------------------------------------------------------------------------
describe('validateKenoPicks', () => {
  it('should accept a single pick', () => {
    expect(validateKenoPicks([42])).toEqual({ valid: true });
  });

  it('should accept the maximum of 10 picks', () => {
    const picks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(validateKenoPicks(picks)).toEqual({ valid: true });
  });

  it('should reject an empty array', () => {
    const result = validateKenoPicks([]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`at least ${KENO_MIN_PICKS}`);
  });

  it('should reject more than 10 picks', () => {
    const picks = Array.from({ length: KENO_MAX_PICKS + 1 }, (_, i) => i + 1);
    const result = validateKenoPicks(picks);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`at most ${KENO_MAX_PICKS}`);
  });

  it('should reject duplicate numbers', () => {
    const result = validateKenoPicks([7, 7, 9]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  it('should reject numbers outside the board range', () => {
    expect(validateKenoPicks([0]).valid).toBe(false);
    expect(validateKenoPicks([81]).valid).toBe(false);
    expect(validateKenoPicks([-5]).valid).toBe(false);
  });

  it('should reject non-integer values', () => {
    const result = validateKenoPicks([1.5, 2]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('integers');
  });

  it('should reject non-array input', () => {
    expect(validateKenoPicks(undefined as any).valid).toBe(false);
    expect(validateKenoPicks('not-an-array' as any).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countKenoMatches
// ---------------------------------------------------------------------------
describe('countKenoMatches', () => {
  it('should count matching picks', () => {
    expect(countKenoMatches([1, 2, 3], [2, 3, 4, 5])).toBe(2);
  });

  it('should return 0 when nothing matches', () => {
    expect(countKenoMatches([1, 2], [3, 4, 5])).toBe(0);
  });

  it('should return the full pick count when everything matches', () => {
    expect(countKenoMatches([10, 20, 30], [30, 20, 10])).toBe(3);
  });

  it('should be order-independent', () => {
    expect(countKenoMatches([3, 1, 2], [2, 1, 3, 9])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getKenoPayoutMultiplier
// ---------------------------------------------------------------------------
describe('getKenoPayoutMultiplier', () => {
  it('should pay 3x for a single spot hit', () => {
    expect(getKenoPayoutMultiplier(1, 1)).toBe(3);
  });

  it('should pay 0 for a single spot miss', () => {
    expect(getKenoPayoutMultiplier(1, 0)).toBe(0);
  });

  it('should pay the jackpot for 10/10', () => {
    expect(getKenoPayoutMultiplier(10, 10)).toBe(50000);
  });

  it('should pay 0 when catches fall below the paytable threshold', () => {
    expect(getKenoPayoutMultiplier(10, 2)).toBe(0);
    expect(getKenoPayoutMultiplier(7, 2)).toBe(0);
    expect(getKenoPayoutMultiplier(3, 1)).toBe(0);
  });

  it('should pay 1x for 10 spots with 3 catches', () => {
    expect(getKenoPayoutMultiplier(10, 3)).toBe(1);
  });

  it('should return 0 for an unknown spot count', () => {
    expect(getKenoPayoutMultiplier(0, 0)).toBe(0);
    expect(getKenoPayoutMultiplier(11, 5)).toBe(0);
  });

  it('should return 0 for catches above the spot count', () => {
    expect(getKenoPayoutMultiplier(5, 6)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// settleKenoRound
// ---------------------------------------------------------------------------
describe('settleKenoRound', () => {
  it('should compute the payout for a winning round', () => {
    const result = settleKenoRound(2, [1, 2, 3], [1, 2, 50, 60]);
    expect(result.matches).toBe(2);
    expect(result.multiplier).toBe(3); // 3 spots, 2 catches
    expect(result.payout).toBe(6);
    expect(result.isWin).toBe(true);
  });

  it('should return a zero payout for a losing round', () => {
    const result = settleKenoRound(5, [1, 2], [10, 11, 12]);
    expect(result.matches).toBe(0);
    expect(result.multiplier).toBe(0);
    expect(result.payout).toBe(0);
    expect(result.isWin).toBe(false);
  });

  it('should preserve the bet and the picks/drawn arrays', () => {
    const result = settleKenoRound(1.5, [7, 8], [7, 9]);
    expect(result.bet).toBe(1.5);
    expect(result.picks).toEqual([7, 8]);
    expect(result.drawn).toEqual([7, 9]);
  });

  it('should not mutate the input arrays', () => {
    const picks = [1, 2];
    const drawn = [1, 3];
    settleKenoRound(1, picks, drawn);
    expect(picks).toEqual([1, 2]);
    expect(drawn).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// KenoGame lifecycle
// ---------------------------------------------------------------------------
describe('KenoGame', () => {
  it('should reject a non-positive bet', () => {
    expect(() => new KenoGame(0)).toThrow('positive');
    expect(() => new KenoGame(-5)).toThrow('positive');
    expect(() => new KenoGame(NaN)).toThrow('positive');
  });

  it('should start in the WAITING_FOR_PICKS state', () => {
    const game = new KenoGame(1);
    expect(game.state).toBe('WAITING_FOR_PICKS');
    expect(game.picks).toEqual([]);
  });

  it('should accept valid picks', () => {
    const game = new KenoGame(1);
    game.placePicks([3, 7, 42]);
    expect(game.picks).toEqual([3, 7, 42]);
  });

  it('should reject invalid picks', () => {
    const game = new KenoGame(1);
    expect(() => game.placePicks([])).toThrow('at least');
    expect(() => game.placePicks([1, 1])).toThrow('Duplicate');
    expect(() => game.placePicks([99])).toThrow('between 1 and 80');
  });

  it('should not allow drawing before picks are placed', () => {
    const game = new KenoGame(1);
    expect(() => game.draw()).toThrow('Place your picks');
  });

  it('should draw 20 unique numbers after picks are placed', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    const drawn = game.draw();
    expect(drawn.length).toBe(KENO_NUM_DRAWS);
    expect(new Set(drawn).size).toBe(KENO_NUM_DRAWS);
    expect(game.state).toBe('DRAWING');
  });

  it('should not allow a second draw', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    game.draw();
    expect(() => game.draw()).toThrow('already been made');
  });

  it('should keep the state unchanged when a draw fails', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    expect(() => game.draw(KENO_TOTAL_NUMBERS + 1)).toThrow('unique numbers');
    expect(game.state).toBe('WAITING_FOR_PICKS');
  });

  it('should not allow changing picks after the draw', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    game.draw();
    expect(() => game.placePicks([4, 5, 6])).toThrow('Cannot change picks');
  });

  it('should not allow settling before the draw', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    expect(() => game.settle()).toThrow('Draw numbers before settling');
  });

  it('should settle a full round consistently', () => {
    const game = new KenoGame(2);
    game.placePicks([5, 15, 25]);
    game.draw();

    const result = game.settle();
    expect(game.state).toBe('SETTLED');
    expect(result.bet).toBe(2);
    expect(result.matches).toBe(countKenoMatches([5, 15, 25], game.drawn));
    expect(result.multiplier).toBe(getKenoPayoutMultiplier(3, result.matches));
    expect(result.payout).toBe(result.multiplier * 2);
    expect(result.isWin).toBe(result.multiplier > 0);
  });

  it('should be idempotent when settling twice', () => {
    const game = new KenoGame(1);
    game.placePicks([1, 2, 3]);
    game.draw();
    const first = game.settle();
    const second = game.settle();
    expect(second).toBe(first);
    expect(second.payout).toBe(first.payout);
  });
});
