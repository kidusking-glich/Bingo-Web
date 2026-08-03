import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middlewares/auth';

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.adminSetting.findMany();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    res.json({ settings: settingsMap });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { settings } = req.body; // e.g., { "welcome_bonus": "15.00", "win_rate_percentage": "60.00" }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const updates = Object.entries(settings).map(([key, value]) => {
      return prisma.adminSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    });

    await prisma.$transaction(updates);

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Updated settings: ${Object.keys(settings).join(', ')}`,
      },
    });

    res.json({ message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
};

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Total deposits approved
    const depositsSum = await prisma.depositRequest.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });

    // 2. Total withdrawals approved
    const withdrawalsSum = await prisma.withdrawalRequest.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });

    // 3. Game counts
    const totalGames = await prisma.bingoGame.count();
    const activeGames = await prisma.bingoGame.count({
      where: { state: 'PLAYING' },
    });

    // 4. Users count
    const totalUsers = await prisma.user.count({ where: { role: 'USER' } });
    const bannedUsers = await prisma.user.count({ where: { isBanned: true } });

    // 5. Game statistics (calculate house revenue)
    // Entry fees vs Payouts:
    // Entry fees: transactions of type ENTRY_FEE (which are negative amounts in ledger or positive? Let's check: amount will be stored as negative or positive, let's treat entry fees as positive in a transaction record or sum them)
    // To be safe, let's aggregate ENTRY_FEE sums and GAME_WIN sums.
    const entryFeeTx = await prisma.transaction.aggregate({
      where: { type: 'ENTRY_FEE', status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const gameWinTx = await prisma.transaction.aggregate({
      where: { type: 'GAME_WIN', status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const totalEntryFees = Math.abs(entryFeeTx._sum.amount?.toNumber() || 0);
    const totalWinningsPayouts = gameWinTx._sum.amount?.toNumber() || 0;
    const houseRevenue = totalEntryFees - totalWinningsPayouts;

    // Human vs Bot win ratio
    const humanWins = await prisma.bingoCard.count({
      where: { isWinner: true, isBot: false },
    });
    const botWins = await prisma.bingoCard.count({
      where: { isWinner: true, isBot: true },
    });

    res.json({
      stats: {
        totalDeposits: depositsSum._sum.amount || 0,
        totalWithdrawals: withdrawalsSum._sum.amount || 0,
        totalGames,
        activeGames,
        totalUsers,
        bannedUsers,
        totalEntryFees,
        totalWinningsPayouts,
        houseRevenue,
        humanWins,
        botWins,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
};

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      include: {
        wallet: true,
        referrals: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
};

export const updateUserWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, amount, type } = req.body; // amount can be positive (add) or negative (deduct), type: 'add' | 'deduct'

    if (!userId || !amount || amount <= 0 || !type) {
      return res.status(400).json({ error: 'User ID, positive amount, and adjustment type are required' });
    }

    const adjustValue = type === 'add' ? amount : -amount;

    // Fetch wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (type === 'deduct' && wallet.balance.toNumber() < amount) {
      return res.status(400).json({ error: 'Insufficient balance to deduct' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: adjustValue },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'ADMIN_ADJUSTMENT',
          amount: adjustValue,
          status: 'COMPLETED',
          description: `Admin wallet adjustment: ${type === 'add' ? 'Credited' : 'Debited'} $${amount.toFixed(2)}`,
        },
      });

      await tx.notification.create({
        data: {
          userId,
          title: 'Wallet Balance Adjusted',
          message: `Your balance has been adjusted by the Administrator: ${type === 'add' ? 'Added' : 'Removed'} $${amount.toFixed(2)}.`,
        },
      });
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Adjusted user (${userId}) wallet: ${type === 'add' ? '+' : '-'}$${amount}`,
      },
    });

    res.json({ message: 'User wallet balance adjusted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to adjust wallet balance' });
  }
};

export const toggleUserBan = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: !user.isBanned,
      },
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `${updatedUser.isBanned ? 'Banned' : 'Unbanned'} user (${userId})`,
      },
    });

    res.json({
      message: `User account has been ${updatedUser.isBanned ? 'banned' : 'unbanned'} successfully`,
      isBanned: updatedUser.isBanned,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to toggle ban status' });
  }
};

export const getWithdrawalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.withdrawalRequest.findMany({
      include: {
        user: {
          select: { username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch withdrawal requests' });
  }
};

export const approveWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;

    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const request = await prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request not found or not in PENDING state' });
    }

    await prisma.$transaction(async (tx) => {
      // Update request status
      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          approvedAt: new Date(),
        },
      });

      // Update the transaction log matching the withdrawal details
      const transaction = await tx.transaction.findFirst({
        where: {
          userId: request.userId,
          type: 'WITHDRAWAL',
          amount: -request.amount.toNumber(), // negative representation if stored as negative, wait, let's verify: we stored it as positive or negative? In walletController we stored it as positive amount. Let's check matching description or amount.
          status: 'PENDING',
        },
      });

      if (transaction) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED' },
        });
      } else {
        // Fallback create transaction log if not found
        await tx.transaction.create({
          data: {
            userId: request.userId,
            type: 'WITHDRAWAL',
            amount: -request.amount.toNumber(),
            status: 'COMPLETED',
            description: `Approved withdrawal to ${request.address}`,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: request.userId,
          title: 'Withdrawal Approved',
          message: `Your withdrawal of $${request.amount.toFixed(2)} has been processed and sent to your address.`,
        },
      });
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Approved withdrawal request (${requestId}) of $${request.amount}`,
      },
    });

    res.json({ message: 'Withdrawal approved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve withdrawal' });
  }
};

export const rejectWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;

    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const request = await prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request not found or not in PENDING state' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update request status to REJECTED
      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
        },
      });

      // 2. Refund balance back to user wallet!
      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { increment: request.amount },
        },
      });

      // 3. Mark transaction as REJECTED
      const transaction = await tx.transaction.findFirst({
        where: {
          userId: request.userId,
          type: 'WITHDRAWAL',
          amount: request.amount, // stored in walletController as amount (positive)
          status: 'PENDING',
        },
      });

      if (transaction) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'REJECTED', description: transaction.description + ' (Rejected by Admin - Refunded)' },
        });
      }

      await tx.notification.create({
        data: {
          userId: request.userId,
          title: 'Withdrawal Rejected',
          message: `Your withdrawal of $${request.amount.toFixed(2)} was rejected. The funds have been refunded to your wallet.`,
        },
      });
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Rejected withdrawal request (${requestId}) of $${request.amount}`,
      },
    });

    res.json({ message: 'Withdrawal request rejected. Funds returned to user.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reject withdrawal' });
  }
};

export const getDepositRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.depositRequest.findMany({
      include: {
        user: {
          select: { username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch deposit requests' });
  }
};

export const approveDeposit = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;

    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const request = await prisma.depositRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request not found or not in PENDING state' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update request status to COMPLETED
      await tx.depositRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          approvedAt: new Date(),
        },
      });

      // 2. Increment user wallet balance
      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { increment: request.amount },
        },
      });

      // 3. Create a transaction log for deposit
      await tx.transaction.create({
        data: {
          userId: request.userId,
          type: 'DEPOSIT',
          amount: request.amount,
          status: 'COMPLETED',
          description: `Deposit via TxHash: ${request.txHash}`,
        },
      });

      await tx.notification.create({
        data: {
          userId: request.userId,
          title: 'Deposit Confirmed!',
          message: `Your deposit of $${request.amount.toFixed(2)} has been approved. Funds are now available.`,
        },
      });
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Approved deposit request (${requestId}) of $${request.amount}`,
      },
    });

    res.json({ message: 'Deposit request approved. Funds credited to user.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve deposit' });
  }
};

export const rejectDeposit = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;

    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const request = await prisma.depositRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request not found or not in PENDING state' });
    }

    await prisma.depositRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
      },
    });

    // Log admin activity
    await prisma.adminActivityLog.create({
      data: {
        adminId: req.user!.id,
        action: `Rejected deposit request (${requestId}) of $${request.amount}`,
      },
    });

    res.json({ message: 'Deposit request rejected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reject deposit' });
  }
};

export const getKenoStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalRounds = await prisma.kenoGame.count({ where: { state: 'FINISHED' } });
    const totalTickets = await prisma.kenoTicket.count({
      where: { game: { state: 'FINISHED' } },
    });
    const payoutsAgg = await prisma.kenoTicket.aggregate({ _sum: { payout: true } });
    const totalPayouts = payoutsAgg._sum.payout?.toNumber() || 0;

    // Per-room breakdown. Wagers = tickets × entry fee (one ticket per wager).
    const rooms = await prisma.bingoRoom.findMany({
      where: { game: 'KENO' },
      include: {
        kenoGames: {
          where: { state: 'FINISHED' },
          select: {
            id: true,
            tickets: { select: { payout: true } },
          },
        },
      },
    });

    const perRoom = rooms.map((room) => {
      const roundsPlayed = room.kenoGames.length;
      const ticketsSold = room.kenoGames.reduce((acc, g) => acc + g.tickets.length, 0);
      const entryFee = room.entryFee.toNumber();
      const totalWagers = ticketsSold * entryFee;
      const roomPayouts = room.kenoGames.reduce(
        (acc, g) => acc + g.tickets.reduce((a, t) => a + t.payout.toNumber(), 0),
        0
      );
      const houseTake = totalWagers - roomPayouts;

      return {
        roomId: room.id,
        roomName: room.name,
        entryFee,
        roundsPlayed,
        ticketsSold,
        totalWagers,
        totalPayouts: roomPayouts,
        houseTake,
        payoutRate: totalWagers > 0 ? (roomPayouts / totalWagers) * 100 : 0,
      };
    });

    const totalWagers = perRoom.reduce((acc, r) => acc + r.totalWagers, 0);
    const totalHouseTake = perRoom.reduce((acc, r) => acc + r.houseTake, 0);

    res.json({
      stats: {
        totalRounds,
        totalTickets,
        totalWagers,
        totalPayouts,
        totalHouseTake,
      },
      rooms: perRoom,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch Keno analytics' });
  }
};

export const getGameplayHistory = async (req: AuthRequest, res: Response) => {
  try {
    const games = await prisma.bingoGame.findMany({
      include: {
        room: { select: { name: true, entryFee: true } },
        participants: {
          include: {
            user: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ games });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch gameplay history' });
  }
};
