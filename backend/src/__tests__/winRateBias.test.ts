import prisma from '../db';
import { ProbabilityEngine, BingoCardData } from '../engine/ProbabilityEngine';

// Mock the prisma client so these tests run without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    adminSetting: { findUnique: jest.fn() },
    bingoCard: { count: jest.fn() },
  },
}));

const mockDb = prisma as unknown as {
  adminSetting: { findUnique: jest.Mock };
  bingoCard: { count: jest.Mock };
};

/**
 * Builds a card whose top row is fully controlled (used to place a card one
 * number away from a BINGO). All other cells are distinct 1-75 fillers.
 */
const makeCard = (topRow: number[], isBot: boolean): BingoCardData => {
  const grid: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: number[] = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) row.push(0); // FREE space
      else if (r === 0) row.push(topRow[c]);
      else row.push(10 * r + c + 1); // fillers: 11-15, 21-25, 31-35, 41-45
    }
    grid.push(row);
  }
  return {
    id: `card-${topRow.join('-')}${isBot ? '-bot' : '-human'}`,
    grid,
    daubed: Array.from({ length: 5 }, () => Array(5).fill(false)),
    isBot,
  };
};

beforeEach(() => {
  // Default: the win rate setting is not stored in the DB, so the default 50% applies.
  mockDb.adminSetting.findUnique.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// ProbabilityEngine.decideTargetBias
// ---------------------------------------------------------------------------
describe('ProbabilityEngine.decideTargetBias', () => {
  const seedWins = (humanWins: number, botWins: number) => {
    mockDb.bingoCard.count
      .mockResolvedValueOnce(humanWins) // isWinner, human
      .mockResolvedValueOnce(botWins); // isWinner, bot
  };

  it('queries the win-rate setting and both human/bot winner counts', async () => {
    seedWins(3, 7);
    await ProbabilityEngine.decideTargetBias();

    expect(mockDb.adminSetting.findUnique).toHaveBeenCalledWith({
      where: { key: 'win_rate_percentage' },
    });
    expect(mockDb.bingoCard.count).toHaveBeenCalledWith({
      where: { isWinner: true, isBot: false },
    });
    expect(mockDb.bingoCard.count).toHaveBeenCalledWith({
      where: { isWinner: true, isBot: true },
    });
  });

  it('returns NEUTRAL when there are no recorded wins', async () => {
    seedWins(0, 0);
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('NEUTRAL');
  });

  it('biases towards HUMANS when the actual human win rate is below the target', async () => {
    seedWins(3, 7); // 30% human wins vs 50% target
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('HUMAN');
  });

  it('biases towards BOTS when the actual human win rate is above the target', async () => {
    seedWins(7, 3); // 70% human wins vs 50% target
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('BOT');
  });

  it('stays NEUTRAL when the win rate is within +/-2% of the target', async () => {
    seedWins(5, 5); // exactly 50%
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('NEUTRAL');
  });

  it('biases towards HUMANS just outside the tolerance band (45.5% vs 50%)', async () => {
    seedWins(5, 6); // 45.45% < 48%
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('HUMAN');
  });

  it('biases towards BOTS just outside the tolerance band (54.5% vs 50%)', async () => {
    seedWins(6, 5); // 54.55% > 52%
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('BOT');
  });

  it('honors a higher target stored in the DB (80% target, 60% actual -> HUMAN)', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: '80',
    });
    seedWins(6, 4);
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('HUMAN');
  });

  it('honors a higher target stored in the DB (80% target, 85% actual -> BOT)', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: '80',
    });
    seedWins(17, 3);
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('BOT');
  });

  it('stays NEUTRAL when inside the band of a DB-configured target (79% vs 80%)', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: '80',
    });
    seedWins(79, 21);
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('NEUTRAL');
  });

  it('falls back to NEUTRAL when the win counts cannot be read', async () => {
    mockDb.bingoCard.count.mockRejectedValue(new Error('db down'));
    await expect(ProbabilityEngine.decideTargetBias()).resolves.toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// ProbabilityEngine.selectNextBall with a bias
// ---------------------------------------------------------------------------
describe('ProbabilityEngine.selectNextBall with bias', () => {
  // Called numbers leave only {5, 50, 51, 52, 53} in the pool; number 5
  // completes the human card's top row (1,2,3,4,5) after 1-4 are called.
  const tightCalled = Array.from({ length: 75 }, (_, i) => i + 1).filter(
    (n) => ![5, 50, 51, 52, 53].includes(n)
  );

  const runMany = (
    cards: BingoCardData[],
    bias: 'HUMAN' | 'BOT' | 'NEUTRAL',
    iterations = 60
  ): number[] => {
    const picks: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const ball = ProbabilityEngine.selectNextBall(cards, tightCalled, bias);
      expect(ball).not.toBe(0);
      expect(tightCalled).not.toContain(ball);
      picks.push(ball);
    }
    return picks;
  };

  it('favors the completing number for human cards under HUMAN bias', () => {
    const human = makeCard([1, 2, 3, 4, 5], false);
    const picks = runMany([human], 'HUMAN');

    const fives = picks.filter((n) => n === 5).length;
    // ~76% of picks should be the number completing the human's line, far above random (20%)
    expect(fives).toBeGreaterThan(30);
  });

  it('does not favor any number when the bias is NEUTRAL', () => {
    const human = makeCard([1, 2, 3, 4, 5], false);
    const picks = runMany([human], 'NEUTRAL');

    const fives = picks.filter((n) => n === 5).length;
    // random draw from a 5-number pool => ~20%
    expect(fives).toBeLessThan(30);
  });

  it('does not favor a human card when the bias is BOT (no bot cards in play)', () => {
    const human = makeCard([1, 2, 3, 4, 5], false);
    const picks = runMany([human], 'BOT');

    const fives = picks.filter((n) => n === 5).length;
    expect(fives).toBeLessThan(30);
  });

  it('favors the completing number for bot cards under BOT bias', () => {
    const bot = makeCard([1, 2, 3, 4, 5], true);
    const picks = runMany([bot], 'BOT');

    const fives = picks.filter((n) => n === 5).length;
    expect(fives).toBeGreaterThan(30);
  });

  it('flips which side gets the completing number when human and bot cards race', () => {
    // Both cards need exactly one more number: human needs 5, bot needs 55.
    const human = makeCard([1, 2, 3, 4, 5], false);
    const bot = makeCard([51, 52, 53, 54, 55], true);
    const called = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => ![5, 55].includes(n));

    const runRace = (bias: 'HUMAN' | 'BOT'): { fives: number; fiftyFives: number } => {
      let fives = 0;
      let fiftyFives = 0;
      for (let i = 0; i < 60; i++) {
        const ball = ProbabilityEngine.selectNextBall([human, bot], called, bias);
        expect([5, 55]).toContain(ball);
        if (ball === 5) fives++;
        else fiftyFives++;
      }
      return { fives, fiftyFives };
    };

    // HUMAN bias: the human's 5 must be picked far more often than the bot's 55
    const humanRace = runRace('HUMAN');
    expect(humanRace.fives).toBeGreaterThan(40);
    expect(humanRace.fiftyFives).toBeLessThan(20);

    // BOT bias: the bot's 55 must be picked far more often than the human's 5
    const botRace = runRace('BOT');
    expect(botRace.fiftyFives).toBeGreaterThan(40);
    expect(botRace.fives).toBeLessThan(20);
  });
});
