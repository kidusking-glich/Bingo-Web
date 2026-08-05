import { Prisma } from '@prisma/client';
import prisma from '../db';
import { KenoEngine, getBaseKenoRtp, getRtpScaledMultiplier } from '../engine/KenoEngine';

// Mock the prisma client so the engine runs without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    bingoRoom: { findMany: jest.fn(), findUnique: jest.fn() },
    kenoTicket: { findMany: jest.fn(), update: jest.fn() },
    kenoGame: { create: jest.fn(), update: jest.fn() },
    wallet: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    notification: { create: jest.fn() },
    referralEarning: { create: jest.fn() },
    adminSetting: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = prisma as unknown as {
  bingoRoom: { findMany: jest.Mock; findUnique: jest.Mock };
  kenoTicket: { findMany: jest.Mock; update: jest.Mock };
  kenoGame: { update: jest.Mock };
  wallet: { update: jest.Mock };
  transaction: { create: jest.Mock };
  notification: { create: jest.Mock };
  adminSetting: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const kenoRoom = {
  id: 'keno-room-1',
  name: 'Test Keno',
  entryFee: new Prisma.Decimal(2),
  prizePool: new Prisma.Decimal(0),
};

const makeIoStub = () => {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), __emit: emit };
};

const waitForRooms = async (engine: KenoEngine) => {
  for (let i = 0; i < 50; i++) {
    if (engine.getRoomsStatus().length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Engine rooms never initialized');
};

const stopEngineTimers = (engine: KenoEngine) => {
  const rooms = (engine as any).rooms as Map<string, any>;
  for (const room of rooms.values()) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.gameTimer) clearInterval(room.gameTimer);
    if (room.revealTimer) clearInterval(room.revealTimer);
  }
};

// ---------------------------------------------------------------------------
// Pure RTP math
// ---------------------------------------------------------------------------
describe('Keno RTP math', () => {
  it('computes the base RTP for a 1-spot ticket (75%)', () => {
    // P(1 hit) = 20/80 = 0.25, multiplier 3 -> 0.75
    expect(getBaseKenoRtp(1, 20)).toBeCloseTo(0.75, 10);
  });

  it('computes the base RTP for a 2-spot ticket (~72.15%)', () => {
    // P(2 hits) = 20*19/(80*79), multiplier 12
    expect(getBaseKenoRtp(2, 20)).toBeCloseTo(12 * (380 / 6320), 6);
  });

  it('returns 0 for invalid spot counts or draw sizes', () => {
    expect(getBaseKenoRtp(0, 20)).toBe(0);
    expect(getBaseKenoRtp(99, 20)).toBe(0);
    expect(getBaseKenoRtp(1, 0)).toBe(0);
  });

  it('scales a 1-spot win up to hit a 90% RTP target (3 -> 3.6)', () => {
    // factor = 0.9 / 0.75 = 1.2
    expect(getRtpScaledMultiplier(1, 1, 20, 90)).toBe(3.6);
  });

  it('leaves multipliers unchanged when the target equals the base RTP (75%)', () => {
    expect(getRtpScaledMultiplier(1, 1, 20, 75)).toBe(3);
  });

  it('scales a 2-spot jackpot to a 90% target (12 -> 14.97)', () => {
    const base = getBaseKenoRtp(2, 20);
    const expected = Math.round(12 * (0.9 / base) * 100) / 100;
    expect(getRtpScaledMultiplier(2, 2, 20, 90)).toBe(expected);
  });

  it('clamps an absurdly high RTP target to 100%', () => {
    // factor = 1.0 / 0.75 = 4/3 -> 3 * 4/3 = 4
    expect(getRtpScaledMultiplier(1, 1, 20, 150)).toBe(4);
  });

  it('falls back to the base paytable when the target or base is invalid', () => {
    expect(getRtpScaledMultiplier(1, 1, 20, 0)).toBe(3); // target <= 0
    expect(getRtpScaledMultiplier(1, 1, 0, 90)).toBe(3); // base <= 0
    expect(getRtpScaledMultiplier(1, 0, 20, 90)).toBe(0); // losing ticket stays 0
  });
});

// ---------------------------------------------------------------------------
// settleGame integration
// ---------------------------------------------------------------------------
describe('KenoEngine.settleGame with RTP scaling', () => {
  let engine: KenoEngine;
  let ioStub: ReturnType<typeof makeIoStub>;

  // A finished round that drew 20 numbers; the ticket's single spot (1) matched.
  const drawnNumbers = Array.from({ length: 20 }, (_, i) => i + 1);

  beforeEach(async () => {
    mockDb.bingoRoom.findMany.mockResolvedValue([kenoRoom]);
    mockDb.bingoRoom.findUnique.mockResolvedValue(kenoRoom);
    mockDb.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    mockDb.wallet.update.mockResolvedValue({});
    mockDb.transaction.create.mockResolvedValue({});
    mockDb.notification.create.mockResolvedValue({});
    mockDb.kenoTicket.update.mockResolvedValue({});
    mockDb.kenoGame.update.mockResolvedValue({});
    // Defaults apply: rtp_percentage 90
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    ioStub = makeIoStub();
    engine = new KenoEngine(ioStub as any);
    await waitForRooms(engine);

    const room = (engine as any).rooms.get('keno-room-1');
    room.state = 'PLAYING';
    room.gameId = 'game-1';
    room.drawnNumbers = drawnNumbers;
  });

  afterEach(() => {
    stopEngineTimers(engine);
  });

  it('pays a 1-spot win scaled by the default 90% RTP (3.6x on a $2 wager = $7.20)', async () => {
    mockDb.kenoTicket.findMany.mockResolvedValue([
      { id: 't1', userId: 'user-1', spots: [1] },
    ]);

    await (engine as any).settleGame('keno-room-1', 2);

    expect(mockDb.kenoTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { matched: 1, payout: 7.2, isWinner: true },
    });
    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        balance: { increment: 7.2 },
        totalWinnings: { increment: 7.2 },
      },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'GAME_WIN',
        amount: 7.2,
      }),
    });
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'keno_game_finished',
      expect.objectContaining({
        results: [{ userId: 'user-1', matched: 1, payout: 7.2 }],
      })
    );
  });

  it('honors an admin-configured RTP of 75% (multiplier stays 3x -> $6.00)', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'rtp_percentage',
      value: '75',
    });
    mockDb.kenoTicket.findMany.mockResolvedValue([
      { id: 't1', userId: 'user-1', spots: [1] },
    ]);

    await (engine as any).settleGame('keno-room-1', 2);

    expect(mockDb.kenoTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { matched: 1, payout: 6, isWinner: true },
    });
  });

  it('keeps losing tickets at zero payout and never pays out', async () => {
    // Ticket with a 3-spot card that drew none of its numbers
    mockDb.kenoTicket.findMany.mockResolvedValue([
      { id: 't1', userId: 'user-1', spots: [60, 61, 62] },
    ]);

    await (engine as any).settleGame('keno-room-1', 2);

    expect(mockDb.kenoTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { matched: 0, payout: 0, isWinner: false },
    });
    expect(mockDb.wallet.update).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
    expect(mockDb.notification.create).not.toHaveBeenCalled();
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'keno_game_finished',
      expect.objectContaining({ results: [{ userId: 'user-1', matched: 0, payout: 0 }] })
    );
  });
});
