'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

export interface Player {
  userId: string;
  username: string;
  isBot: boolean;
}

export interface Card {
  id: string;
  grid: number[][];
  daubed: boolean[][];
}

export interface ChatMessage {
  username: string;
  message: string;
  createdAt: string;
}

export interface KenoPlayer {
  userId: string;
  username: string;
}

export interface KenoResult {
  matched: number;
  payout: number;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  activeRoomId: string | null;
  gameState: 'WAITING' | 'PLAYING' | 'FINISHED';
  countdown: number;
  calledNumbers: number[];
  currentNumber: number | null;
  players: Player[];
  myCards: Card[];
  cardOptions: Card[];
  chatMessages: ChatMessage[];
  winnerInfo: { winnerId: string; winnerName: string; prizePool: number; jackpot: number } | null;
  joinRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  selectCard: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  regenerateCards: () => Promise<{ success: boolean; error?: string }>;
  daubNumber: (cardId: string, row: number, col: number) => void;
  claimBingo: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  sendChatMessage: (message: string) => void;
  // Keno
  kenoRoomId: string | null;
  kenoGameState: 'WAITING' | 'PLAYING' | 'FINISHED';
  kenoCountdown: number;
  kenoPlayers: KenoPlayer[];
  kenoSpots: number[];
  kenoMaxSpots: number;
  kenoDrawSize: number;
  kenoRevealedNumbers: number[];
  kenoResult: KenoResult | null;
  kenoWagerError: string | null;
  kenoJoinRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  kenoLeaveRoom: () => void;
  kenoPickNumbers: (spots: number[]) => Promise<{ success: boolean; error?: string }>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { token, user, refreshProfile } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'WAITING' | 'PLAYING' | 'FINISHED'>('WAITING');
  const [countdown, setCountdown] = useState(15);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [cardOptions, setCardOptions] = useState<Card[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [winnerInfo, setWinnerInfo] = useState<SocketContextType['winnerInfo']>(null);

  // Keno state
  const [kenoRoomId, setKenoRoomId] = useState<string | null>(null);
  const [kenoGameState, setKenoGameState] = useState<'WAITING' | 'PLAYING' | 'FINISHED'>('WAITING');
  const [kenoCountdown, setKenoCountdown] = useState(15);
  const [kenoPlayers, setKenoPlayers] = useState<KenoPlayer[]>([]);
  const [kenoSpots, setKenoSpots] = useState<number[]>([]);
  const [kenoMaxSpots, setKenoMaxSpots] = useState(10);
  const [kenoDrawSize, setKenoDrawSize] = useState(20);
  const [kenoRevealedNumbers, setKenoRevealedNumbers] = useState<number[]>([]);
  const [kenoResult, setKenoResult] = useState<KenoResult | null>(null);
  const [kenoWagerError, setKenoWagerError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const socketInstance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket Connected to server');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('WebSocket Disconnected');
      setConnected(false);
    });

    socketInstance.on('room_update', (data) => {
      setGameState(data.state);
      setCountdown(data.countdown);
      setCalledNumbers(data.calledNumbers);
      setPlayers(data.players);
    });

    socketInstance.on('room_countdown', (data) => {
      setCountdown(data.countdown);
    });

    // Card options shown in the lobby picker (sent only to the joining user)
    socketInstance.on('card_options', (data) => {
      setCardOptions(
        data.cards.map((c: any) => {
          const daubArray = Array(5).fill(null).map(() => Array(5).fill(false));
          daubArray[2][2] = true; // free space
          return { id: c.id, grid: c.grid, daubed: daubArray };
        })
      );
    });

    // --- KENO EVENTS ---
    socketInstance.on('keno_room_update', (data) => {
      setKenoGameState(data.state);
      setKenoCountdown(data.countdown);
      setKenoPlayers(data.players);
    });

    socketInstance.on('keno_countdown', (data) => {
      setKenoCountdown(data.countdown);
    });

    socketInstance.on('keno_picks_update', (data) => {
      setKenoSpots(data.spots);
    });

    socketInstance.on('keno_game_started', (data) => {
      setKenoGameState('PLAYING');
      setKenoDrawSize(data.drawSize);
      setKenoMaxSpots(data.maxSpots);
      setKenoRevealedNumbers([]);
      setKenoResult(null);
    });

    socketInstance.on('keno_draw_number', (data) => {
      setKenoRevealedNumbers(data.revealedNumbers);
    });

    socketInstance.on('keno_game_finished', (data) => {
      setKenoGameState('FINISHED');
      setKenoRevealedNumbers(data.drawnNumbers);
      const mine = data.results.find((r: any) => r.userId === user?.id);
      if (mine) {
        setKenoResult({ matched: mine.matched, payout: mine.payout });
      }
      refreshProfile();
    });

    socketInstance.on('keno_wager_failed', (data) => {
      setKenoWagerError(data.message || 'Insufficient balance for the wager');
      refreshProfile();
    });

    socketInstance.on('game_started', (data) => {
      setGameState('PLAYING');
      setCalledNumbers([]);
      setCurrentNumber(null);
      setWinnerInfo(null);
      setCardOptions([]);

      // Find current user's cards from starting payload
      const self = data.players.find((p: any) => p.userId === user?.id);
      if (self) {
        const initializedCards = self.cards.map((c: any) => {
          const daubArray = Array(5).fill(null).map(() => Array(5).fill(false));
          daubArray[2][2] = true; // free space
          return {
            id: c.id,
            grid: c.grid,
            daubed: daubArray,
          };
        });
        setMyCards(initializedCards);
      }
    });

    socketInstance.on('number_called', (data) => {
      setCalledNumbers(data.calledNumbers);
      setCurrentNumber(data.number);
      
      // Attempt auto daub logic if desired by the client (auto daub option handled page side, or simple helper)
    });

    socketInstance.on('game_finished', (data) => {
      setGameState('FINISHED');
      setWinnerInfo({
        winnerId: data.winnerId,
        winnerName: data.winnerName,
        prizePool: data.prizePool,
        jackpot: data.jackpot || 0,
      });
      // Refresh profile balance since game payout changes balances
      refreshProfile();
    });

    socketInstance.on('chat_message', (data) => {
      setChatMessages((prev) => [...prev, data]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user?.id]);

  const joinRoom = (roomId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !connected) {
        return resolve({ success: false, error: 'Socket is not connected' });
      }

      // Clear stale options before joining; fresh ones arrive via the card_options event
      setCardOptions([]);

      socket.emit('join_room', { roomId }, (response: any) => {
        if (response?.success) {
          setActiveRoomId(roomId);
          setGameState('WAITING');
          setWinnerInfo(null);
          setMyCards([]);
          setChatMessages([]);
          // Refresh profile balance (fees deducted)
          refreshProfile();
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Failed to join' });
        }
      });
    });
  };

  const leaveRoom = () => {
    if (socket && activeRoomId) {
      socket.emit('leave_room');
      setActiveRoomId(null);
      setGameState('WAITING');
      setMyCards([]);
      setCardOptions([]);
      setChatMessages([]);
      setWinnerInfo(null);
      setCurrentNumber(null);
      refreshProfile();
    }
  };

  const selectCard = (cardId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !activeRoomId) {
        return resolve({ success: false, error: 'Not connected to a room' });
      }

      socket.emit('select_card', { cardId }, (response: any) => {
        if (response?.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Failed to select card' });
        }
      });
    });
  };

  const kenoJoinRoom = (roomId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !connected) {
        return resolve({ success: false, error: 'Socket is not connected' });
      }

      setKenoSpots([]);
      setKenoResult(null);
      setKenoRevealedNumbers([]);
      setKenoWagerError(null);
      setKenoGameState('WAITING');

      socket.emit('keno_join_room', { roomId }, (response: any) => {
        if (response?.success) {
          setKenoRoomId(roomId);
          refreshProfile();
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Failed to join' });
        }
      });
    });
  };

  const kenoLeaveRoom = () => {
    if (socket && kenoRoomId) {
      socket.emit('keno_leave_room');
      setKenoRoomId(null);
      setKenoGameState('WAITING');
      setKenoPlayers([]);
      setKenoSpots([]);
      setKenoRevealedNumbers([]);
      setKenoResult(null);
      setKenoWagerError(null);
      refreshProfile();
    }
  };

  const kenoPickNumbers = (spots: number[]): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !kenoRoomId) {
        return resolve({ success: false, error: 'Not in a Keno room' });
      }

      socket.emit('keno_pick_numbers', { spots }, (response: any) => {
        if (response?.success) {
          setKenoSpots(spots);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Failed to save picks' });
        }
      });
    });
  };

  const regenerateCards = (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !activeRoomId) {
        return resolve({ success: false, error: 'Not connected to a room' });
      }

      socket.emit('regenerate_cards', (response: any) => {
        if (response?.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Failed to shuffle cards' });
        }
      });
    });
  };

  const daubNumber = (cardId: string, row: number, col: number) => {
    if (!socket || !activeRoomId) return;

    // Update local card state instantly for fluid visual daubing
    setMyCards((prev) =>
      prev.map((c) => {
        if (c.id === cardId) {
          const updatedDaubed = [...c.daubed];
          updatedDaubed[row] = [...updatedDaubed[row]];
          updatedDaubed[row][col] = true;
          return { ...c, daubed: updatedDaubed };
        }
        return c;
      })
    );

    socket.emit('daub_number', { cardId, row, col });
  };

  const claimBingo = (cardId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !activeRoomId) {
        return resolve({ success: false, error: 'Not connected to a room' });
      }

      socket.emit('claim_bingo', { cardId }, (response: any) => {
        if (response?.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response?.error || 'Validation failed' });
        }
      });
    });
  };

  const sendChatMessage = (message: string) => {
    if (socket && activeRoomId) {
      socket.emit('send_chat', { message });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        activeRoomId,
        gameState,
        countdown,
        calledNumbers,
        currentNumber,
        players,
        myCards,
        cardOptions,
        chatMessages,
        winnerInfo,
        joinRoom,
        leaveRoom,
        selectCard,
        regenerateCards,
        daubNumber,
        claimBingo,
        sendChatMessage,
        kenoRoomId,
        kenoGameState,
        kenoCountdown,
        kenoPlayers,
        kenoSpots,
        kenoMaxSpots,
        kenoDrawSize,
        kenoRevealedNumbers,
        kenoResult,
        kenoWagerError,
        kenoJoinRoom,
        kenoLeaveRoom,
        kenoPickNumbers,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
