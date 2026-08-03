import prisma from '../db';
import { getSettingNumber } from '../utils/settings';

export interface BingoCardData {
  id: string;
  grid: number[][]; // 5x5 grid, center is 0 (free space)
  daubed: boolean[][]; // 5x5 grid of booleans
  isBot: boolean;
}

// 12 possible winning lines in a 5x5 grid
const WINNING_PATTERNS = [
  // Rows
  [[0,0], [0,1], [0,2], [0,3], [0,4]],
  [[1,0], [1,1], [1,2], [1,3], [1,4]],
  [[2,0], [2,1], [2,2], [2,3], [2,4]],
  [[3,0], [3,1], [3,2], [3,3], [3,4]],
  [[4,0], [4,1], [4,2], [4,3], [4,4]],
  // Columns
  [[0,0], [1,0], [2,0], [3,0], [4,0]],
  [[0,1], [1,1], [2,1], [3,1], [4,1]],
  [[0,2], [1,2], [2,2], [3,2], [4,2]],
  [[0,3], [1,3], [2,3], [3,3], [4,3]],
  [[0,4], [1,4], [2,4], [3,4], [4,4]],
  // Diagonals
  [[0,0], [1,1], [2,2], [3,3], [4,4]],
  [[0,4], [1,3], [2,2], [3,1], [4,0]]
];

export class ProbabilityEngine {
  /**
   * Evaluates historical human vs bot win rates and decides whether to favor humans, bots, or remain neutral.
   */
  static async decideTargetBias(): Promise<'HUMAN' | 'BOT' | 'NEUTRAL'> {
    try {
      const targetWinRate = await getSettingNumber('win_rate_percentage'); // e.g. 50 (50%)
      
      const humanWins = await prisma.bingoCard.count({
        where: { isWinner: true, isBot: false },
      });
      const botWins = await prisma.bingoCard.count({
        where: { isWinner: true, isBot: true },
      });

      const totalWins = humanWins + botWins;
      if (totalWins === 0) return 'NEUTRAL';

      const actualHumanWinRate = (humanWins / totalWins) * 100;

      // If humans are winning less than target, bias towards humans
      if (actualHumanWinRate < targetWinRate - 2) {
        return 'HUMAN';
      }
      // If humans are winning more than target, bias towards bots (house edge)
      if (actualHumanWinRate > targetWinRate + 2) {
        return 'BOT';
      }

      return 'NEUTRAL';
    } catch (error) {
      return 'NEUTRAL';
    }
  }

  /**
   * Evaluates all active cards in a game and returns the next number to call.
   * @param cards All bingo cards currently active in the game
   * @param calledNumbers Numbers that have already been called
   * @param bias Target bias decided by stats
   */
  static selectNextBall(
    cards: BingoCardData[],
    calledNumbers: number[],
    bias: 'HUMAN' | 'BOT' | 'NEUTRAL'
  ): number {
    // Generate pool of remaining numbers (1-75)
    const pool = Array.from({ length: 75 }, (_, i) => i + 1).filter(
      (n) => !calledNumbers.includes(n)
    );

    if (pool.length === 0) return 0;
    if (bias === 'NEUTRAL' || cards.length === 0) {
      // Return a random number
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Filter cards based on bias target
    const targetCards = cards.filter((c) => (bias === 'HUMAN' ? !c.isBot : c.isBot));
    if (targetCards.length === 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Find the numbers that would help the target cards complete a line.
    // For each card, look at each winning line. Find the lines that are closest to completion.
    // A line's "distance" is the number of remaining numbers that need to be called.
    const numberWeights = new Map<number, number>(); // number -> weight (higher weight = more helpful)

    for (const card of targetCards) {
      for (const pattern of WINNING_PATTERNS) {
        // Count how many numbers in this pattern are not yet called
        const uncalledNumbersInLine: number[] = [];
        
        for (const [r, c] of pattern) {
          const val = card.grid[r][c];
          // skip center space (free space value 0)
          if (val !== 0 && !calledNumbers.includes(val)) {
            uncalledNumbersInLine.push(val);
          }
        }

        // If the line is very close to completion (e.g. 1 or 2 numbers left)
        if (uncalledNumbersInLine.length > 0 && uncalledNumbersInLine.length <= 2) {
          for (const num of uncalledNumbersInLine) {
            if (pool.includes(num)) {
              // The closer to completion, the higher the weight we add
              const weightBonus = uncalledNumbersInLine.length === 1 ? 5 : 2;
              numberWeights.set(num, (numberWeights.get(num) || 0) + weightBonus);
            }
          }
        }
      }
    }

    // Sort pool by weight
    if (numberWeights.size > 0) {
      const candidates = Array.from(numberWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([num]) => num);

      // We have a 70% chance to pick one of the heavily weighted numbers to apply bias,
      // and a 30% chance to pick a random number to keep gameplay natural.
      if (Math.random() < 0.7 && candidates.length > 0) {
        // Pick the top candidate
        return candidates[0];
      }
    }

    // Fallback: standard random pick
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Helper to check if a card has a winning pattern based on called numbers.
   */
  static verifyWin(grid: number[][], daubed: boolean[][]): boolean {
    // Check if any winning pattern is fully daubed
    for (const pattern of WINNING_PATTERNS) {
      let isWin = true;
      for (const [r, c] of pattern) {
        const val = grid[r][c];
        if (val !== 0 && !daubed[r][c]) {
          isWin = false;
          break;
        }
      }
      if (isWin) return true;
    }
    return false;
  }
}
