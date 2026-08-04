import jwt from 'jsonwebtoken';
import { setupSocketHandlers } from '../engine/socketHandler';

const JWT_SECRET = 'super-secret-key-bingo-12345';

interface FakeSocket {
  id: string;
  user?: { id: string; email: string; username: string; role: string };
  handshake: { auth: { token: string } };
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  handlers: Record<string, (...args: any[]) => void>;
  on: jest.Mock;
}

const makeSocket = (token: string): FakeSocket => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket: FakeSocket = {
    id: 'socket-1',
    handshake: { auth: { token } },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    handlers,
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb;
    }),
  };
  return socket;
};

const makeIo = () => {
  let middleware: (socket: any, next: (err?: Error) => void) => void = () => {};
  let connectionHandler: (socket: any) => void = () => {};
  const io = {
    use: jest.fn((cb: any) => {
      middleware = cb;
    }),
    on: jest.fn((event: string, cb: any) => {
      if (event === 'connection') connectionHandler = cb;
    }),
    to: jest.fn(() => ({ emit: jest.fn() })),
    __middleware: () => middleware,
    __connect: (socket: any) => connectionHandler(socket),
  };
  return io;
};

const makeEngines = () => ({
  engine: {
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    selectCard: jest.fn(),
    regenerateCards: jest.fn(),
    daubNumber: jest.fn(),
    claimBingo: jest.fn(),
  },
  kenoEngine: {
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    pickNumbers: jest.fn(),
  },
});

const validToken = jwt.sign(
  { id: 'user-1', email: 'alice@test.com', username: 'Alice', role: 'USER' },
  JWT_SECRET
);

describe('setupSocketHandlers join lifecycle', () => {
  it('authenticates the socket via the token middleware', () => {
    const io = makeIo();
    setupSocketHandlers(io as any, makeEngines().engine as any, makeEngines().kenoEngine as any);

    const socket = makeSocket(validToken);
    let nextErr: Error | undefined;
    io.__middleware()(socket, (err) => {
      nextErr = err;
    });

    expect(nextErr).toBeUndefined();
    expect(socket.user?.username).toBe('Alice');
  });

  it('rejects a socket with a missing/invalid token', () => {
    const io = makeIo();
    setupSocketHandlers(io as any, makeEngines().engine as any, makeEngines().kenoEngine as any);

    const noToken = makeSocket('');
    let err1: Error | undefined;
    io.__middleware()(noToken, (err) => {
      err1 = err;
    });
    expect(err1?.message).toMatch(/Token missing/);

    const badToken = makeSocket('not-a-jwt');
    let err2: Error | undefined;
    io.__middleware()(badToken, (err) => {
      err2 = err;
    });
    expect(err2?.message).toMatch(/Invalid token/);
  });

  it('does NOT leave a room when the socket disconnects mid-join (activeRoomId only set after join resolves)', async () => {
    const io = makeIo();
    const { engine, kenoEngine } = makeEngines();
    setupSocketHandlers(io as any, engine as any, kenoEngine as any);

    const socket = makeSocket(validToken);
    io.__middleware()(socket, () => {});
    io.__connect(socket);

    // Make the engine join hang (async DB work in flight)
    let resolveJoin!: () => void;
    engine.joinRoom.mockReturnValue(
      new Promise<void>((res) => {
        resolveJoin = res;
      })
    );

    const ack = jest.fn();
    socket.handlers['join_room']({ roomId: 'room-1' }, ack);

    // Disconnect fires while joinRoom is still pending
    socket.handlers['disconnect']();

    // The half-joined player must not be ejected
    expect(engine.leaveRoom).not.toHaveBeenCalled();

    // Join completes; the socket is gone, nothing further should eject either
    resolveJoin();
    await new Promise((r) => setImmediate(r));
    expect(engine.leaveRoom).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it('registers the room only after a successful join, so a later disconnect leaves it', async () => {
    const io = makeIo();
    const { engine, kenoEngine } = makeEngines();
    setupSocketHandlers(io as any, engine as any, kenoEngine as any);

    const socket = makeSocket(validToken);
    io.__middleware()(socket, () => {});
    io.__connect(socket);

    engine.joinRoom.mockResolvedValue(undefined);

    const ack = jest.fn();
    socket.handlers['join_room']({ roomId: 'room-1' }, ack);
    await new Promise((r) => setImmediate(r));

    expect(ack).toHaveBeenCalledWith({ success: true });
    expect(engine.joinRoom).toHaveBeenCalledWith('room-1', 'user-1', 'Alice', 'socket-1');

    // After a successful join, disconnect must clean up the membership
    socket.handlers['disconnect']();
    expect(engine.leaveRoom).toHaveBeenCalledWith('room-1', 'user-1', 'socket-1');
  });

  it('does not register the room when the join fails, so no leave on disconnect', async () => {
    const io = makeIo();
    const { engine, kenoEngine } = makeEngines();
    setupSocketHandlers(io as any, engine as any, kenoEngine as any);

    const socket = makeSocket(validToken);
    io.__middleware()(socket, () => {});
    io.__connect(socket);

    engine.joinRoom.mockRejectedValue(new Error('Insufficient balance'));

    const ack = jest.fn();
    socket.handlers['join_room']({ roomId: 'room-1' }, ack);
    await new Promise((r) => setImmediate(r));

    expect(ack).toHaveBeenCalledWith({ success: false, error: 'Insufficient balance' });

    socket.handlers['disconnect']();
    expect(engine.leaveRoom).not.toHaveBeenCalled();
  });

  it('leaves the previous room (with socket.id) before joining a new one, and on explicit leave_room', async () => {
    const io = makeIo();
    const { engine, kenoEngine } = makeEngines();
    setupSocketHandlers(io as any, engine as any, kenoEngine as any);

    const socket = makeSocket(validToken);
    io.__middleware()(socket, () => {});
    io.__connect(socket);

    engine.joinRoom.mockResolvedValue(undefined);

    socket.handlers['join_room']({ roomId: 'room-1' }, jest.fn());
    await new Promise((r) => setImmediate(r));
    socket.handlers['join_room']({ roomId: 'room-2' }, jest.fn());
    await new Promise((r) => setImmediate(r));

    // Switching rooms must leave the old one with the socket id attached
    expect(engine.leaveRoom).toHaveBeenCalledWith('room-1', 'user-1', 'socket-1');
    expect(engine.joinRoom).toHaveBeenLastCalledWith('room-2', 'user-1', 'Alice', 'socket-1');

    // Explicit leave_room also passes the socket id
    socket.handlers['leave_room']();
    expect(engine.leaveRoom).toHaveBeenCalledWith('room-2', 'user-1', 'socket-1');
  });

  it('tracks keno rooms independently and leaves them with the socket id', async () => {
    const io = makeIo();
    const { engine, kenoEngine } = makeEngines();
    setupSocketHandlers(io as any, engine as any, kenoEngine as any);

    const socket = makeSocket(validToken);
    io.__middleware()(socket, () => {});
    io.__connect(socket);

    kenoEngine.joinRoom.mockResolvedValue(undefined);

    socket.handlers['keno_join_room']({ roomId: 'keno-1' }, jest.fn());
    await new Promise((r) => setImmediate(r));
    expect(kenoEngine.joinRoom).toHaveBeenCalledWith('keno-1', 'user-1', 'Alice', 'socket-1');

    socket.handlers['keno_leave_room']();
    expect(kenoEngine.leaveRoom).toHaveBeenCalledWith('keno-1', 'user-1', 'socket-1');
  });
});
