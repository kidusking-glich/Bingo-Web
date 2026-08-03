'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { PlayCircle, ShieldAlert, Users, MessageSquare, Send, Volume2, VolumeX, HelpCircle, LogOut, Trophy, Shuffle } from 'lucide-react';

export default function BingoRoomPage() {
  const { user, token, loading } = useAuth();
  const { roomId } = useParams() as { roomId: string };
  const router = useRouter();

  const {
    joinRoom,
    leaveRoom,
    gameState,
    countdown,
    calledNumbers,
    currentNumber,
    players,
    myCards,
    cardOptions,
    chatMessages,
    winnerInfo,
    selectCard,
    regenerateCards,
    daubNumber,
    claimBingo,
    sendChatMessage,
  } = useSocket();

  const [joining, setJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [autoDaub, setAutoDaub] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [shuffling, setShuffling] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 1. Join Room on Mount
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user && roomId) {
      joinRoom(roomId).then((res) => {
        if (!res.success) {
          setJoinError(res.error || 'Failed to enter room');
        } else {
          setJoining(false);
        }
      });
    }

    return () => {
      leaveRoom();
    };
  }, [user, roomId]);

  // 2. Auto Scroll Chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 2.5 Auto-select the first card option by default (server also falls back to it)
  useEffect(() => {
    if (cardOptions.length > 0 && gameState === 'WAITING') {
      const current = cardOptions.find((c) => c.id === selectedCardId);
      if (!current) {
        const first = cardOptions[0];
        setSelectedCardId(first.id);
        selectCard(first.id);
      }
    }
  }, [cardOptions]);

  // 3. Auto Daub Logic
  useEffect(() => {
    if (autoDaub && currentNumber && myCards.length > 0 && gameState === 'PLAYING') {
      myCards.forEach((card) => {
        // Find if the called number is on this card
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card.grid[r][c] === currentNumber && !card.daubed[r][c]) {
              daubNumber(card.id, r, c);
              if (soundEnabled) playPopSound();
            }
          }
        }
      });
    }
  }, [currentNumber, autoDaub, myCards, gameState]);

  // 4. Play speech on new numbers. Gated by soundEnabled on purpose: muting mid-game
  // must not trigger speech, so the toggle is intentionally left out of the deps.
  useEffect(() => {
    if (currentNumber && soundEnabled && typeof window !== 'undefined') {
      const colLetter = getColumnLetter(currentNumber);
      speakNumber(`${colLetter}, ${currentNumber}`);
    }
  }, [currentNumber]);

  // 5. Round-end audio: win jingle plays room-wide for a human winner; the round-end
  // tone for a bot win plays only for players who are still present and didn't win.
  // Deliberately only depends on the game state: it plays at the moment of the win
  // (respecting the mute setting then), and toggling sound later must not re-trigger it.
  useEffect(() => {
    if (gameState !== 'FINISHED' || !winnerInfo?.winnerId || !soundEnabled) return;

    const isBotWin = winnerInfo.winnerId.startsWith('bot-');
    const isMe = winnerInfo.winnerId === user?.id;
    const stillInRoom = players.some((p) => p.userId === user?.id);

    if (isBotWin) {
      if (stillInRoom && !isMe) playRoundEndTone();
    } else {
      playWinJingle();
    }
  }, [gameState, winnerInfo]);

  // 6. Soft tick for the final 5 seconds of the lobby countdown.
  // Gated by soundEnabled at the moment of the tick; deps are the countdown itself.
  useEffect(() => {
    if (gameState === 'WAITING' && countdown > 0 && countdown <= 5 && soundEnabled) {
      playCountdownTick(countdown === 1);
    }
  }, [countdown, gameState]);

  // 7. Distinct chime right as the countdown hits zero. The server broadcasts
  // room_countdown(0) while still WAITING (before game_started), so this fires
  // exactly at the start moment — and never for mid-game joiners (state is PLAYING).
  useEffect(() => {
    if (gameState === 'WAITING' && countdown === 0 && soundEnabled) {
      playStartChime();
    }
  }, [countdown, gameState]);

  const speakNumber = (text: string) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  };

  /** Lazily create a shared AudioContext and resume it (autoplay policies require a user gesture). */
  const getAudioContext = (): AudioContext | null => {
    try {
      if (!audioContextRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new Ctx();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    } catch (_) {
      return null;
    }
  };

  /** Stop the caller's voice immediately, including queued utterances. */
  const cancelSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Close the shared AudioContext and stop any speech when leaving the room page
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
      audioContextRef.current = null;
      cancelSpeech();
    };
  }, []);

  const handleToggleSound = () => {
    if (soundEnabled) {
      // Turning sound off: stop the caller's voice immediately, including queued speech
      cancelSpeech();
    }
    setSoundEnabled(!soundEnabled);
  };

  const playPopSound = () => {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (_) {}
  };

  const playShuffleSound = () => {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      // 0.4s buffer of white noise reused for each "card flick"
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.4);
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      // A quick cascade of filtered noise bursts, sweeping upward like cards riffled
      for (let i = 0; i < 4; i++) {
        const t0 = audioCtx.currentTime + i * 0.055;
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const bandpass = audioCtx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(900 + i * 350, t0);
        bandpass.frequency.exponentialRampToValueAtTime(1800 + i * 350, t0 + 0.05);
        bandpass.Q.value = 1.5;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.22, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);

        source.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(t0);
        source.stop(t0 + 0.06);
      }
    } catch (_) {}
  };

  /** Play a short sequence of soft sine notes through the shared AudioContext. */
  const playNoteSequence = (notes: number[], spacingMs: number, volume: number) => {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      notes.forEach((freq, i) => {
        const t0 = audioCtx.currentTime + (i * spacingMs) / 1000;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      });
    } catch (_) {}
  };

  const playWinJingle = () => {
    // Bright ascending major arpeggio (C5-E5-G5-C6) — subtle and celebratory
    playNoteSequence([523.25, 659.25, 783.99, 1046.5], 90, 0.12);
  };

  const playRoundEndTone = () => {
    // Soft descending pair (G4 → E4) — gentle "round ended" cue when a bot wins
    playNoteSequence([392.0, 329.63], 140, 0.09);
  };

  const playCountdownTick = (isFinal = false) => {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      // A soft, short tick; slightly brighter pitch on the final second
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = isFinal ? 1400 : 1000;
      const t0 = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch (_) {}
  };

  const playStartChime = () => {
    // Bright two-tone "ding-ding" (E5 → A5) signaling the round is starting
    playNoteSequence([659.25, 880.0], 110, 0.11);
  };

  const handleCellClick = (cardId: string, row: number, col: number, num: number) => {
    if (gameState !== 'PLAYING') return;
    
    // Manual Daub: can only daub if number was actually called
    if (num === 0 || calledNumbers.includes(num)) {
      const card = myCards.find(c => c.id === cardId);
      if (card && !card.daubed[row][col]) {
        daubNumber(cardId, row, col);
        if (soundEnabled) playPopSound();
      }
    }
  };

  const handleShuffle = async () => {
    if (shuffling) return;
    if (soundEnabled) playShuffleSound();
    setShuffling(true);
    await regenerateCards();
    setShuffling(false);
  };

  const handleClaim = async (cardId: string) => {
    setClaimError(null);
    try {
      const res = await claimBingo(cardId);
      if (!res.success) {
        setClaimError(res.error || 'Failed to claim bingo.');
        setTimeout(() => setClaimError(null), 3000);
      }
    } catch (err: any) {
      setClaimError(err.message || 'Validation failed');
      setTimeout(() => setClaimError(null), 3000);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim().length > 0) {
      sendChatMessage(chatInput.trim());
      setChatInput('');
    }
  };

  const getColumnLetter = (num: number): string => {
    if (num >= 1 && num <= 15) return 'B';
    if (num >= 16 && num <= 30) return 'I';
    if (num >= 31 && num <= 45) return 'N';
    if (num >= 46 && num <= 60) return 'G';
    if (num >= 61 && num <= 75) return 'O';
    return '';
  };

  if (loading || joining) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center flex-col gap-4">
        {joinError ? (
          <div className="text-center space-y-4 max-w-sm px-6">
            <ShieldAlert size={40} className="text-rose-500 mx-auto" />
            <h3 className="text-lg font-black text-white">{joinError}</h3>
            <button
              onClick={() => router.push('/lobby')}
              className="px-6 py-2.5 rounded-xl bg-zinc-900 border border-white/5 hover:border-cyan-500/20 text-zinc-300 hover:text-cyan-400 font-bold text-xs tracking-wider uppercase transition-all duration-300"
            >
              Back to Lobby
            </button>
          </div>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Connecting to Room...</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col justify-between select-none relative overflow-hidden">
      
      {/* 1. Header Control Panel */}
      <header className="glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/lobby')}
            className="p-2 rounded-xl bg-zinc-950 border border-white/5 hover:border-red-500/20 text-zinc-400 hover:text-red-400 transition-all duration-300"
            title="Leave Game"
          >
            <LogOut size={16} />
          </button>
          
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Live Gameplay</span>
            <span className="text-xs font-black text-cyan-400 uppercase tracking-wider block">
              {gameState === 'WAITING' ? 'Waiting Lobby' : gameState === 'PLAYING' ? 'Playing Round' : 'Game Finished'}
            </span>
          </div>
        </div>

        {/* Current ball call display */}
        {gameState === 'PLAYING' && currentNumber && (
          <div className="flex items-center gap-4 bg-gradient-to-r from-cyan-950/40 to-fuchsia-950/40 border border-purple-500/20 px-6 py-2.5 rounded-3xl shadow-[0_0_20px_rgba(6,182,212,0.15)] animate-pulse-glow">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-fuchsia-500 text-black flex items-center justify-center font-black text-lg shadow-[0_0_10px_rgba(6,182,212,0.4)]">
              {getColumnLetter(currentNumber)}
            </div>
            <span className="text-2xl font-black text-zinc-100 tracking-wider">
              {currentNumber}
            </span>
          </div>
        )}

        {/* Global Controls */}
        <div className="flex items-center gap-4">
          {/* Sound toggle */}
          <button
            onClick={handleToggleSound}
            className="p-2 bg-zinc-950 border border-white/5 hover:border-purple-500/20 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Player Count */}
          <div className="flex items-center gap-2 bg-zinc-950/60 border border-white/5 px-3 py-2 rounded-2xl text-xs font-bold text-zinc-400">
            <Users size={14} className="text-zinc-500" />
            <span>{players.length} Players</span>
          </div>
        </div>
      </header>

      {/* 2. Main content view */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8 overflow-y-auto">
        
        {/* Waiting Lobby View */}
        {gameState === 'WAITING' ? (
          <div className="lg:col-span-4 flex flex-col items-center justify-center py-16 space-y-8">
            <div className="w-20 h-20 rounded-3xl bg-cyan-950/20 border border-cyan-500/20 flex items-center justify-center text-cyan-400 animate-float">
              <PlayCircle size={44} />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white uppercase tracking-wider">Waiting for players to join</h2>
              <p className="text-zinc-400 text-xs font-semibold">Game starts automatically when the countdown hits zero.</p>
            </div>

            {/* Countdown display */}
            <div className="w-28 h-28 rounded-full border-4 border-dashed border-cyan-500/30 flex items-center justify-center">
              <span className="text-4xl font-black text-cyan-400 text-glow-cyan animate-pulse">{countdown}s</span>
            </div>

            {/* Card Selection Picker */}
            {cardOptions.length > 0 && (
            <div className="w-full max-w-4xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 text-left">
                  <h3 className="text-sm font-black uppercase text-cyan-400 tracking-widest">Choose Your Bingo Card</h3>
                  <p className="text-zinc-500 text-[11px] font-semibold">Pick one card to play — it locks in when the game starts.</p>
                </div>

                {/* Shuffle button */}
                <button
                  onClick={handleShuffle}
                  disabled={shuffling}
                  title="Shuffle card options"
                  className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/30 text-zinc-400 hover:text-cyan-400 text-[10px] font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Shuffle size={12} className={shuffling ? 'animate-spin' : ''} />
                  {shuffling ? 'Shuffling' : 'Shuffle'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {cardOptions.map((card, idx) => {
                  const isSelected = selectedCardId === card.id;
                  return (
                    <button
                      key={card.id}
                      style={{ animationDelay: `${idx * 70}ms` }}
                      onClick={async () => {
                        const res = await selectCard(card.id);
                        if (res.success) setSelectedCardId(card.id);
                      }}
                      className={`animate-card-fly-in glass-panel p-4 rounded-2xl border transition-all duration-300 text-left group ${
                        isSelected
                          ? 'border-cyan-400/60 shadow-[0_0_25px_rgba(6,182,212,0.25)] scale-105 bg-cyan-950/20'
                          : 'border-white/5 hover:border-cyan-500/30 hover:scale-102 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-cyan-400' : 'text-zinc-400'}`}>
                          Card {idx + 1}
                        </span>
                        {isSelected && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-cyan-500 text-black px-2 py-0.5 rounded-full animate-pulse">
                            Selected
                          </span>
                        )}
                      </div>

                      {/* B-I-N-G-O headers */}
                      <div className="grid grid-cols-5 gap-1.5 text-center mb-1.5">
                        {['B', 'I', 'N', 'G', 'O'].map((l, i) => (
                          <span
                            key={i}
                            className={`text-xs font-black tracking-widest bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent ${isSelected ? 'from-cyan-200 to-cyan-500' : ''}`}
                          >
                            {l}
                          </span>
                        ))}
                      </div>

                      {/* 5x5 Grid preview */}
                      <div className="grid grid-cols-5 gap-1.5">
                        {card.grid.map((row, r) =>
                          row.map((val, c) => {
                            const isFree = val === 0;
                            return (
                              <div
                                key={`${r}-${c}`}
                                className={`aspect-square flex items-center justify-center rounded-md text-[9px] font-black border ${
                                  isFree
                                    ? 'bg-zinc-950 border-dashed border-zinc-700 text-zinc-600'
                                    : isSelected
                                    ? 'bg-cyan-950/40 border-cyan-500/20 text-cyan-300'
                                    : 'bg-zinc-950/60 border-white/5 text-zinc-300 group-hover:text-cyan-300 transition-colors'
                                }`}
                              >
                                {isFree ? '★' : val}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-center text-[10px] text-zinc-600 font-bold">
                {selectedCardId ? '✓ Your card is locked in' : 'Card #1 is auto-selected if you do not pick'}
              </p>
            </div>
            )}

            {/* Joined Players */}
            <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Players In Room</h3>
              <div className="grid grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1">
                {players.map((p) => (
                  <div key={p.userId} className="p-2.5 bg-zinc-950/40 border border-white/5 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 truncate max-w-[120px]">{p.username}</span>
                    {p.isBot && <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">BOT</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active Playing Layout */
          <>
            {/* Left Side: Game details, Caller board, Chat */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* Called Numbers Board */}
              <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
                <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Caller Board (1-75)</h3>
                
                <div className="grid grid-cols-15 gap-1.5 justify-center">
                  {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
                    const isCalled = calledNumbers.includes(num);
                    const isLatest = currentNumber === num;
                    return (
                      <div
                        key={num}
                        className={`aspect-square flex items-center justify-center font-black text-[10px] rounded-lg transition-all duration-300 ${
                          isLatest
                            ? 'bg-gradient-to-tr from-cyan-400 to-fuchsia-400 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-110'
                            : isCalled
                            ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                            : 'bg-zinc-950 text-zinc-600 border border-white/5'
                        }`}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bingo Card interactive container */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Your Bingo Tickets</h3>
                  
                  {/* Auto Daub Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs font-bold text-zinc-400">Auto-Daub</span>
                    <input
                      type="checkbox"
                      checked={autoDaub}
                      onChange={(e) => setAutoDaub(e.target.checked)}
                      className="w-8 h-4 bg-zinc-900 border border-white/10 rounded-full appearance-none cursor-pointer checked:bg-cyan-500 relative transition-all checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-zinc-300 after:rounded-full after:transition-all"
                    />
                  </label>
                </div>

                {claimError && (
                  <div className="p-3 bg-red-950/30 border border-red-500/30 text-red-300 text-xs font-semibold rounded-xl max-w-sm">
                    {claimError}
                  </div>
                )}

                <div className="flex flex-wrap gap-8 justify-center lg:justify-start">
                  {myCards.map((card) => (
                    <div
                      key={card.id}
                      className="glass-panel p-5 rounded-3xl border border-purple-500/10 space-y-4 shadow-[0_0_20px_rgba(168,85,247,0.03)]"
                    >
                      {/* B-I-N-G-O Headers */}
                      <div className="grid grid-cols-5 gap-3 text-center">
                        {['B', 'I', 'N', 'G', 'O'].map((lettr, idx) => (
                          <span
                            key={idx}
                            className="text-lg font-black bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent tracking-widest"
                          >
                            {lettr}
                          </span>
                        ))}
                      </div>

                      {/* 5x5 Grid */}
                      <div className="grid grid-cols-5 gap-2.5">
                        {card.grid.map((row, rIdx) =>
                          row.map((val, cIdx) => {
                            const isDaubed = card.daubed[rIdx][cIdx];
                            const isFree = val === 0;
                            const isCallMatch = calledNumbers.includes(val);
                            
                            return (
                              <button
                                key={`${rIdx}-${cIdx}`}
                                onClick={() => handleCellClick(card.id, rIdx, cIdx, val)}
                                disabled={isFree || isDaubed || (!isFree && !isCallMatch)}
                                className={`w-11 h-11 flex items-center justify-center rounded-xl font-black text-sm relative transition-all outline-none ${
                                  isDaubed
                                    ? 'bg-gradient-to-br from-purple-600/30 to-fuchsia-600/30 border-2 border-fuchsia-500 text-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.3)]'
                                    : isCallMatch
                                    ? 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-400 hover:scale-105 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                                    : isFree
                                    ? 'bg-zinc-950 border border-dashed border-zinc-700 text-zinc-500 font-extrabold text-[9px]'
                                    : 'bg-zinc-950 text-zinc-400 border border-white/5 cursor-not-allowed opacity-50'
                                }`}
                              >
                                {isFree ? 'FREE' : val}
                                {isDaubed && !isFree && (
                                  <div className="absolute inset-0.5 rounded-lg border border-fuchsia-400/20 pointer-events-none animate-ping" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Claim Button */}
                      <button
                        onClick={() => handleClaim(card.id)}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-black text-xs uppercase tracking-widest shadow-[0_0_15px_rgba(217,70,239,0.2)] hover:shadow-[0_0_25px_rgba(217,70,239,0.4)] transition-all hover:scale-102"
                      >
                        BINGO!
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side: Chat Window */}
            <div className="lg:col-span-1 glass-panel rounded-3xl border border-white/5 flex flex-col max-h-[550px] shadow-lg">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2 text-zinc-400">
                <MessageSquare size={16} />
                <span className="text-xs font-black uppercase tracking-wider">Room Chat</span>
              </div>

              {/* Logs */}
              <div className="flex-grow p-4 overflow-y-auto space-y-3 scrollbar-thin text-xs">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <span className={`font-black ${
                      msg.username === 'System'
                        ? 'text-cyan-400'
                        : msg.username === user?.username
                        ? 'text-fuchsia-400'
                        : 'text-zinc-500'
                    }`}>
                      {msg.username}:
                    </span>
                    <p className="text-zinc-300 font-medium leading-relaxed">{msg.message}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-white/5 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Say hello to room..."
                  className="flex-grow px-3 py-2 bg-zinc-950 border border-white/5 focus:border-cyan-500/30 rounded-xl outline-none text-xs text-zinc-200"
                />
                <button
                  type="submit"
                  className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black transition-colors"
                >
                  <Send size={12} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* 3. Game finished overlay dialogue */}
      {gameState === 'FINISHED' && winnerInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-filter backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-panel border border-cyan-500/30 p-8 rounded-3xl text-center space-y-6 shadow-[0_0_40px_rgba(6,182,212,0.2)] animate-pulse-glow">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
              <Trophy size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white tracking-wide bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">BINGO WINNER!</h2>
              <p className="text-zinc-400 font-semibold text-sm">
                Congratulations to <strong className="text-zinc-100 font-bold">{winnerInfo.winnerName}</strong> for claiming BINGO!
              </p>
            </div>

            <div className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl inline-block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Winnings Prize Pool</span>
              <span className="text-2xl font-black text-cyan-400 block tracking-wider mt-1">${winnerInfo.prizePool.toFixed(2)}</span>
            </div>

            <div className="text-xs text-zinc-500 font-bold pt-4 border-t border-white/5">
              Returning to Waiting Lobby shortly...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
