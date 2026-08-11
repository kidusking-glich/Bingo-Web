import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middlewares/auth';
import {
  validateKenoPicks,
  drawKenoNumbers,
  settleKenoRound,
  KENO_NUM_DRAWS,
} from '../engine/KenoEngineCore';

/**
 * Plays a Keno round:
 * 1. Validates picks & bet
 * 2. Deducts the bet from the wallet (atomic transaction)
 * 3. Draws 20 numbers server-side using the KenoEngine
 * 4. Settles the round, credits winnings (if any), and records the game
 */
export const playKeno = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { picks, bet } = req.body;

    // ── Validate picks ──
    const pickValidation = validateKenoPicks(Array.isArray(picks) ? picks : []);
    if (!pickValidation.valid) {
      return res.status(400).json({ error: pickValidation.error });
    }

    // ── Validate bet ──
    const betNum = Number(bet);
    if (!Number.isFinite(betNum) || betNum <= 0) {
      return res.status(400).json({ error: 'Bet must be a positive number' });
    }
    const MAX_BET_PER_ROUND = 1000;
    if (betNum > MAX_BET_PER_ROUND) {
      return res.status(400).json({ error: `Bet exceeds the maximum of $${MAX_BET_PER_ROUND} per round` });
    }

    // Run the whole round atomically
    const game = await prisma.$transaction(async (tx) => {
      // ── Conditional balance check & deduction (atomic, race-safe) ──
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.id } });
      if (!wallet) throw new Error('Wallet not found');

      const deducted = await tx.wallet.updateMany({
        where: { userId: req.user!.id, balance: { gte: betNum } },
        data: { balance: { decrement: betNum } },
      });
      if (deducted.count === 0) throw new Error('Insufficient balance');

      await tx.transaction.create({
        data: {
          userId: req.user!.id,
          type: 'ENTRY_FEE',
          amount: -betNum,
          description: `Keno wager — ${picks.length} spots`,
        },
      });

      // ── Server-side draw & settle ──
      const drawn = drawKenoNumbers(KENO_NUM_DRAWS);
      const result = settleKenoRound(betNum, picks, drawn);
      const payout = Math.round(result.payout * 100) / 100; // keep money clean (2 dp)

      // ── Credit winnings (if any) ──
      if (result.isWin) {
        await tx.wallet.update({
          where: { userId: req.user!.id },
          data: {
            balance: { increment: payout },
            totalWinnings: { increment: payout },
          },
        });

        await tx.transaction.create({
          data: {
            userId: req.user!.id,
            type: 'GAME_WIN',
            amount: payout,
            description: `Keno win — ${result.matches}/${picks.length} matches at ${result.multiplier}x`,
          },
        });

        await tx.notification.create({
          data: {
            userId: req.user!.id,
            title: 'Keno Win!',
            message: `You matched ${result.matches} of ${picks.length} numbers and won $${payout.toFixed(2)}!`,
          },
        });
      }

      // ── Record the game ──
      return tx.kenoWager.create({
        data: {
          userId: req.user!.id,
          bet: betNum,
          picks,
          drawn,
          matches: result.matches,
          multiplier: result.multiplier,
          payout,
          isWin: result.isWin,
        },
      });
    });

    res.status(201).json({
      success: true,
      game: {
        id: game.id,
        bet: game.bet.toNumber(),
        picks: game.picks,
        drawn: game.drawn,
        matches: game.matches,
        multiplier: game.multiplier,
        payout: game.payout.toNumber(),
        isWin: game.isWin,
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Keno round failed';
    const status = message === 'Insufficient balance' ? 400 : 500;
    res.status(status).json({ error: message });
  }
};

/** Returns the authenticated user's most recent Keno games. */
export const getKenoHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const games = await prisma.kenoWager.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      games: games.map((g) => ({
        id: g.id,
        bet: g.bet.toNumber(),
        picks: g.picks,
        drawn: g.drawn,
        matches: g.matches,
        multiplier: g.multiplier,
        payout: g.payout.toNumber(),
        isWin: g.isWin,
        createdAt: g.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch Keno history' });
  }
};
