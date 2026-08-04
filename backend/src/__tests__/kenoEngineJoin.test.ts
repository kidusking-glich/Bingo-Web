import { Prisma } from '@prisma/client';
import prisma from '../db';
import { KenoEngine } from '../engine/KenoEngine';

// Mock the prisma client so the engine runs without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    bingoRoom: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}));

const mockDb = prisma as unknown as {
  bingoRoom: { findMany: jest.Mock; findUnique: jest.Mock };
};

const kenoRoom = {
  id: 'keno-room-1',
  name: 'Test Keno',
  entryFee: new Prisma.Decimal(2),
};

const makeIoStub = () => ({ to: jest.fn(() => ({ emit: jest.fn() })) });

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

describe('KenoEngine.joinRoom (concurrency)', () => {
  let engine: KenoEngine;

  beforeEach(async () => {
    mockDb.bingoRoom.findMany.mockResolvedValue([kenoRoom]);
    mockDb.bingoRoom.findUnique.mockResolvedValue(kenoRoom);

    engine = new KenoEngine(makeIoStub() as any);
    await waitForRooms(engine);
  });

  afterEach(() => {
    stopEngineTimers(engine);
  });

  it('pushes the player only once when two identical joins overlap (double-emit)', async () => {
    await Promise.all([
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a'),
    ]);

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('pushes the player only once and attaches the latest socket when two joins from different sockets overlap', async () => {
    await Promise.all([
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(1);

    const room = (engine as any).rooms.get('keno-room-1');
    expect(room.players[0].socketId).toBe('socket-b');
  });

  it('keeps a single player entry across a sequential rejoin', async () => {
    await engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a');
    await engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-b');

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('propagates the join failure to concurrent callers and pushes nobody', async () => {
    mockDb.bingoRoom.findUnique.mockResolvedValue(null);

    const results = await Promise.allSettled([
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    if (results[0].status === 'rejected') {
      expect(results[0].reason.message).toBe('Room not found');
    }
    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(0);
  });

  it('allows a successful join after a concurrent join failed (pendingJoins cleaned up)', async () => {
    mockDb.bingoRoom.findUnique.mockResolvedValue(null);
    await Promise.allSettled([
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a'),
      engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-b'),
    ]);

    mockDb.bingoRoom.findUnique.mockResolvedValue(kenoRoom);
    await expect(engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-c')).resolves.toBeUndefined();

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(1);
  });

  it('keeps the player when one of two sockets leaves, and removes them when the last socket goes', async () => {
    await engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a');
    await engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-b');

    // One tab closes: the player entry must survive for the co-located tab
    engine.leaveRoom('keno-room-1', 'user-1', 'socket-a');
    let status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(1);
    const room = (engine as any).rooms.get('keno-room-1');
    expect(room.players[0].socketId).toBe('socket-b');

    // Last tab closes: the player is now removed
    engine.leaveRoom('keno-room-1', 'user-1', 'socket-b');
    status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(0);
  });

  it('a leave without a socketId (legacy callers) still removes the player', async () => {
    await engine.joinRoom('keno-room-1', 'user-1', 'Alice', 'socket-a');
    engine.leaveRoom('keno-room-1', 'user-1');

    const status = engine.getRoomsStatus().find((s) => s.roomId === 'keno-room-1');
    expect(status?.playerCount).toBe(0);
  });
});
