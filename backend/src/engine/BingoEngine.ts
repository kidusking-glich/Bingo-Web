import { Server } from 'socket.io';
import prisma from '../db';
import { getSettingNumber } from '../utils/settings';
import { ProbabilityEngine, BingoCardData } from './ProbabilityEngine';

const getRandomUniqueSubarray = (min: number, max: number, count: number): number[] => {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
};

const CARD_OPTIONS_COUNT = 3;

/**
 * Generates a fresh set of card options for the lobby picker.
 */
const generateCardOptions = () =>
  Array.from({ length: CARD_OPTIONS_COUNT }, () => ({
    id: Math.random().toString(36).substring(2, 9),
    grid: generateBingoGrid(),
  }));

export const generateBingoGrid = (): number[][] => {
  const columns = [
    getRandomUniqueSubarray(1, 15, 5),
    getRandomUniqueSubarray(16, 30, 5),
    getRandomUniqueSubarray(31, 45, 5),
    getRandomUniqueSubarray(46, 60, 5),
    getRandomUniqueSubarray(61, 75, 5),
  ];

  const grid: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: number[] = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        row.push(0); // FREE space
      } else {
        row.push(columns[c][r]);
      }
    }
    grid.push(row);
  }
  return grid;
};

interface RoomState {
  roomId: string;
  gameId: string | null;
  state: 'WAITING' | 'PLAYING' | 'FINISHED';
  countdown: number; // countdown in seconds to start
  calledNumbers: number[];
  players: {
    userId: string;
    username: string;
    isBot: boolean;
    socketId?: string;
    // All socket connections belonging to this user in this room. The player
    // entry only goes away when the LAST of their sockets leaves, so one tab
    // closing can never eject a co-located tab.
    socketIds: string[];
    cardOptions: {
      id: string;
      grid: number[][];
    }[];
    cards: {
      id: string;
      grid: number[][];
      daubed: boolean[][];
    }[];
  }[];
  gameTimer: NodeJS.Timeout | null;
  countdownTimer: NodeJS.Timeout | null;
}

export class BingoEngine {
  private io: Server;
  private rooms: Map<string, RoomState> = new Map();

  // Tracks in-flight joins per room:user so concurrent join events (e.g. a
  // double-emit or a fast reconnect) can never push the same player twice.
  private pendingJoins: Map<string, Promise<void>> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.initializeRooms();
  }

  /**
   * Loads rooms from DB and initializes active states in memory
   */
  private async initializeRooms() {
    try {
      const dbRooms = await prisma.bingoRoom.findMany({ where: { game: 'BINGO' } });
      
      // If no Bingo rooms exist, create default ones
      if (dbRooms.length === 0) {
        const defaults = [
          { name: 'Free Neon Lobby', type: 'FREE', entryFee: 0.0, prizePool: 0.0 },
          { name: 'Standard Cyan Club', type: 'PAID', entryFee: 5.0, prizePool: 20.0 },
          { name: 'High-Roller Vegas Glow', type: 'PAID', entryFee: 20.0, prizePool: 80.0 },
          { name: 'Glow Tournament Room', type: 'TOURNAMENT', entryFee: 10.0, prizePool: 50.0 },
        ];

        for (const room of defaults) {
          const newRoom = await prisma.bingoRoom.create({
            data: {
              name: room.name,
              type: room.type as any,
              entryFee: room.entryFee,
              prizePool: room.prizePool,
              maxPlayers: 50,
            },
          });
          dbRooms.push(newRoom);
        }
      }

      for (const room of dbRooms) {
        this.rooms.set(room.id, {
          roomId: room.id,
          gameId: null,
          state: 'WAITING',
          countdown: 15,
          calledNumbers: [],
          players: [],
          gameTimer: null,
          countdownTimer: null,
        });
      }
      console.log(`Bingo Engine: Initialized ${dbRooms.length} rooms.`);
    } catch (error) {
      console.error('Failed to initialize rooms in Bingo Engine:', error);
    }
  }

  public getRoomsStatus() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push({
        roomId: id,
        state: room.state,
        playerCount: room.players.length,
        activePlayers: room.players.filter(p => !p.isBot).length,
        botCount: room.players.filter(p => p.isBot).length,
        countdown: room.countdown,
      });
    }
    return list;
  }

  /**
   * Joins a room
   */
  public async joinRoom(roomId: string, userId: string, username: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const joinKey = `${roomId}:${userId}`;

    // Already in the room — just refresh the socket connection and re-send the picker
    const exists = room.players.find((p) => p.userId === userId);
    if (exists) {
      exists.socketId = socketId;
      if (!exists.socketIds.includes(socketId)) exists.socketIds.push(socketId);
      if (room.state === 'WAITING' && exists.cardOptions.length > 0) {
        // Every socket of this user sees the same options (multi-tab safe)
        exists.socketIds.forEach((sid) => this.io.to(sid).emit('card_options', { cards: exists.cardOptions }));
      }
      this.broadcastRoomUpdate(roomId);
      return;
    }

    // A join for this user is already in flight (double-emit, fast rejoin): wait
    // for it to settle instead of starting a second one. This guarantees the
    // player is pushed exactly once — no duplicate entries and no double fee.
    const inFlight = this.pendingJoins.get(joinKey);
    if (inFlight) {
      await inFlight; // propagates success or failure of the in-flight join
      const joined = room.players.find((p) => p.userId === userId);
      if (joined) {
        joined.socketId = socketId;
        if (!joined.socketIds.includes(socketId)) joined.socketIds.push(socketId);
        if (room.state === 'WAITING' && joined.cardOptions.length > 0) {
          joined.socketIds.forEach((sid) => this.io.to(sid).emit('card_options', { cards: joined.cardOptions }));
        }
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

  /**
   * Executes the actual join (fee deduction, player push, broadcasts).
   * Guarded by {@link pendingJoins} so it runs at most once per room:user.
   */
  private async performJoin(
    room: RoomState,
    roomId: string,
    userId: string,
    username: string,
    socketId: string
  ) {
    // Load Room settings
    const dbRoom = await prisma.bingoRoom.findUnique({ where: { id: roomId } });
    if (!dbRoom) throw new Error('Room not found');

    const entryFee = dbRoom.entryFee.toNumber();

    // Deduct entry fee if paid
    if (entryFee > 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance.toNumber() < entryFee) {
        throw new Error('Insufficient balance');
      }

      // Perform fee deduction in transaction
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: entryFee } },
        });

        await tx.transaction.create({
          data: {
            userId,
            type: 'ENTRY_FEE',
            amount: -entryFee,
            description: `Entry fee for room ${dbRoom.name}`,
          },
        });

        // Referral commission
        const userDetails = await tx.user.findUnique({ where: { id: userId } });
        if (userDetails?.referredById) {
          const commissionPct = await getSettingNumber('referral_commission_pct');
          const commission = (entryFee * commissionPct) / 100;

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
                description: `Referral commission from ${username}'s entry fee`,
              },
            });

            await tx.referralEarning.create({
              data: {
                userId: userDetails.referredById,
                referredId: userId,
                amount: commission,
              },
            });

            await tx.notification.create({
              data: {
                userId: userDetails.referredById,
                title: 'Referral Commission Earned!',
                message: `You earned $${commission.toFixed(2)} from ${username}'s room play!`,
              },
            });
          }
        }
      });
    }

    // Generate card options for the user to choose from in the lobby
    const cardOptions = generateCardOptions();

    room.players.push({
      userId,
      username,
      isBot: false,
      socketId,
      socketIds: [socketId],
      cardOptions,
      cards: [], // chosen card is filled in once the user picks
    });

    // Send the card options to this specific user for selection
    this.io.to(socketId).emit('card_options', { cards: cardOptions });

    this.io.to(roomId).emit('chat_message', {
      username: 'System',
      message: `${username} joined the lobby!`,
      createdAt: new Date(),
    });

    this.broadcastRoomUpdate(roomId);
    this.startCountdownIfNeeded(roomId);
  }

  /**
   * Leaves a room. When `socketId` is given, only that socket is removed from
   * the player's membership; the player stays until their last socket leaves
   * (so a multi-tab user isn't ejected when one tab closes).
   */
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

    const username = player.username;
    room.players.splice(idx, 1);

    this.io.to(roomId).emit('chat_message', {
      username: 'System',
      message: `${username} left the lobby.`,
      createdAt: new Date(),
    });

    this.broadcastRoomUpdate(roomId);

    // If room is empty, reset state to WAITING and clear timers
    if (room.players.filter((p) => !p.isBot).length === 0) {
      this.resetRoom(roomId);
    }
  }

  private resetRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.gameTimer) clearInterval(room.gameTimer);

    room.state = 'WAITING';
    room.gameId = null;
    room.countdown = 15;
    room.calledNumbers = [];
    room.players = [];
    room.gameTimer = null;
    room.countdownTimer = null;

    this.broadcastRoomUpdate(roomId);
  }

  private startCountdownIfNeeded(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'WAITING' || room.countdownTimer) return;

    room.countdown = 15;

    room.countdownTimer = setInterval(async () => {
      room.countdown--;

      // Spawn bots to make it look active if countdown gets low and player count is small
      if (room.countdown === 8 && room.players.length < 5) {
        this.spawnBots(roomId, Math.floor(Math.random() * 3) + 2);
      }

      this.io.to(roomId).emit('room_countdown', { countdown: room.countdown });

      if (room.countdown <= 0) {
        clearInterval(room.countdownTimer!);
        room.countdownTimer = null;
        await this.startGame(roomId);
      }
    }, 1000);
  }

  private spawnBots(roomId: string, count: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const botNames = ['NeonPixel', 'GlowMaster', 'LazerDaub', 'CyberCall', 'LuckyGlow', 'VectorWin', 'MatrixBot', 'CryptoDaub'];

    for (let i = 0; i < count; i++) {
      const botName = botNames[Math.floor(Math.random() * botNames.length)] + '#' + Math.floor(Math.random() * 900 + 100);
      const botId = 'bot-' + Math.random().toString(36).substring(2, 9);

      const grid = generateBingoGrid();
      const daubed = Array(5).fill(null).map(() => Array(5).fill(false));
      daubed[2][2] = true; // free space

      room.players.push({
        userId: botId,
        username: botName,
        isBot: true,
        socketIds: [],
        cardOptions: [],
        cards: [{
          id: 'card-' + Math.random().toString(36).substring(2, 9),
          grid,
          daubed,
        }],
      });
    }

    this.broadcastRoomUpdate(roomId);
  }

  private async startGame(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'WAITING') return;

    const dbRoom = await prisma.bingoRoom.findUnique({ where: { id: roomId } });
    if (!dbRoom) return;

    // Create DB BingoGame
    const game = await prisma.bingoGame.create({
      data: {
        roomId: roomId,
        state: 'PLAYING',
        startedAt: new Date(),
      },
    });

    room.gameId = game.id;
    room.state = 'PLAYING';
    room.calledNumbers = [];

    // Auto-assign the first card option to any player who did not pick before the start
    for (const player of room.players) {
      if (player.cards.length === 0 && player.cardOptions.length > 0) {
        const fallback = player.cardOptions[0];
        const daubed = Array(5).fill(null).map(() => Array(5).fill(false));
        daubed[2][2] = true; // free space
        player.cards = [{ id: fallback.id, grid: fallback.grid, daubed }];
      }
    }

    // Create GameParticipant and BingoCard records in DB
    const participantCreates = [];
    const cardCreates = [];

    for (const player of room.players) {
      participantCreates.push(
        prisma.gameParticipant.create({
          data: {
            gameId: game.id,
            userId: player.isBot ? '00000000-0000-0000-0000-000000000000' : player.userId,
            isBot: player.isBot,
          },
        })
      );

      for (const card of player.cards) {
        cardCreates.push(
          prisma.bingoCard.create({
            data: {
              id: card.id,
              gameId: game.id,
              userId: player.isBot ? '00000000-0000-0000-0000-000000000000' : player.userId, // Use dummy UUID for bots
              grid: card.grid as any,
              daubed: card.daubed as any,
              isBot: player.isBot,
            },
          })
        );
      }
    }

    // Seed dummy bot user if needed in DB to satisfy foreign keys
    try {
      const dummyBot = await prisma.user.findUnique({ where: { id: '00000000-0000-0000-0000-000000000000' } });
      if (!dummyBot) {
        await prisma.user.create({
          data: {
            id: '00000000-0000-0000-0000-000000000000',
            email: 'bot@bingo.internal',
            username: 'AI_BOTS',
            passwordHash: 'dummy',
            referralCode: 'BOTSCODE',
            role: 'USER',
          },
        });
      }
    } catch (_) {}

    await Promise.all([...participantCreates, ...cardCreates]);

    this.io.to(roomId).emit('game_started', {
      gameId: game.id,
      players: room.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        isBot: p.isBot,
        cards: p.cards.map((c) => ({ id: c.id, grid: c.grid })),
      })),
    });

    this.broadcastRoomUpdate(roomId);
    this.startGameTicks(roomId);
  }

  private async startGameTicks(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const callIntervalSeconds = await getSettingNumber('number_calling_speed');
    const bias = await ProbabilityEngine.decideTargetBias();

    room.gameTimer = setInterval(() => {
      this.tickGame(roomId, bias);
    }, callIntervalSeconds * 1000);
  }

  private tickGame(roomId: string, bias: 'HUMAN' | 'BOT' | 'NEUTRAL') {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'PLAYING') return;

    // Collect all card data for the probability engine
    const cardsData: BingoCardData[] = [];
    for (const player of room.players) {
      for (const card of player.cards) {
        cardsData.push({
          id: card.id,
          grid: card.grid,
          daubed: card.daubed,
          isBot: player.isBot,
        });
      }
    }

    const nextBall = ProbabilityEngine.selectNextBall(cardsData, room.calledNumbers, bias);
    
    if (nextBall === 0 || room.calledNumbers.length >= 75) {
      // Draw game (all numbers called, no winner)
      this.endGame(roomId, null, null);
      return;
    }

    room.calledNumbers.push(nextBall);

    // Update server state for bot card auto daubing
    for (const player of room.players) {
      if (player.isBot) {
        for (const card of player.cards) {
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
              if (card.grid[r][c] === nextBall) {
                card.daubed[r][c] = true;
              }
            }
          }
        }
      }
    }

    // Broadcast number call
    this.io.to(roomId).emit('number_called', {
      number: nextBall,
      calledNumbers: room.calledNumbers,
    });

    // Check if bots have won on this call
    for (const player of room.players) {
      if (player.isBot) {
        for (const card of player.cards) {
          const isBotWin = ProbabilityEngine.verifyWin(card.grid, card.daubed);
          if (isBotWin) {
            // Bot automatically claims BINGO
            this.endGame(roomId, player.userId, card.id);
            return;
          }
        }
      }
    }
  }

  /**
   * Lets a player pick one of their generated card options while waiting in the lobby.
   */
  public selectCard(roomId: string, userId: string, optionId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.state !== 'WAITING') throw new Error('Cards lock in once the game starts');

    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new Error('Player not in this room');

    const option = player.cardOptions.find((o) => o.id === optionId);
    if (!option) throw new Error('Card option not found');

    const daubed = Array(5).fill(null).map(() => Array(5).fill(false));
    daubed[2][2] = true; // free space

    player.cards = [{
      id: option.id,
      grid: option.grid,
      daubed,
    }];
  }

  /**
   * Regenerates the card options for a player who wants to shuffle in the lobby.
   */
  public regenerateCards(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.state !== 'WAITING') throw new Error('Cards lock in once the game starts');

    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new Error('Player not in this room');
    if (player.isBot) throw new Error('Bots cannot shuffle cards');

    // Generate a fresh set of options; previous selection is discarded with them
    player.cardOptions = generateCardOptions();
    player.cards = [];

    // All sockets of this user see the fresh options (multi-tab safe)
    player.socketIds.forEach((sid) => {
      this.io.to(sid).emit('card_options', { cards: player.cardOptions });
    });
  }

  /**
   * User manually claims BINGO
   */
  public async claimBingo(roomId: string, userId: string, cardId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'PLAYING') throw new Error('Game not active');

    const player = room.players.find((p) => p.userId === userId);
    if (!player) throw new Error('Player not in game');

    const card = player.cards.find((c) => c.id === cardId);
    if (!card) throw new Error('Card not found');

    // 1. Verify that all daubed numbers are actually called (anti-cheat)
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 2 && c === 2) continue; // Skip FREE space
        if (card.daubed[r][c]) {
          const val = card.grid[r][c];
          if (!room.calledNumbers.includes(val)) {
            throw new Error('Cheat detected: Daubed number was not called.');
          }
        }
      }
    }

    // 2. Verify completed pattern
    const isWin = ProbabilityEngine.verifyWin(card.grid, card.daubed);

    if (isWin) {
      await this.endGame(roomId, userId, cardId);
    } else {
      throw new Error('Invalid Bingo pattern. Keep daubing!');
    }
  }

  /**
   * Client reports number daub
   */
  public daubNumber(roomId: string, userId: string, cardId: string, row: number, col: number) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'PLAYING') return;

    const player = room.players.find((p) => p.userId === userId);
    if (!player) return;

    const card = player.cards.find((c) => c.id === cardId);
    if (!card) return;

    // Check if the number is called
    const val = card.grid[row][col];
    if (val === 0 || room.calledNumbers.includes(val)) {
      card.daubed[row][col] = true;
      
      // Update DB record asynchronously to not block event loop
      prisma.bingoCard.update({
        where: { id: cardId },
        data: { daubed: card.daubed as any },
      }).catch(err => console.error('Error updating daub in DB:', err));
    }
  }

  private async endGame(roomId: string, winnerId: string | null, winningCardId: string | null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.gameTimer) {
      clearInterval(room.gameTimer);
      room.gameTimer = null;
    }

    room.state = 'FINISHED';

    const dbRoom = await prisma.bingoRoom.findUnique({ where: { id: roomId } });
    if (!dbRoom || !room.gameId) return;

    const prizePool = dbRoom.prizePool.toNumber();
    let winnerName = 'No One (Draw)';
    // Jackpot bonus awarded to a human winner when the admin-configured
    // jackpot_chance% roll hits (default 0 = no jackpot).
    let jackpot = 0;

    if (winnerId && winningCardId) {
      const winnerPlayer = room.players.find((p) => p.userId === winnerId);
      if (winnerPlayer) {
        winnerName = winnerPlayer.username;

        // Perform payouts if the winner is a real player
        if (!winnerPlayer.isBot) {
          // Roll for the jackpot: chance is the win-rate-style percentage
          // setting, amount is the fixed jackpot_amount setting.
          const jackpotChance = await getSettingNumber('jackpot_chance');
          const jackpotAmount = await getSettingNumber('jackpot_amount');
          // A negative/zero jackpot setting must never shrink the winnings
          if (Math.random() * 100 < jackpotChance && jackpotAmount > 0) {
            jackpot = jackpotAmount;
          }

          const totalPayout = prizePool + jackpot;

          await prisma.$transaction(async (tx) => {
            // Update wallet
            await tx.wallet.update({
              where: { userId: winnerId },
              data: {
                balance: { increment: totalPayout },
                totalWinnings: { increment: totalPayout },
              },
            });

            // Create winning transaction
            await tx.transaction.create({
              data: {
                userId: winnerId,
                type: 'GAME_WIN',
                amount: totalPayout,
                description:
                  jackpot > 0
                    ? `Won game in room ${dbRoom.name} including jackpot bonus`
                    : `Won game in room ${dbRoom.name}`,
              },
            });

            // Notification
            await tx.notification.create({
              data: {
                userId: winnerId,
                title: 'You Won BINGO!',
                message:
                  jackpot > 0
                    ? `Congratulations! You won the prize pool of $${prizePool.toFixed(2)} plus a $${jackpot.toFixed(2)} JACKPOT BONUS in ${dbRoom.name}!`
                    : `Congratulations! You won the prize pool of $${prizePool.toFixed(2)} in ${dbRoom.name}!`,
              },
            });
          });
        }

        // Update card in DB
        await prisma.bingoCard.update({
          where: { id: winningCardId },
          data: { isWinner: true },
        });
      }
    }

    // Update BingoGame in DB
    await prisma.bingoGame.update({
      where: { id: room.gameId },
      data: {
        state: 'FINISHED',
        numbersCalled: room.calledNumbers,
        winningCardId,
        winnerId: winnerId?.startsWith('bot-') ? '00000000-0000-0000-0000-000000000000' : winnerId,
        finishedAt: new Date(),
      },
    });

    this.io.to(roomId).emit('game_finished', {
      winnerId,
      winnerName,
      winningCardId,
      prizePool,
      jackpot,
    });

    // Reset room back to WAITING lobby state after a short delay
    setTimeout(() => {
      this.resetRoom(roomId);
    }, 10000);
  }

  private broadcastRoomUpdate(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('room_update', {
      roomId,
      state: room.state,
      countdown: room.countdown,
      calledNumbers: room.calledNumbers,
      players: room.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        isBot: p.isBot,
      })),
    });
  }
}
