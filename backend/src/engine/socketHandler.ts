import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { BingoEngine } from './BingoEngine';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-bingo-12345';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export const setupSocketHandlers = (io: Server, engine: BingoEngine) => {
  // Authentication middleware for Socket.IO connections
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
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

    console.log(`Socket Connected: User ${user.username} (ID: ${user.id})`);

    // Handle joining a room
    socket.on('join_room', async ({ roomId }, callback) => {
      try {
        if (activeRoomId) {
          socket.leave(activeRoomId);
          engine.leaveRoom(activeRoomId, user.id);
        }

        socket.join(roomId);
        activeRoomId = roomId;

        await engine.joinRoom(roomId, user.id, user.username, socket.id);
        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error(`Error joining room: ${err.message}`);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Handle leaving a room
    socket.on('leave_room', () => {
      if (activeRoomId) {
        socket.leave(activeRoomId);
        engine.leaveRoom(activeRoomId, user.id);
        activeRoomId = null;
      }
    });

    // Handle number daub
    socket.on('daub_number', ({ cardId, row, col }) => {
      if (activeRoomId) {
        engine.daubNumber(activeRoomId, user.id, cardId, row, col);
      }
    });

    // Handle claiming BINGO
    socket.on('claim_bingo', async ({ cardId }, callback) => {
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
    });

    // Handle Chat message
    socket.on('send_chat', ({ message }) => {
      if (activeRoomId && message && message.trim().length > 0) {
        io.to(activeRoomId).emit('chat_message', {
          username: user.username,
          message: message.trim(),
          createdAt: new Date(),
        });
      }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`Socket Disconnected: User ${user.username}`);
      if (activeRoomId) {
        engine.leaveRoom(activeRoomId, user.id);
      }
    });
  });
};
