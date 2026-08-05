import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

import prisma from './db';
import { getSettingNumber } from './utils/settings';
import { rateLimiter } from './middlewares/rateLimiter';
import { authenticateJWT, requireAdmin } from './middlewares/auth';
import {
  register,
  login,
  sendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
} from './controllers/authController';
import {
  getWalletInfo,
  depositRequest,
  withdrawRequest,
  getTransactions,
  getDepositHistory,
  getWithdrawalHistory,
} from './controllers/walletController';
import {
  getReferralStats,
  getReferralLeaderboard,
} from './controllers/referralController';
import {
  getSettings,
  updateSettings,
  getStats,
  getUsers,
  updateUserWallet,
  toggleUserBan,
  getWithdrawalRequests,
  approveWithdrawal,
  rejectWithdrawal,
  getDepositRequests,
  approveDeposit,
  rejectDeposit,
  getGameplayHistory,
  getKenoStats,
} from './controllers/adminController';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from './controllers/notificationsController';
import { BingoEngine } from './engine/BingoEngine';
import { KenoEngine } from './engine/KenoEngine';
import { setupSocketHandlers } from './engine/socketHandler';

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 5000;

// CORS setup
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(rateLimiter);

// ----------------------------------------------------
// PUBLIC & AUTHENTICATION ENDPOINTS
// ----------------------------------------------------
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/send-verification', authenticateJWT, sendVerification);
app.post('/api/auth/verify-email', verifyEmail);
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password', resetPassword);
app.get('/api/auth/profile', authenticateJWT, getProfile);
app.put('/api/auth/profile', authenticateJWT, updateProfile);

// ----------------------------------------------------
// WALLET ENDPOINTS
// ----------------------------------------------------
app.get('/api/wallet/info', authenticateJWT, getWalletInfo);
app.post('/api/wallet/deposit', authenticateJWT, depositRequest);
app.post('/api/wallet/withdraw', authenticateJWT, withdrawRequest);
app.get('/api/wallet/transactions', authenticateJWT, getTransactions);
app.get('/api/wallet/deposits', authenticateJWT, getDepositHistory);
app.get('/api/wallet/withdrawals', authenticateJWT, getWithdrawalHistory);

// ----------------------------------------------------
// REFERRAL ENDPOINTS
// ----------------------------------------------------
app.get('/api/referrals/stats', authenticateJWT, getReferralStats);
app.get('/api/referrals/leaderboard', authenticateJWT, getReferralLeaderboard);

// ----------------------------------------------------
// NOTIFICATIONS ENDPOINTS
// ----------------------------------------------------
app.get('/api/notifications', authenticateJWT, getNotifications);
app.post('/api/notifications/read', authenticateJWT, markAsRead);
app.post('/api/notifications/read-all', authenticateJWT, markAllAsRead);

// ----------------------------------------------------
// ROOMS PUBLIC ENDPOINTS
// ----------------------------------------------------
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await prisma.bingoRoom.findMany();
    // Merge real-time counts from the running engines (Bingo vs Keno)
    const activeStats = engine.getRoomsStatus();
    const activeKenoStats = kenoEngine.getRoomsStatus();
    // Live jackpot info from the admin settings (falls back to defaults)
    const jackpotAmount = await getSettingNumber('jackpot_amount');
    const jackpotChance = await getSettingNumber('jackpot_chance');
    const roomsWithStats = rooms.map((room) => {
      const stats = (room.game === 'KENO' ? activeKenoStats : activeStats).find(
        (s) => s.roomId === room.id
      );
      return {
        ...room,
        state: stats?.state || 'WAITING',
        playerCount: stats?.playerCount || 0,
        countdown: stats?.countdown || 0,
        jackpotAmount,
        jackpotChance,
      };
    });
    res.json({ rooms: roomsWithStats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch rooms' });
  }
});

// ----------------------------------------------------
// KENO HISTORY ENDPOINT
// ----------------------------------------------------
app.get('/api/keno/history/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const games = await prisma.kenoGame.findMany({
      where: { roomId, state: 'FINISHED' },
      include: {
        tickets: {
          include: { user: { select: { username: true } } },
        },
      },
      orderBy: { finishedAt: 'desc' },
      take: 20,
    });

    const history = games.map((game) => ({
      id: game.id,
      drawnNumbers: game.drawnNumbers,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      tickets: game.tickets.map((t) => ({
        userId: t.userId,
        username: t.user.username,
        spots: t.spots,
        matched: t.matched,
        payout: Number(t.payout),
        isWinner: t.isWinner,
      })),
    }));

    res.json({ history });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch Keno history' });
  }
});

// ----------------------------------------------------
// ADMIN CONTROL PANEL ENDPOINTS (SECURE)
// ----------------------------------------------------
const adminRouter = express.Router();
adminRouter.use(authenticateJWT, requireAdmin);

adminRouter.get('/settings', getSettings);
adminRouter.post('/settings', updateSettings);
adminRouter.get('/stats', getStats);
adminRouter.get('/users', getUsers);
adminRouter.post('/users/wallet', updateUserWallet);
adminRouter.post('/users/ban', toggleUserBan);
adminRouter.get('/withdrawals', getWithdrawalRequests);
adminRouter.post('/withdrawals/approve', approveWithdrawal);
adminRouter.post('/withdrawals/reject', rejectWithdrawal);
adminRouter.get('/deposits', getDepositRequests);
adminRouter.post('/deposits/approve', approveDeposit);
adminRouter.post('/deposits/reject', rejectDeposit);
adminRouter.get('/games', getGameplayHistory);
adminRouter.get('/keno-stats', getKenoStats);

app.use('/api/admin', adminRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Initialize Socket.IO Server
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const engine = new BingoEngine(io);
const kenoEngine = new KenoEngine(io);
setupSocketHandlers(io, engine, kenoEngine);

// Seed Super Admin if not present
const seedSuperAdmin = async () => {
  try {
    const adminEmail = 'admin@bingo.com';
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!adminUser) {
      const passwordHash = await bcrypt.hash('admin12345', 10);
      const user = await prisma.user.create({
        data: {
          email: adminEmail,
          username: 'SuperAdmin',
          passwordHash,
          role: 'ADMIN',
          isVerified: true,
          referralCode: 'ADMINREF',
        },
      });

      await prisma.wallet.create({
        data: {
          userId: user.id,
          balance: 1000000.0, // Large starting balance for admin manual adjustment tests
        },
      });

      console.log('Seeded Super Admin credentials: admin@bingo.com / admin12345');
    }
  } catch (err) {
    console.error('Failed to seed Super Admin:', err);
  }
};

server.listen(PORT, async () => {
  await seedSuperAdmin();
  console.log(`Server running on port ${PORT}`);
});
