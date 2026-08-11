import { Socket } from 'socket.io';
import {
  createSocketRateLimiter,
  checkConnectionRate,
  cleanupSocketTrackers,
  decrementConnectionCount,
} from '../middlewares/socketRateLimiter';

// ── Helper: create a minimal Socket mock ──
function createMockSocket(ip: string = '127.0.0.1'): Socket {
  return {
    handshake: { address: ip },
    emit: jest.fn(),
  } as unknown as Socket;
}

// ── Helper: advance fake timers ──
function fastForward(ms: number) {
  jest.advanceTimersByTime(ms);
}

// ---------------------------------------------------------------------------
// createSocketRateLimiter — limit()
// ---------------------------------------------------------------------------
describe('createSocketRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Fake Date too, so advanceTimersByTime expires rate-limit windows
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Limits ──
  it('should allow events under the configured limit', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();

    const wrapped = limit('join_room', handler);

    // Fire 6 times (limit is 6/min)
    for (let i = 0; i < 6; i++) {
      wrapped({ roomId: 'abc' });
    }

    expect(handler).toHaveBeenCalledTimes(6);
  });

  it('should block events that exceed the configured limit', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();
    const callback = jest.fn();

    const wrapped = limit('join_room', handler);

    // Fire 7 times (limit is 6)
    for (let i = 0; i < 7; i++) {
      wrapped({ roomId: 'abc' }, callback);
    }

    // Handler should only be called 6 times
    expect(handler).toHaveBeenCalledTimes(6);
    // Callback should have been called with error on the 7th
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Rate limited'),
    });
  });

  it('should call the callback with error when rate limited', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();
    const callback = jest.fn();

    const wrapped = limit('join_room', handler);

    // Exhaust the limit
    for (let i = 0; i < 6; i++) wrapped({}, () => {});

    // 7th attempt with callback
    wrapped({ roomId: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining("Too many 'join_room'"),
    });
  });

  it('should emit rate_limited event when no callback is provided', () => {
    const socket = createMockSocket();
    const emitSpy = jest.spyOn(socket, 'emit');
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();

    const wrapped = limit('join_room', handler);

    // Exhaust the limit
    for (let i = 0; i < 6; i++) wrapped({});

    // 7th with no callback
    wrapped({ roomId: 'x' });

    expect(emitSpy).toHaveBeenCalledWith('rate_limited', {
      event: 'join_room',
      message: expect.stringContaining('Too many'),
    });
  });

  it('should allow through events that have no configured limit', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();

    const wrapped = limit('unknown_event', handler);

    // Fire many times — no limit configured for this event
    for (let i = 0; i < 100; i++) wrapped({});

    expect(handler).toHaveBeenCalledTimes(100);
  });

  it('should pass handler arguments correctly when not rate limited', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();

    const wrapped = limit('daub_number', handler);

    wrapped({ cardId: 'card1', row: 2, col: 3 }, jest.fn());

    expect(handler).toHaveBeenCalledWith(
      { cardId: 'card1', row: 2, col: 3 },
      expect.any(Function)
    );
  });

  it('should reset counter after the window expires', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();
    const callback = jest.fn();

    const wrapped = limit('join_room', handler);

    // Exhaust the limit (6 calls)
    for (let i = 0; i < 6; i++) wrapped({});

    // Advance time past the 60s window
    fastForward(61000);

    // Should be allowed again
    wrapped({}, callback);

    expect(handler).toHaveBeenCalledTimes(7);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should track events separately per event type', () => {
    const socket = createMockSocket();
    const limit = createSocketRateLimiter(socket);
    const joinHandler = jest.fn();
    const daubHandler = jest.fn();

    const joinWrapped = limit('join_room', joinHandler);
    const daubWrapped = limit('daub_number', daubHandler);

    // Exhaust join_room limit
    for (let i = 0; i < 6; i++) joinWrapped({});
    // daub_number has a limit of 60 — 10 should be fine
    for (let i = 0; i < 10; i++) daubWrapped({ cardId: 'c', row: 1, col: 2 });

    expect(joinHandler).toHaveBeenCalledTimes(6); // exactly at limit
    expect(daubHandler).toHaveBeenCalledTimes(10); // all passed
  });

  it('should track events separately per socket', () => {
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    const limit1 = createSocketRateLimiter(socket1);
    const limit2 = createSocketRateLimiter(socket2);
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const wrapped1 = limit1('join_room', handler1);
    const wrapped2 = limit2('join_room', handler2);

    // Exhaust socket1's limit
    for (let i = 0; i < 6; i++) wrapped1({});
    // socket2 should not be affected
    for (let i = 0; i < 6; i++) wrapped2({});

    expect(handler1).toHaveBeenCalledTimes(6);
    expect(handler2).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
// checkConnectionRate
// ---------------------------------------------------------------------------
describe('checkConnectionRate', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Fake Date too, so advanceTimersByTime expires rate-limit windows
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return true for connections under the limit', () => {
    const socket = createMockSocket('10.0.0.1');

    for (let i = 0; i < 5; i++) {
      expect(checkConnectionRate(socket)).toBe(true);
    }
  });

  it('should return false for connections over the limit', () => {
    const socket = createMockSocket('10.0.0.2');

    for (let i = 0; i < 5; i++) {
      checkConnectionRate(socket);
    }

    // 6th connection should be rejected
    expect(checkConnectionRate(socket)).toBe(false);
  });

  it('should reset after the connection window expires', () => {
    const socket = createMockSocket('10.0.0.3');

    for (let i = 0; i < 5; i++) {
      checkConnectionRate(socket);
    }

    // 6th should fail
    expect(checkConnectionRate(socket)).toBe(false);

    // Advance past the 60s window
    fastForward(61000);

    // Should be allowed again
    expect(checkConnectionRate(socket)).toBe(true);
  });

  it('should track IPs independently', () => {
    const socketA = createMockSocket('10.0.0.4');
    const socketB = createMockSocket('10.0.0.5');

    // Exhaust socketA
    for (let i = 0; i < 5; i++) checkConnectionRate(socketA);
    expect(checkConnectionRate(socketA)).toBe(false);

    // socketB should be unaffected
    for (let i = 0; i < 5; i++) {
      expect(checkConnectionRate(socketB)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// decrementConnectionCount
// ---------------------------------------------------------------------------
describe('decrementConnectionCount', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Fake Date too, so advanceTimersByTime expires rate-limit windows
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should decrement the connection count allowing a new connection', () => {
    const socket = createMockSocket('10.0.0.10');

    // Fill all connection slots (5 max per IP)
    for (let i = 0; i < 5; i++) {
      expect(checkConnectionRate(socket)).toBe(true);
    }

    // Simulate a disconnect — frees one slot
    decrementConnectionCount(socket);

    // A new connection should now be allowed
    expect(checkConnectionRate(socket)).toBe(true);
  });

  it('should not go below zero', () => {
    const socket = createMockSocket('10.0.0.11');

    // Decrement with no prior connections
    decrementConnectionCount(socket);

    // Should still accept connections
    expect(checkConnectionRate(socket)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupSocketTrackers
// ---------------------------------------------------------------------------
describe('cleanupSocketTrackers', () => {
  it('should clear the tracker for a socket without throwing', () => {
    const socket = createMockSocket();

    // Create a rate limiter and use it to set up tracking
    const limit = createSocketRateLimiter(socket);
    const handler = jest.fn();
    const wrapped = limit('join_room', handler);
    wrapped({}); // This sets up the tracker

    // Should not throw
    expect(() => cleanupSocketTrackers(socket)).not.toThrow();
  });

  it('should allow a new rate limiter on the same socket after cleanup', () => {
    const socket = createMockSocket();

    // First round
    const limit1 = createSocketRateLimiter(socket);
    const handler1 = jest.fn();
    const wrapped1 = limit1('join_room', handler1);
    for (let i = 0; i < 6; i++) wrapped1({});

    // 7th should be blocked
    const cb1 = jest.fn();
    wrapped1({}, cb1);
    expect(cb1).toHaveBeenCalled();

    // Cleanup
    cleanupSocketTrackers(socket);

    // Second round — should start fresh
    const limit2 = createSocketRateLimiter(socket);
    const handler2 = jest.fn();
    const wrapped2 = limit2('join_room', handler2);
    for (let i = 0; i < 6; i++) wrapped2({});

    expect(handler2).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
// Env override parsing (integration)
// ---------------------------------------------------------------------------
describe('SOCKET_RATE_LIMITS env override', () => {
  const ORIGINAL_ENV = process.env.SOCKET_RATE_LIMITS;

  beforeEach(() => {
    // Force a fresh module instance so env overrides are re-evaluated
    jest.resetModules();
  });

  afterEach(() => {
    process.env.SOCKET_RATE_LIMITS = ORIGINAL_ENV;
    // Clear module to re-evaluate env var on next import
    jest.resetModules();
  });

  it('should use env overrides when SOCKET_RATE_LIMITS is set', () => {
    process.env.SOCKET_RATE_LIMITS = JSON.stringify({
      join_room: '20/60000',
      send_chat: '30/60000',
    });

    // Re-import to evaluate env
    const { createSocketRateLimiter: createLimiter } = require('../middlewares/socketRateLimiter');

    const socket = createMockSocket();
    const limit = createLimiter(socket);
    const handler = jest.fn();

    const wrapped = limit('join_room', handler);

    // Should allow 20 (not just 6)
    for (let i = 0; i < 20; i++) wrapped({});
    expect(handler).toHaveBeenCalledTimes(20);

    // 21st should be blocked
    wrapped({}, jest.fn());
    expect(handler).toHaveBeenCalledTimes(20);
  });

  it('should fall back to defaults for events not in env override', () => {
    process.env.SOCKET_RATE_LIMITS = JSON.stringify({
      join_room: '20/60000',
    });

    const { createSocketRateLimiter: createLimiter } = require('../middlewares/socketRateLimiter');

    const socket = createMockSocket();
    const limit = createLimiter(socket);
    const handler = jest.fn();

    // daub_number is not overridden, should use default (60)
    const wrapped = limit('daub_number', handler);
    for (let i = 0; i < 60; i++) wrapped({});
    expect(handler).toHaveBeenCalledTimes(60);
  });

  it('should not crash on invalid env JSON', () => {
    process.env.SOCKET_RATE_LIMITS = 'not-valid-json';

    expect(() => {
      const { createSocketRateLimiter: createLimiter } = require('../middlewares/socketRateLimiter');
      const limit = createLimiter(createMockSocket());
      const handler = jest.fn();
      const wrapped = limit('join_room', handler);
      wrapped({});
    }).not.toThrow();
  });
});
