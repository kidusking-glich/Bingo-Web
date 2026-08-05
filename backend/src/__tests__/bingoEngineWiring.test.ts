import { Prisma } from '@prisma/client';
import prisma from '../db';
import { BingoEngine, generateBingoGrid } from '../engine/BingoEngine';
import { ProbabilityEngine } from '../engine/ProbabilityEngine';

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
  $transaction: jest.Mock;
};

const freeRoom = {
  id: 'room-1',
  name: 'Test Room',
  entryFee: new Prisma.Decimal(0),
  prizePool: new Prisma.Decimal(10),
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

/**
 * Fires one interval tick synchronously by invoking the timer callback Node
 * stored on the live Timeout object — deterministic, no fake timers needed.
 */
const fireTick = (engine: BingoEngine, roomId: string) => {
  const room = (engine as any).rooms.get(roomId);
  expect(room.gameTimer).not.toBeNull();
  const callback = (room.gameTimer as any)._onTimeout as () => void;
  expect(typeof callback).toBe('function');
  callback();
};

describe('BingoEngine wiring: admin settings drive ball calling', () => {
  let engine: BingoEngine;
  let biasSpy: jest.SpyInstance;
  let selectSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockDb.bingoRoom.findMany.mockResolvedValue([freeRoom]);
    mockDb.bingoRoom.findUnique.mockResolvedValue(freeRoom);
    mockDb.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    // No admin settings stored -> defaults apply
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    engine = new BingoEngine(makeIoStub() as any);
    await waitForRooms(engine);

    biasSpy = jest.spyOn(ProbabilityEngine, 'decideTargetBias');
    selectSpy = jest.spyOn(ProbabilityEngine, 'selectNextBall');
  });

  afterEach(() => {
    stopEngineTimers(engine);
    biasSpy.mockRestore();
    selectSpy.mockRestore();
  });

  /** Puts the room into PLAYING with one human player holding a single card. */
  const startPlayingRoom = () => {
    const room = (engine as any).rooms.get('room-1');
    room.state = 'PLAYING';
    room.calledNumbers = [];
    room.players.push({
      userId: 'user-1',
      username: 'Alice',
      isBot: false,
      socketId: 'socket-a',
      socketIds: ['socket-a'],
      cardOptions: [],
      cards: [
        {
          id: 'card-1',
          grid: generateBingoGrid(),
          daubed: Array.from({ length: 5 }, () => Array(5).fill(false)),
        },
      ],
    });
  };

  it('calls decideTargetBias once per game and passes its result into every ball call', async () => {
    biasSpy.mockResolvedValue('HUMAN');
    selectSpy.mockReturnValueOnce(7).mockReturnValueOnce(9);
    startPlayingRoom();

    await (engine as any).startGameTicks('room-1');

    // The bias is decided up front, then reused across every tick
    expect(biasSpy).toHaveBeenCalledTimes(1);

    fireTick(engine, 'room-1');
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), 'HUMAN');

    fireTick(engine, 'room-1');
    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(selectSpy).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), 'HUMAN');
  });

  it('flows a BOT bias (e.g. from a high human win rate) into the ball calls', async () => {
    biasSpy.mockResolvedValue('BOT');
    selectSpy.mockReturnValue(7);
    startPlayingRoom();

    await (engine as any).startGameTicks('room-1');
    fireTick(engine, 'room-1');

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), 'BOT');
  });

  it('respects the number_calling_speed admin setting as the tick interval', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'number_calling_speed',
      value: '2',
    });
    biasSpy.mockResolvedValue('NEUTRAL');
    selectSpy.mockReturnValue(7);
    startPlayingRoom();

    await (engine as any).startGameTicks('room-1');

    // Interval was scheduled with a 2s delay (number_calling_speed * 1000)
    const room = (engine as any).rooms.get('room-1');
    expect((room.gameTimer as any)._idleTimeout).toBe(2000);
  });

  it('broadcasts and records the ball selected on each tick', async () => {
    biasSpy.mockResolvedValue('NEUTRAL');
    selectSpy.mockReturnValue(7);
    startPlayingRoom();

    const ioStub = (engine as any).io;
    await (engine as any).startGameTicks('room-1');
    fireTick(engine, 'room-1');

    const room = (engine as any).rooms.get('room-1');
    expect(room.calledNumbers).toEqual([7]);
    // The tick broadcasts the number_called event with the selected ball
    expect(ioStub.to).toHaveBeenCalledWith('room-1');
    expect(ioStub.__emit).toHaveBeenCalledWith(
      'number_called',
      expect.objectContaining({ number: 7, calledNumbers: [7] })
    );
  });
});
