import { Socket } from 'socket.io';

// ── Per-event rate limit config ──
const DEFAULT_LIMITS: Record<string, { max: number; windowMs: number }> = {
  join_room: { max: 6, windowMs: 60000 },       // 6 joins per minute
  leave_room: { max: 10, windowMs: 60000 },      // 10 leaves per minute
  daub_number: { max: 60, windowMs: 60000 },     // 60 daubs per minute (1/sec average)
  claim_bingo: { max: 5, windowMs: 60000 },      // 5 claim attempts per minute
  send_chat: { max: 12, windowMs: 60000 },       // 12 messages per minute
};

// Override from env: SOCKET_RATE_LIMITS={"join_room":"10/60000","send_chat":"20/60000"}
const ENV_OVERRIDES: Record<string, { max: number; windowMs: number }> = {};
try {
  const raw = process.env.SOCKET_RATE_LIMITS;
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [event, rule] of Object.entries(parsed)) {
      if (typeof rule === 'string') {
        const [maxStr, windowStr] = rule.split('/');
        ENV_OVERRIDES[event] = {
          max: parseInt(maxStr, 10) || 5,
          windowMs: parseInt(windowStr, 10) || 60000,
        };
      }
    }
  }
} catch { /* ignore invalid env */ }

function getLimits(event: string) {
  return ENV_OVERRIDES[event] || DEFAULT_LIMITS[event] || null;
}

// ── Per-socket tracking ──
interface EventTracker {
  count: number;
  windowStart: number;
}

const socketTrackers = new WeakMap<Socket, Map<string, EventTracker>>();

function getTracker(socket: Socket, event: string): EventTracker {
  let eventMap = socketTrackers.get(socket);
  if (!eventMap) {
    eventMap = new Map();
    socketTrackers.set(socket, eventMap);
  }

  let tracker = eventMap.get(event);
  if (!tracker) {
    tracker = { count: 0, windowStart: Date.now() };
    eventMap.set(event, tracker);
  }
  return tracker;
}

// Clean up on disconnect
export function cleanupSocketTrackers(socket: Socket) {
  socketTrackers.delete(socket);
}

// ── Rate limiter factory ──
// Creates a per-socket rate limiter that returns wrapped handlers
// capturing the socket in a closure (since Socket.IO doesn't pass
// the socket to event handlers — it only passes payload + callback).
export function createSocketRateLimiter(socket: Socket) {
  return function limit(event: string, handler: (...args: any[]) => void | Promise<void>) {
    return (...args: any[]) => {
      const limits = getLimits(event);
      if (!limits) return handler(...args);

      const tracker = getTracker(socket, event);
      const now = Date.now();

      // Reset window if expired
      if (now - tracker.windowStart > limits.windowMs) {
        tracker.count = 0;
        tracker.windowStart = now;
      }

      tracker.count++;

      if (tracker.count > limits.max) {
        // Rate limit exceeded — extract callback if last arg is a function
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        if (callback) {
          callback({ success: false, error: `Rate limited. Too many '${event}' events. Please slow down.` });
        } else {
          socket.emit('rate_limited', { event, message: `Too many '${event}' events. Please slow down.` });
        }
        return;
      }

      return handler(...args);
    };
  };
}

// ── Connect rate limiter (limit new connections per IP) ──
const ipConnections = new Map<string, { count: number; windowStart: number }>();
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.SOCKET_MAX_CONNECTIONS_PER_IP || '5', 10) || 5;
const CONNECTION_WINDOW_MS = parseInt(process.env.SOCKET_CONNECTION_WINDOW_MS || '60000', 10) || 60000;

export function checkConnectionRate(socket: Socket): boolean {
  const ip = socket.handshake.address || 'unknown';
  const now = Date.now();

  let record = ipConnections.get(ip);
  if (!record || now - record.windowStart > CONNECTION_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    ipConnections.set(ip, record);
  }

  record.count++;
  if (record.count > MAX_CONNECTIONS_PER_IP) {
    return false; // Reject connection
  }

  return true;
}

// Clean up IP tracking on disconnect (decrement)
export function decrementConnectionCount(socket: Socket) {
  const ip = socket.handshake.address || 'unknown';
  const record = ipConnections.get(ip);
  if (record && record.count > 0) {
    record.count--;
  }
}
