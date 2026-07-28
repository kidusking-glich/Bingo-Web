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
  chatMessages: ChatMessage[];
  winnerInfo: { winnerId: string; winnerName: string; prizePool: number } | null;
  joinRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  daubNumber: (cardId: string, row: number, col: number) => void;
  claimBingo: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  sendChatMessage: (message: string) => void;
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [winnerInfo, setWinnerInfo] = useState<SocketContextType['winnerInfo']>(null);

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

    socketInstance.on('game_started', (data) => {
      setGameState('PLAYING');
      setCalledNumbers([]);
      setCurrentNumber(null);
      setWinnerInfo(null);

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
      setChatMessages([]);
      setWinnerInfo(null);
      setCurrentNumber(null);
      refreshProfile();
    }
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
        chatMessages,
        winnerInfo,
        joinRoom,
        leaveRoom,
        daubNumber,
        claimBingo,
        sendChatMessage,
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
