import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { BingoEngine } from './BingoEngine';
import { KenoEngine } from './KenoEngine';
import {
  createSocketRateLimiter,
  checkConnectionRate,
  cleanupSocketTrackers,
  decrementConnectionCount,
} from '../middlewares/socketRateLimiter';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-bingo-12345';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export const setupSocketHandlers = (io: Server, engine: BingoEngine, kenoEngine: KenoEngine) => {
  // Authentication middleware for Socket.IO connections
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    // Rate limit connections per IP
    if (!checkConnectionRate(socket)) {
      return next(new Error('Too many connections from this IP. Please wait before reconnecting.'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        username: decoded.username,
        role: decoded.role,
      };
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) return;

    let activeRoomId: string | null = null;
    let activeKenoRoomId: string | null = null;

    console.log(`Socket Connected: User ${user.username} (ID: ${user.id})`);

    // Create per-socket rate limiter (captures socket in closure)
    const limit = createSocketRateLimiter(socket);

    // ── Rate-limited: Join Room ──
    socket.on('join_room', limit('join_room', async ({ roomId }: { roomId: string }, callback?: Function) => {
      try {
        // Leave a Keno room if the user is currently in one
        if (activeKenoRoomId) {
          socket.leave(activeKenoRoomId);
          kenoEngine.leaveRoom(activeKenoRoomId, user.id, socket.id);
          activeKenoRoomId = null;
        }

        if (activeRoomId) {
          socket.leave(activeRoomId);
          engine.leaveRoom(activeRoomId, user.id, socket.id);
        }

        socket.join(roomId);

        await engine.joinRoom(roomId, user.id, user.username, socket.id);
        // Register the room only after the join fully succeeds so a disconnect
        // during the async join gap can't eject a half-joined player (which
        // would let a rejoin regenerate options out from under another socket).
        activeRoomId = roomId;
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Error joining room: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    }));

    // ── Rate-limited: Leave Room ──
    socket.on('leave_room', limit('leave_room', () => {
      if (activeRoomId) {
        socket.leave(activeRoomId);
        engine.leaveRoom(activeRoomId, user.id, socket.id);
        activeRoomId = null;
      }
    }));

    // --- KENO ---
    socket.on('keno_join_room', limit('keno_join_room', async ({ roomId }, callback) => {
      try {
        // Leave a Bingo room if the user is currently in one
        if (activeRoomId) {
          socket.leave(activeRoomId);
          engine.leaveRoom(activeRoomId, user.id, socket.id);
          activeRoomId = null;
        }

        if (activeKenoRoomId) {
          socket.leave(activeKenoRoomId);
          kenoEngine.leaveRoom(activeKenoRoomId, user.id, socket.id);
        }

        socket.join(roomId);

        await kenoEngine.joinRoom(roomId, user.id, user.username, socket.id);
        // Register the room only after the join fully succeeds (see join_room).
        activeKenoRoomId = roomId;
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Error joining Keno room: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    }));

    socket.on('keno_leave_room', () => {
      if (activeKenoRoomId) {
        socket.leave(activeKenoRoomId);
        kenoEngine.leaveRoom(activeKenoRoomId, user.id, socket.id);
        activeKenoRoomId = null;
      }
    });

    socket.on('keno_pick_numbers', limit('keno_pick_numbers', async ({ spots }, callback) => {
      if (!activeKenoRoomId) {
        if (callback) callback({ success: false, error: 'Not in a Keno room' });
        return;
      }

      try {
        await kenoEngine.pickNumbers(activeKenoRoomId, user.id, spots);
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Keno pick failed: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    }));

    // Handle card selection in the lobby
    socket.on('select_card', ({ cardId }, callback) => {
      if (!activeRoomId) {
        if (callback) callback({ success: false, error: 'Not in a room' });
        return;
      }

      try {
        engine.selectCard(activeRoomId, user.id, cardId);
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Card selection failed: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Handle shuffling (regenerating) card options in the lobby
    socket.on('regenerate_cards', (callback) => {
      if (!activeRoomId) {
        if (callback) callback({ success: false, error: 'Not in a room' });
        return;
      }

      try {
        engine.regenerateCards(activeRoomId, user.id);
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Card shuffle failed: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // ── Rate-limited: Daub Number ──
    socket.on('daub_number', limit('daub_number', ({ cardId, row, col }: { cardId: string; row: number; col: number }) => {
      if (activeRoomId) {
        engine.daubNumber(activeRoomId, user.id, cardId, row, col);
      }
    }));

    // ── Rate-limited: Claim BINGO ──
    socket.on('claim_bingo', limit('claim_bingo', async ({ cardId }: { cardId: string }, callback?: Function) => {
      if (!activeRoomId) {
        if (callback) callback({ success: false, error: 'Not in a game room' });
        return;
      }

      try {
        await engine.claimBingo(activeRoomId, user.id, cardId);
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Bingo Claim Failed: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    }));

    // ── Rate-limited: Send Chat ──
    socket.on('send_chat', limit('send_chat', ({ message }: { message: string }) => {
      if (activeRoomId && message && message.trim().length > 0) {
        io.to(activeRoomId).emit('chat_message', {
          username: user.username,
          message: message.trim(),
          createdAt: new Date(),
        });
      }
    }));

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`Socket Disconnected: User ${user.username}`);
      if (activeRoomId) {
        engine.leaveRoom(activeRoomId, user.id, socket.id);
      }
      if (activeKenoRoomId) {
        kenoEngine.leaveRoom(activeKenoRoomId, user.id, socket.id);
      }
      cleanupSocketTrackers(socket);
      decrementConnectionCount(socket);
    });
  });
};
