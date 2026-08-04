import { Prisma } from '@prisma/client';
import prisma from '../db';
import { BingoEngine } from '../engine/BingoEngine';

// Mock the prisma client so the engine runs without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    bingoRoom: { findMany: jest.fn(), findUnique: jest.fn() },
    wallet: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    referralEarning: { create: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = prisma as unknown as {
  bingoRoom: { findMany: jest.Mock; findUnique: jest.Mock };
  wallet: { findUnique: jest.Mock; update: jest.Mock };
  transaction: { create: jest.Mock };
  $transaction: jest.Mock;
};

const freeRoom = {
  id: 'room-1',
  name: 'Test Room',
  entryFee: new Prisma.Decimal(0),
};

const makeIoStub = () => ({ to: jest.fn(() => ({ emit: jest.fn() })) });

// The engine initializes rooms asynchronously in its constructor, so wait until
// the room map is populated before exercising joinRoom.
const waitForRooms = async (engine: BingoEngine) => {
  for (let i = 0; i < 50; i++) {
    if (engine.getRoomsStatus().length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Engine rooms never initialized');
};

// Clear the engine's in-memory countdown/game timers so Jest can exit cleanly.
const stopEngineTimers = (engine: BingoEngine) => {
  const rooms = (engine as any).rooms as Map<string, any>;
  for (const room of rooms.values()) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.gameTimer) clearInterval(room.gameTimer);
  }
};

describe('BingoEngine.joinRoom (concurrency)', () => {
  let engine: BingoEngine;

  beforeEach(async () => {
    mockDb.bingoRoom.findMany.mockResolvedValue([freeRoom]);
    mockDb.bingoRoom.findUnique.mockResolvedValue(freeRoom);
    mockDb.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));

    engine = new BingoEngine(makeIoStub() as any);
    await waitForRooms(engine);
  });

  afterEach(() => {
    stopEngineTimers(engine);
  });

  it('pushes the player only once when two identical joins overlap (double-emit)', async () => {
    await Promise.all([
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
    ]);

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('pushes the player only once and attaches the latest socket when two joins from different sockets overlap', async () => {
    await Promise.all([
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);

    // The in-flight waiter must have re-attached its own socket to the player
    const room = (engine as any).rooms.get('room-1');
    expect(room.players[0].socketId).toBe('socket-b');
  });

  it('keeps a single player entry across a sequential rejoin', async () => {
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a');
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-b');

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('charges the entry fee only once for overlapping paid joins', async () => {
    const paidRoom = { id: 'room-1', name: 'Paid Room', entryFee: new Prisma.Decimal(5) };
    mockDb.bingoRoom.findUnique.mockResolvedValue(paidRoom);
    mockDb.wallet.findUnique.mockResolvedValue({ balance: new Prisma.Decimal(100) });

    await Promise.all([
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
    ]);

    expect(mockDb.wallet.update).toHaveBeenCalledTimes(1);
    expect(mockDb.transaction.create).toHaveBeenCalledTimes(1);
    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('propagates the join failure to concurrent callers and pushes nobody', async () => {
    const paidRoom = { id: 'room-1', name: 'Paid Room', entryFee: new Prisma.Decimal(5) };
    mockDb.bingoRoom.findUnique.mockResolvedValue(paidRoom);
    mockDb.wallet.findUnique.mockResolvedValue({ balance: new Prisma.Decimal(1) }); // can't cover $5

    const results = await Promise.allSettled([
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    if (results[0].status === 'rejected') {
      expect(results[0].reason.message).toBe('Insufficient balance');
    }
    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(0);
  });

  it('allows a successful join after a concurrent join failed (pendingJoins cleaned up)', async () => {
    const paidRoom = { id: 'room-1', name: 'Paid Room', entryFee: new Prisma.Decimal(5) };
    mockDb.bingoRoom.findUnique.mockResolvedValue(paidRoom);
    mockDb.wallet.findUnique.mockResolvedValue({ balance: new Prisma.Decimal(1) }); // can't cover $5

    await Promise.allSettled([
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    // Fund the user, then the very next join must succeed (no stale in-flight entry)
    mockDb.wallet.findUnique.mockResolvedValue({ balance: new Prisma.Decimal(100) });
    await expect(engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-c')).resolves.toBeUndefined();

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('keeps the player when one of two sockets leaves, and removes them when the last socket goes', async () => {
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a');
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-b');

    // One tab closes: the player entry must survive for the co-located tab
    engine.leaveRoom('room-1', 'user-1', 'socket-a');
    let status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
    const room = (engine as any).rooms.get('room-1');
    expect(room.players[0].socketId).toBe('socket-b');

    // Last tab closes: the player is now removed
    engine.leaveRoom('room-1', 'user-1', 'socket-b');
    status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(0);
  });

  it('a leave without a socketId (legacy callers) still removes the player', async () => {
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a');
    engine.leaveRoom('room-1', 'user-1');

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(0);
  });

  it('ignores a leave from a socket the user is not a member of', async () => {
    await engine.joinRoom('room-1', 'user-1', 'Alice', 'socket-a');
    engine.leaveRoom('room-1', 'user-1', 'unknown-socket');

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('re-sends card options to every socket of the user on rejoin', async () => {
    const ioStub = makeIoStub();
    const e = new BingoEngine(ioStub as any);
    await waitForRooms(e);
    mockDb.bingoRoom.findUnique.mockResolvedValue(freeRoom);

    await e.joinRoom('room-1', 'user-1', 'Alice', 'socket-a');
    await e.joinRoom('room-1', 'user-1', 'Alice', 'socket-b');

    const toA = ioStub.to.mock.calls.filter((c: string[]) => c[0] === 'socket-a');
    const toB = ioStub.to.mock.calls.filter((c: string[]) => c[0] === 'socket-b');
    expect(toA.some((c: string[]) => true)).toBe(true);
    expect(toB.some((c: string[]) => true)).toBe(true);
    stopEngineTimers(e);
  });
});
