import { Prisma } from '@prisma/client';
import prisma from '../db';
import { BingoEngine, generateBingoGrid } from '../engine/BingoEngine';

// Mock the prisma client so the engine runs without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    bingoRoom: { findMany: jest.fn(), findUnique: jest.fn() },
    wallet: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    bingoGame: { create: jest.fn(), update: jest.fn() },
    gameParticipant: { create: jest.fn() },
    bingoCard: { create: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
    referralEarning: { create: jest.fn() },
    adminSetting: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = prisma as unknown as {
  bingoRoom: { findMany: jest.Mock; findUnique: jest.Mock };
  adminSetting: { findUnique: jest.Mock };
  wallet: { findUnique: jest.Mock; update: jest.Mock };
  transaction: { create: jest.Mock };
  notification: { create: jest.Mock };
  bingoCard: { update: jest.Mock };
  bingoGame: { update: jest.Mock };
  $transaction: jest.Mock;
};

// $20 prize pool room
const prizeRoom = {
  id: 'room-1',
  name: 'Test Room',
  entryFee: new Prisma.Decimal(5),
  prizePool: new Prisma.Decimal(20),
};

const makeIoStub = () => {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), __emit: emit };
};

const waitForRooms = async (engine: BingoEngine) => {
  for (let i = 0; i < 50; i++) {
    if (engine.getRoomsStatus().length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Engine rooms never initialized');
};

const stopEngineTimers = (engine: BingoEngine) => {
  const rooms = (engine as any).rooms as Map<string, any>;
  for (const room of rooms.values()) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.gameTimer) clearInterval(room.gameTimer);
  }
};

describe('BingoEngine jackpot at game end', () => {
  let engine: BingoEngine;
  let ioStub: ReturnType<typeof makeIoStub>;
  let randomSpy: jest.SpyInstance;

  // jest.spyOn/mockRestore on the global setTimeout is unreliable in this Jest
  // version (restore can leave the global undefined), so swap it as a plain
  // property and restore it manually.
  const originalSetTimeout = global.setTimeout;

  beforeEach(async () => {
    mockDb.bingoRoom.findMany.mockResolvedValue([prizeRoom]);
    mockDb.bingoRoom.findUnique.mockResolvedValue(prizeRoom);
    mockDb.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    mockDb.wallet.update.mockResolvedValue({});
    mockDb.transaction.create.mockResolvedValue({});
    mockDb.notification.create.mockResolvedValue({});
    mockDb.bingoCard.update.mockResolvedValue({});
    mockDb.bingoGame.update.mockResolvedValue({});
    // Defaults apply: jackpot_chance 5%, jackpot_amount $100
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    ioStub = makeIoStub();
    engine = new BingoEngine(ioStub as any);
    await waitForRooms(engine);

    // Deterministic roll + neutralize the 10s resetRoom timer (no-op)
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
    (global as any).setTimeout = (() => 0) as any;
  });

  afterEach(() => {
    randomSpy.mockRestore();
    (global as any).setTimeout = originalSetTimeout;
    stopEngineTimers(engine);
  });

  /** Sets up the room as FINISHED with a winner and triggers endGame. */
  const finishGame = async (winnerId: string, isBot: boolean) => {
    const room = (engine as any).rooms.get('room-1');
    room.state = 'PLAYING';
    room.gameId = 'game-1';
    room.players.push({
      userId: winnerId,
      username: isBot ? 'NeonBot#123' : 'Alice',
      isBot,
      socketId: isBot ? undefined : 'socket-a',
      socketIds: isBot ? [] : ['socket-a'],
      cardOptions: [],
      cards: [
        {
          id: 'card-1',
          grid: generateBingoGrid(),
          daubed: Array.from({ length: 5 }, () => Array(5).fill(false)),
        },
      ],
    });
    await (engine as any).endGame('room-1', winnerId, 'card-1');
  };

  it('pays the prize pool plus the jackpot when the chance roll hits', async () => {
    randomSpy.mockReturnValue(0.01); // 1 < 5 -> jackpot hit
    await finishGame('user-1', false);

    // Wallet gets prize pool ($20) + jackpot ($100)
    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 120 },
        totalWinnings: { increment: 120 },
      },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'GAME_WIN',
        amount: 120,
        description: 'Won game in room Test Room including jackpot bonus',
      },
    });
    // Notification celebrates the jackpot
    expect(mockDb.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        title: 'You Won BINGO!',
        message: expect.stringContaining('JACKPOT BONUS'),
      }),
    });
    // Clients see the jackpot in the game_finished event
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ prizePool: 20, jackpot: 100 })
    );
  });

  it('pays only the prize pool when the chance roll misses', async () => {
    randomSpy.mockReturnValue(0.99); // 99 < 5 is false -> no jackpot
    await finishGame('user-1', false);

    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 20 },
        totalWinnings: { increment: 20 },
      },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'GAME_WIN',
        amount: 20,
        description: 'Won game in room Test Room',
      },
    });
    expect(mockDb.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: expect.not.stringContaining('JACKPOT'),
      }),
    });
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ prizePool: 20, jackpot: 0 })
    );
  });

  it('honors admin-configured chance and amount (100% chance, $250 jackpot)', async () => {
    mockDb.adminSetting.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) => {
        const values: Record<string, string> = { jackpot_chance: '100', jackpot_amount: '250' };
        return values[where.key] ? { key: where.key, value: values[where.key] } : null;
      }
    );
    randomSpy.mockReturnValue(0.01); // 1 < 100 -> hit
    await finishGame('user-1', false);

    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 270 },
        totalWinnings: { increment: 270 },
      },
    });
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ prizePool: 20, jackpot: 250 })
    );
  });

  it('never pays a jackpot when the admin chance is 0', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'jackpot_chance',
      value: '0',
    });
    randomSpy.mockReturnValue(0.01); // 1 < 0 is false -> no jackpot
    await finishGame('user-1', false);

    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 20 },
        totalWinnings: { increment: 20 },
      },
    });
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ jackpot: 0 })
    );
  });

  it('ignores a negative jackpot amount so it can never shrink winnings', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'jackpot_amount',
      value: '-100',
    });
    randomSpy.mockReturnValue(0.01); // roll would hit, but the amount is invalid
    await finishGame('user-1', false);

    // Payout is exactly the prize pool — never reduced
    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 20 },
        totalWinnings: { increment: 20 },
      },
    });
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ jackpot: 0 })
    );
  });

  it('does not roll or pay out anything when a bot wins', async () => {
    randomSpy.mockReturnValue(0.01); // would be a hit if a human won
    await finishGame('bot-1', true);

    expect(mockDb.wallet.update).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
    expect(mockDb.notification.create).not.toHaveBeenCalled();
    // The event still reports no jackpot for the bot win
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'game_finished',
      expect.objectContaining({ winnerId: 'bot-1', jackpot: 0 })
    );
  });
});
