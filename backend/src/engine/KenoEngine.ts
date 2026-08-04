import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { getSettingNumber } from '../utils/settings';

/**
 * Draws `count` unique random integers in [min, max].
 */
const drawUnique = (min: number, max: number, count: number): number[] => {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
};

/**
 * Classic Keno paytable (20 of 80 drawn). Multipliers per unit wagered,
 * indexed by [spots][hits]. House edge sits in the ~10-25% range depending
 * on the number of spots, in line with standard casino Keno.
 */
const KENO_PAYTABLE: Record<number, number[]> = {
  1: [0, 3],
  2: [0, 0, 12],
  3: [0, 0, 1, 42],
  4: [0, 0, 1, 5, 90],
  5: [0, 0, 0, 2, 20, 300],
  6: [0, 0, 0, 1, 6, 50, 800],
  7: [0, 0, 0, 0, 2, 20, 200, 2000],
  8: [0, 0, 0, 0, 1, 8, 60, 500, 4000],
  9: [0, 0, 0, 0, 0, 4, 30, 250, 1500, 10000],
  10: [0, 0, 0, 0, 0, 2, 15, 100, 600, 3000, 20000],
  11: [0, 0, 0, 0, 0, 1, 5, 30, 200, 1000, 4000, 15000],
  12: [0, 0, 0, 0, 0, 0, 3, 20, 120, 600, 2500, 10000, 30000],
  13: [0, 0, 0, 0, 0, 0, 2, 12, 80, 400, 1800, 8000, 25000, 60000],
  14: [0, 0, 0, 0, 0, 0, 1, 8, 50, 250, 1200, 5000, 18000, 50000, 100000],
  15: [0, 0, 0, 0, 0, 0, 1, 5, 30, 150, 800, 3500, 12000, 35000, 80000, 150000],
};

export const getKenoMultiplier = (spots: number, hits: number): number => {
  const row = KENO_PAYTABLE[spots];
  if (!row) return 0;
  return row[hits] ?? 0;
};

interface KenoPlayer {
  userId: string;
  username: string;
  socketId?: string;
  // All socket connections belonging to this user in this room. The player
  // entry only goes away when the LAST of their sockets leaves.
  socketIds: string[];
  spots: number[];
  matched: number;
  payout: number;
}

interface KenoRoomState {
  roomId: string;
  gameId: string | null;
  state: 'WAITING' | 'PLAYING' | 'FINISHED';
  countdown: number;
  entryFee: number;
  drawnNumbers: number[];
  players: KenoPlayer[];
  gameTimer: NodeJS.Timeout | null;
  countdownTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
}

export class KenoEngine {
  private io: Server;
  private rooms: Map<string, KenoRoomState> = new Map();

  // Tracks in-flight joins per room:user so concurrent join events can never
  // push the same player twice (parity with BingoEngine).
  private pendingJoins: Map<string, Promise<void>> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.initializeRooms();
  }

  private async initializeRooms() {
    try {
      const dbRooms = await prisma.bingoRoom.findMany({ where: { game: 'KENO' } });

      // If no Keno rooms exist, create defaults
      if (dbRooms.length === 0) {
        const defaults = [
          { name: 'Free Neon Keno', type: 'FREE', entryFee: 0.0, prizePool: 0.0 },
          { name: 'Classic Keno 80', type: 'PAID', entryFee: 2.0, prizePool: 0.0 },
          { name: 'High-Roller Keno Glow', type: 'PAID', entryFee: 10.0, prizePool: 0.0 },
        ];

        for (const room of defaults) {
          await prisma.bingoRoom.create({
            data: {
              name: room.name,
              type: room.type as any,
              game: 'KENO',
              entryFee: room.entryFee,
              prizePool: room.prizePool,
              maxPlayers: 100,
            },
          });
        }
        dbRooms.push(...(await prisma.bingoRoom.findMany({ where: { game: 'KENO' } })));
      }

      for (const room of dbRooms) {
        this.rooms.set(room.id, {
          roomId: room.id,
          gameId: null,
          state: 'WAITING',
          countdown: 15,
          entryFee: room.entryFee.toNumber(),
          drawnNumbers: [],
          players: [],
          gameTimer: null,
          countdownTimer: null,
          revealTimer: null,
        });
      }
      console.log(`Keno Engine: Initialized ${dbRooms.length} rooms.`);
    } catch (error) {
      console.error('Failed to initialize rooms in Keno Engine:', error);
    }
  }

  public getRoomsStatus() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push({
        roomId: id,
        state: room.state,
        playerCount: room.players.length,
        activePlayers: room.players.length,
        botCount: 0,
        countdown: room.countdown,
      });
    }
    return list;
  }

  /** Deducts the entry fee (wager) inside the caller's transaction, including referral commission. */
  private async deductEntryFee(
    tx: Prisma.TransactionClient,
    userId: string,
    username: string,
    amount: number,
    roomName: string
  ) {
    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'ENTRY_FEE',
        amount: -amount,
        description: `Keno wager in ${roomName}`,
      },
    });

    // Referral commission on the wager
    const userDetails = await tx.user.findUnique({ where: { id: userId } });
    if (userDetails?.referredById) {
      const commissionPct = await getSettingNumber('referral_commission_pct');
      const commission = (amount * commissionPct) / 100;

      if (commission > 0) {
        await tx.wallet.update({
          where: { userId: userDetails.referredById },
          data: {
            balance: { increment: commission },
            referralEarnings: { increment: commission },
          },
        });

        await tx.transaction.create({
          data: {
            userId: userDetails.referredById,
            type: 'REFERRAL_BONUS',
            amount: commission,
            description: `Referral commission from ${username}'s Keno wager`,
          },
        });

        await tx.notification.create({
          data: {
            userId: userDetails.referredById,
            title: 'Referral Commission Earned!',
            message: `You earned $${commission.toFixed(2)} from ${username}'s Keno play!`,
          },
        });
      }
    }
  }

  public async joinRoom(roomId: string, userId: string, username: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.state !== 'WAITING') {
      throw new Error('A round is in progress. Please try again in a few seconds.');
    }

    const joinKey = `${roomId}:${userId}`;

    // Already in the room — just refresh the socket connection
    const exists = room.players.find((p) => p.userId === userId);
    if (exists) {
      exists.socketId = socketId;
      if (!exists.socketIds.includes(socketId)) exists.socketIds.push(socketId);
      this.broadcastRoomUpdate(roomId);
      return;
    }

    // A join for this user is already in flight (double-emit, fast rejoin): wait
    // for it to settle instead of starting a second one so the player is pushed
    // exactly once.
    const inFlight = this.pendingJoins.get(joinKey);
    if (inFlight) {
      await inFlight; // propagates success or failure of the in-flight join
      const joined = room.players.find((p) => p.userId === userId);
      if (joined) {
        joined.socketId = socketId;
        if (!joined.socketIds.includes(socketId)) joined.socketIds.push(socketId);
        this.broadcastRoomUpdate(roomId);
      }
      return;
    }

    const joinPromise = this.performJoin(room, roomId, userId, username, socketId);
    this.pendingJoins.set(joinKey, joinPromise);
    try {
      await joinPromise;
    } finally {
      this.pendingJoins.delete(joinKey);
    }
  }

  /** Executes the actual join (player push, broadcasts). Guarded by {@link pendingJoins}. */
  private async performJoin(
    room: KenoRoomState,
    roomId: string,
    userId: string,
    username: string,
    socketId: string
  ) {
    const dbRoom = await prisma.bingoRoom.findUnique({ where: { id: roomId } });
    if (!dbRoom) throw new Error('Room not found');

    // Joining a room is free — the wager is charged per round when the draw starts.
    room.players.push({
      userId,
      username,
      socketId,
      socketIds: [socketId],
      spots: [],
      matched: 0,
      payout: 0,
    });

    this.broadcastRoomUpdate(roomId);
    this.startCountdownIfNeeded(roomId);
  }

  public leaveRoom(roomId: string, userId: string, socketId?: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return;

    const player = room.players[idx];

    // A socketId was given but this user has no membership for it — nothing to drop
    if (socketId && !player.socketIds.includes(socketId)) return;

    // Other sockets of this user are still in the room — just drop this one
    if (socketId && player.socketIds.includes(socketId)) {
      player.socketIds = player.socketIds.filter((id) => id !== socketId);
      if (player.socketId === socketId) player.socketId = player.socketIds[0];
      if (player.socketIds.length > 0) {
        this.broadcastRoomUpdate(roomId);
        return;
      }
    }

    room.players.splice(idx, 1);
    this.broadcastRoomUpdate(roomId);

    // Never abort a round that is already drawing: let it finish so the
    // persisted tickets are settled fairly and the game row closes cleanly.
    if (room.players.length === 0 && room.state !== 'PLAYING') {
      this.resetRoom(roomId);
    }
  }

  /**
   * Lets a player pick their spots (1-80) while waiting. Max spots comes from admin settings.
   */
  public async pickNumbers(roomId: string, userId: string, spots: number[]) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.state !== 'WAITING') throw new Error('Numbers lock in once the round starts');

    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new Error('Player not in this room');

    const maxSpots = await getSettingNumber('keno_max_spots') || 10;
    // Allow 0 spots (cleared ticket — the player gets random numbers auto-assigned at start)
    const cleaned = Array.from(new Set(spots)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 80);

    if (cleaned.length > maxSpots) throw new Error(`You can pick at most ${maxSpots} numbers`);

    player.spots = cleaned;

    // All sockets of this user see the same picks (multi-tab safe)
    player.socketIds.forEach((sid) => {
      this.io.to(sid).emit('keno_picks_update', { spots: player.spots });
    });
  }

  private resetRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.gameTimer) clearInterval(room.gameTimer);
    if (room.revealTimer) clearInterval(room.revealTimer);

    // If a round is cut short here (error path), settle it fairly instead of
    // leaving an orphaned PLAYING game with unsettled tickets.
    if (room.state === 'PLAYING' && room.gameId) {
      this.settleGame(roomId, room.entryFee).catch((err) =>
        console.error('Keno abort settlement failed:', err)
      );
    }

    room.state = 'WAITING';
    room.gameId = null;
    room.countdown = 15;
    room.drawnNumbers = [];
    room.gameTimer = null;
    room.countdownTimer = null;
    room.revealTimer = null;

    // Keno is a rapid-fire game: keep players in the room across rounds
    // (they keep their picks and can edit them during the waiting phase)
    for (const player of room.players) {
      player.matched = 0;
      player.payout = 0;
    }

    this.broadcastRoomUpdate(roomId);

    // Auto-continue into the next round if players are still here
    if (room.players.length > 0) {
      this.startCountdownIfNeeded(roomId);
    }
  }

  private startCountdownIfNeeded(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'WAITING' || room.countdownTimer) return;

    room.countdown = 15;

    room.countdownTimer = setInterval(async () => {
      room.countdown--;

      this.io.to(roomId).emit('keno_countdown', { countdown: room.countdown });

      if (room.countdown <= 0) {
        clearInterval(room.countdownTimer!);
        room.countdownTimer = null;
        try {
          await this.startGame(roomId);
        } catch (error) {
          // Never leave the room stuck: reset (keeps players) and let the
          // countdown restart so the next round attempt can succeed.
          console.error('Keno startGame failed:', error);
          this.resetRoom(roomId);
        }
      }
    }, 1000);
  }

  private async startGame(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'WAITING') return;

    const dbRoom = await prisma.bingoRoom.findUnique({ where: { id: roomId } });
    if (!dbRoom) return;

    const entryFee = dbRoom.entryFee.toNumber();
    room.entryFee = entryFee;
    const maxSpots = (await getSettingNumber('keno_max_spots')) || 10;
    const drawSize = (await getSettingNumber('keno_draw_size')) || 20;

    // Auto-assign random spots to players who didn't pick (so everyone plays)
    for (const player of room.players) {
      if (player.spots.length === 0) {
        player.spots = drawUnique(1, 80, Math.min(5, maxSpots));
      }
      player.matched = 0;
      player.payout = 0;
    }

    // Charge the wager per round (standard Keno). Players who can't cover it are
    // removed from the room with a notification so everyone plays fairly.
    if (entryFee > 0) {
      const payable: KenoPlayer[] = [];
      for (const player of room.players) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: player.userId } });
        if (!wallet || wallet.balance.toNumber() < entryFee) {
          await prisma.notification.create({
            data: {
              userId: player.userId,
              title: 'Keno Wager Failed',
              message: `You didn't have enough balance for the $${entryFee.toFixed(2)} wager in ${dbRoom.name} and were removed from the room.`,
            },
          });

          if (player.socketId) {
            this.io.to(player.socketId).emit('keno_wager_failed', {
              message: `Insufficient balance for the $${entryFee.toFixed(2)} wager — you've been removed from the room.`,
            });
          }
          continue;
        }

        await prisma.$transaction(async (tx) => {
          await this.deductEntryFee(tx, player.userId, player.username, entryFee, dbRoom.name);
        });
        payable.push(player);
      }
      room.players = payable;
    }

    if (room.players.length === 0) {
      // Nobody can afford this round — reset and wait for players
      this.resetRoom(roomId);
      return;
    }

    const drawnNumbers = drawUnique(1, 80, drawSize);

    const game = await prisma.kenoGame.create({
      data: {
        roomId: roomId,
        state: 'PLAYING',
        drawnNumbers,
        startedAt: new Date(),
      },
    });

    room.gameId = game.id;
    room.state = 'PLAYING';
    room.drawnNumbers = drawnNumbers;

    // Persist tickets
    await Promise.all(
      room.players.map((player) =>
        prisma.kenoTicket.create({
          data: {
            gameId: game.id,
            userId: player.userId,
            spots: player.spots,
          },
        })
      )
    );

    this.io.to(roomId).emit('keno_game_started', {
      gameId: game.id,
      drawSize,
      maxSpots,
    });

    this.broadcastRoomUpdate(roomId);
    this.startReveal(roomId, entryFee);
  }

  /** Reveals the drawn numbers one by one, then settles the round. */
  private startReveal(roomId: string, entryFee: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    let index = 0;

    room.revealTimer = setInterval(() => {
      if (!room || room.state !== 'PLAYING') {
        if (room?.revealTimer) clearInterval(room.revealTimer);
        return;
      }

      const revealed = room.drawnNumbers.slice(0, index + 1);
      this.io.to(roomId).emit('keno_draw_number', {
        number: room.drawnNumbers[index],
        revealedCount: index + 1,
        total: room.drawnNumbers.length,
        revealedNumbers: revealed,
      });

      index++;

      if (index >= room.drawnNumbers.length) {
        clearInterval(room.revealTimer!);
        room.revealTimer = null;
        this.endGame(roomId, entryFee);
      }
    }, 600);
  }

  /**
   * Settles the round against the persisted tickets (works even for players who
   * left mid-round) and closes the game row. Safe to call from abort paths too.
   */
  private async settleGame(roomId: string, entryFee: number) {
    const room = this.rooms.get(roomId);
    if (!room || !room.gameId) return;

    // Capture synchronously so the room can be reset while we await.
    const gameId = room.gameId;
    const drawnNumbers = [...room.drawnNumbers];

    const tickets = await prisma.kenoTicket.findMany({ where: { gameId } });
    const results: { userId: string; matched: number; payout: number }[] = [];

    for (const ticket of tickets) {
      const matched = ticket.spots.filter((n) => drawnNumbers.includes(n)).length;
      const multiplier = getKenoMultiplier(ticket.spots.length, matched);
      const payout = multiplier * entryFee;

      await prisma.kenoTicket.update({
        where: { id: ticket.id },
        data: { matched, payout, isWinner: payout > 0 },
      });

      if (payout > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { userId: ticket.userId },
            data: {
              balance: { increment: payout },
              totalWinnings: { increment: payout },
            },
          });

          await tx.transaction.create({
            data: {
              userId: ticket.userId,
              type: 'GAME_WIN',
              amount: payout,
              description: `Keno payout in ${roomId}`,
            },
          });

          await tx.notification.create({
            data: {
              userId: ticket.userId,
              title: 'Keno Win!',
              message: `You matched ${matched} numbers and won $${payout.toFixed(2)}!`,
            },
          });
        });
      }

      results.push({ userId: ticket.userId, matched, payout });
    }

    await prisma.kenoGame.update({
      where: { id: gameId },
      data: { state: 'FINISHED', finishedAt: new Date() },
    });

    this.io.to(roomId).emit('keno_game_finished', {
      drawnNumbers,
      results,
    });
  }

  private async endGame(roomId: string, entryFee: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.revealTimer) clearInterval(room.revealTimer);
    room.revealTimer = null;
    room.state = 'FINISHED';

    this.broadcastRoomUpdate(roomId);

    try {
      await this.settleGame(roomId, entryFee);
    } catch (error) {
      console.error('Keno settlement failed:', error);
    }

    // Reset back to WAITING after a short delay
    setTimeout(() => {
      this.resetRoom(roomId);
    }, 10000);
  }

  private broadcastRoomUpdate(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('keno_room_update', {
      roomId,
      state: room.state,
      countdown: room.countdown,
      players: room.players.map((p) => ({
        userId: p.userId,
        username: p.username,
      })),
    });
  }
}
