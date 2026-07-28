import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middlewares/auth';

export const getReferralStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        referrals: {
          select: {
            id: true,
            username: true,
            createdAt: true,
          },
        },
        wallet: {
          select: {
            referralEarnings: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const earningsHistory = await prisma.referralEarning.findMany({
      where: { userId: req.user.id },
      include: {
        user: {
          select: { username: true }, // Referrer name (redundant, but good to have)
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const earningsWithFriends = await Promise.all(
      earningsHistory.map(async (earning) => {
        const friend = await prisma.user.findUnique({
          where: { id: earning.referredId },
          select: { username: true },
        });
        return {
          id: earning.id,
          friendName: friend?.username || 'Unknown Friend',
          amount: earning.amount,
          createdAt: earning.createdAt,
        };
      })
    );

    res.json({
      referralCode: user.referralCode,
      referralCount: user.referrals.length,
      totalEarnings: user.wallet?.referralEarnings || 0,
      referralsList: user.referrals,
      earningsHistory: earningsWithFriends,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch referral stats' });
  }
};

export const getReferralLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    // Fetch wallets with referralEarnings > 0 sorted by referralEarnings descending
    const topWallets = await prisma.wallet.findMany({
      where: {
        referralEarnings: { gt: 0 },
      },
      orderBy: {
        referralEarnings: 'desc',
      },
      take: 10,
      include: {
        user: {
          select: {
            username: true,
            referrals: {
              select: { id: true },
            },
          },
        },
      },
    });

    const leaderboard = topWallets.map((wallet) => ({
      username: wallet.user.username,
      earnings: wallet.referralEarnings,
      referralCount: wallet.user.referrals.length,
    }));

    res.json({ leaderboard });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch referral leaderboard' });
  }
};
