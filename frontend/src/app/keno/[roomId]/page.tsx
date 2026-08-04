'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import {
  PlayCircle,
  ShieldAlert,
  Users,
  LogOut,
  Dices,
  Eraser,
  Volume2,
  VolumeX,
  Trophy,
  Zap,
  History,
  RefreshCw,
  Table2,
  ChevronDown,
} from 'lucide-react';

interface RoomInfo {
  id: string;
  name: string;
  type: string;
  game: string;
  entryFee: string;
  prizePool: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface KenoHistoryTicket {
  userId: string;
  username: string;
  spots: number[];
  matched: number;
  payout: number;
  isWinner: boolean;
}

interface KenoHistoryRound {
  id: string;
  drawnNumbers: number[];
  startedAt: string | null;
  finishedAt: string | null;
  tickets: KenoHistoryTicket[];
}

// Display-only paytable mirror (authoritative payouts are computed server-side)
const POTENTIAL_MULTIPLIERS: Record<number, number[]> = {
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

export default function KenoRoomPage() {
  const { user, loading } = useAuth();
  const { roomId } = useParams() as { roomId: string };
  const router = useRouter();

  const {
    connected,
    kenoJoinRoom,
    kenoLeaveRoom,
    kenoGameState,
    kenoCountdown,
    kenoPlayers,
    kenoSpots,
    kenoMaxSpots,
    kenoDrawSize,
    kenoRevealedNumbers,
    kenoResult,
    kenoWagerError,
    kenoPickNumbers,
  } = useSocket();

  const [joining, setJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [view, setView] = useState<'play' | 'history'>('play');
  const [showPaytable, setShowPaytable] = useState(false);
  const [wagerError, setWagerError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch room info for display
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/rooms`)
      .then((res) => res.json())
      .then((data) => {
        const room = (data.rooms || []).find((r: any) => r.id === roomId);
        if (room) setRoomInfo(room);
      })
      .catch(() => {});
  }, [roomId]);

  // Auth guard + leave on unmount
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    return () => {
      kenoLeaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomId]);

  // Join once the socket is connected
  useEffect(() => {
    if (connected && user && roomId && joining) {
      kenoJoinRoom(roomId).then((res) => {
        if (!res.success) {
          setJoinError(res.error || 'Failed to enter Keno room');
        } else {
          setJoining(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, user, roomId]);

  // Keep local picks in sync with server-confirmed picks
  useEffect(() => {
    setPicks(kenoSpots);
  }, [kenoSpots]);

  // If the server drops us for an unpayable wager, leave the room and show the reason
  useEffect(() => {
    if (kenoWagerError) {
      setWagerError(kenoWagerError);
      kenoLeaveRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kenoWagerError]);

  const entryFee = parseFloat(roomInfo?.entryFee || '0');

  // --- Audio ---
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

  const playRevealTick = () => {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t0 = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    } catch (_) {}
  };

  // Play a soft tick on each revealed number
  const prevRevealedRef = useRef(0);
  useEffect(() => {
    if (kenoRevealedNumbers.length > prevRevealedRef.current && soundEnabled) {
      prevRevealedRef.current = kenoRevealedNumbers.length;
      playRevealTick();
    }
    if (kenoRevealedNumbers.length < prevRevealedRef.current) {
      prevRevealedRef.current = kenoRevealedNumbers.length;
    }
  }, [kenoRevealedNumbers, soundEnabled]);

  // Result audio
  useEffect(() => {
    if (kenoGameState === 'FINISHED' && kenoResult && soundEnabled) {
      if (kenoResult.payout > 0) {
        playNoteSequence([523.25, 659.25, 783.99, 1046.5], 90, 0.12);
      } else {
        playNoteSequence([392.0, 329.63], 140, 0.09);
      }
    }
  }, [kenoGameState, kenoResult, soundEnabled]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  // --- Pick logic ---
  /** Commits the latest picks to the server, debounced so rapid toggles can't race. */
  const commitPicks = (spots: number[]) => {
    if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
    pickTimerRef.current = setTimeout(async () => {
      const res = await kenoPickNumbers(spots);
      if (!res.success) {
        setPicks(kenoSpots);
        setPickError(res.error || 'Failed to save picks');
        setTimeout(() => setPickError(null), 2000);
      }
    }, 120);
  };

  const togglePick = (num: number) => {
    if (kenoGameState !== 'WAITING') return;
    setPickError(null);

    let next: number[];
    if (picks.includes(num)) {
      next = picks.filter((n) => n !== num);
    } else {
      if (picks.length >= kenoMaxSpots) {
        setPickError(`You can pick at most ${kenoMaxSpots} numbers`);
        setTimeout(() => setPickError(null), 2000);
        return;
      }
      next = [...picks, num];
    }

    setPicks(next);
    commitPicks(next);
  };

  const handleQuickPick = () => {
    if (kenoGameState !== 'WAITING') return;
    const count = Math.min(kenoMaxSpots, 80);
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    const next: number[] = [];
    while (next.length < count) {
      const idx = Math.floor(Math.random() * pool.length);
      next.push(pool.splice(idx, 1)[0]);
    }
    setPicks(next);
    commitPicks(next);
  };

  const handleClear = () => {
    if (kenoGameState !== 'WAITING') return;
    setPicks([]);
    commitPicks([]);
  };

  // Cancel any pending pick commit on unmount
  useEffect(() => {
    return () => {
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
    };
  }, []);

  // Live hit count during play
  const liveHits = picks.filter((n) => kenoRevealedNumbers.includes(n)).length;
  const potentialMultiplier = POTENTIAL_MULTIPLIERS[picks.length]?.[liveHits] || 0;

  if (loading || joining || wagerError) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center flex-col gap-4">
        {wagerError ? (
          <div className="text-center space-y-4 max-w-sm px-6">
            <ShieldAlert size={40} className="text-rose-500 mx-auto" />
            <h3 className="text-lg font-black text-white">{wagerError}</h3>
            <p className="text-xs text-zinc-500 font-semibold">Top up your wallet and come back to the next round.</p>
            <button
              onClick={() => router.push('/wallet')}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black font-bold text-xs tracking-wider uppercase transition-all duration-300"
            >
              Top Up Balance
            </button>
            <button
              onClick={() => router.push('/lobby')}
              className="px-6 py-2.5 rounded-xl bg-zinc-900 border border-white/5 hover:border-cyan-500/20 text-zinc-300 hover:text-cyan-400 font-bold text-xs tracking-wider uppercase transition-all duration-300"
            >
              Back to Lobby
            </button>
          </div>
        ) : joinError ? (
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
            <div className="w-8 h-8 rounded-full border-4 border-fuchsia-500 border-t-transparent animate-spin" />
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Connecting to Keno Room...</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col justify-between select-none relative overflow-hidden">
      {/* Header */}
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
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Keno Live Room</span>
            <span className="text-xs font-black text-fuchsia-400 uppercase tracking-wider block">
              {roomInfo?.name || 'Keno'} · {kenoGameState === 'WAITING' ? 'Pick Your Numbers' : kenoGameState === 'PLAYING' ? 'Drawing...' : 'Round Finished'}
            </span>
          </div>
        </div>

        {/* Countdown + players */}
        <div className="flex items-center gap-4">
          {kenoGameState === 'WAITING' && (
            <div className="flex items-center gap-2 bg-zinc-950/60 border border-white/5 px-4 py-2 rounded-2xl">
              <PlayCircle size={14} className="text-fuchsia-400" />
              <span className="text-sm font-black text-fuchsia-400">{kenoCountdown}s</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-zinc-950/60 border border-white/5 px-3 py-2 rounded-2xl text-xs font-bold text-zinc-400">
            <Users size={14} className="text-zinc-500" />
            <span>{kenoPlayers.length} Players</span>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 bg-zinc-950 border border-white/5 hover:border-purple-500/20 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 overflow-y-auto">
        {/* Play / History tabs */}
        <div className="flex gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 w-fit mb-8">
          <button
            onClick={() => setView('play')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              view === 'play'
                ? 'bg-fuchsia-950/40 text-fuchsia-400 border border-fuchsia-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <PlayCircle size={13} />
            Play
          </button>
          <button
            onClick={() => setView('history')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              view === 'history'
                ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <History size={13} />
            Round History
          </button>
        </div>

        {view === 'history' ? (
          <KenoHistoryPanel roomId={roomId} currentUserId={user?.id} />
        ) : kenoGameState === 'WAITING' ? (
          <div className="space-y-8">
            {/* Intro */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-3xl bg-fuchsia-950/20 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 mx-auto animate-float">
                <Dices size={34} />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-wider">Pick {kenoMaxSpots} Numbers, Match the Draw</h2>
              <p className="text-zinc-400 text-xs font-semibold max-w-xl mx-auto">
                Choose up to <strong className="text-fuchsia-400">{kenoMaxSpots}</strong> numbers from 1-80. Each round costs the room wager and draws {kenoDrawSize} numbers — your payout depends on how many match.
              </p>
            </div>

            {/* Selection toolbar */}
            <div className="glass-panel p-5 rounded-3xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Your Ticket</span>
                <span className="text-lg font-black text-white mt-0.5 block">
                  <span className="text-fuchsia-400">{picks.length}</span> / {kenoMaxSpots} selected
                </span>
              </div>

              <div className="flex items-center gap-3">
                {entryFee > 0 && (
                  <div className="text-center px-4">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Wager</span>
                    <span className="text-lg font-black text-cyan-400 block mt-0.5">${entryFee.toFixed(2)}</span>
                  </div>
                )}
                <button
                  onClick={handleQuickPick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/20 hover:text-fuchsia-200 text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  <Zap size={12} />
                  Quick Pick
                </button>
                <button
                  onClick={handleClear}
                  disabled={picks.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/5 text-zinc-400 hover:border-red-500/20 hover:text-red-400 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eraser size={12} />
                  Clear
                </button>
              </div>
            </div>

            {pickError && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 text-red-300 text-xs font-semibold rounded-xl text-center">
                {pickError}
              </div>
            )}

            {/* Number grid 1-80 */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5">
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
                {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => {
                  const isPicked = picks.includes(num);
                  return (
                    <button
                      key={num}
                      onClick={() => togglePick(num)}
                      className={`aspect-square flex items-center justify-center rounded-lg font-black text-xs transition-all duration-150 ${
                        isPicked
                          ? 'bg-gradient-to-tr from-fuchsia-500 to-purple-600 text-white shadow-[0_0_12px_rgba(217,70,239,0.4)] scale-110'
                          : 'bg-zinc-950 text-zinc-400 border border-white/5 hover:border-fuchsia-500/40 hover:text-fuchsia-300 hover:scale-105'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paytable toggle + table */}
            <button
              onClick={() => setShowPaytable(!showPaytable)}
              aria-expanded={showPaytable}
              className="mx-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/30 text-zinc-300 hover:text-cyan-400 text-[10px] font-black uppercase tracking-wider transition-all"
            >
              <Table2 size={12} />
              {showPaytable ? 'Hide Paytable' : 'View Paytable'}
              <ChevronDown size={12} className={`transition-transform duration-300 ${showPaytable ? 'rotate-180' : ''}`} />
            </button>

            {showPaytable && (
              <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Keno Paytable — Payout Multipliers</h3>
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    Payout = multiplier × wager
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-[10px] min-w-[560px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-zinc-950 px-2 py-1.5 text-left text-[9px] uppercase tracking-widest font-black text-zinc-500 whitespace-nowrap">
                          Spots \\ Hits
                        </th>
                        {Array.from({ length: kenoMaxSpots + 1 }, (_, i) => i).map((hit) => (
                          <th key={hit} className={`px-1.5 py-1.5 font-black ${hit === 0 ? 'text-zinc-600' : 'text-zinc-500'}`}>
                            {hit}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: kenoMaxSpots }, (_, i) => i + 1).map((spots) => {
                        const row = POTENTIAL_MULTIPLIERS[spots] || [];
                        const isMyRow = spots === picks.length && picks.length > 0;
                        return (
                          <tr key={spots} className={isMyRow ? 'bg-cyan-950/20' : ''}>
                            <td className={`sticky left-0 px-2 py-1 text-left font-black whitespace-nowrap ${isMyRow ? 'bg-cyan-950/40 text-cyan-400' : 'bg-zinc-950 text-zinc-400'}`}>
                              {spots} {spots === 1 ? 'spot' : 'spots'}
                            </td>
                            {Array.from({ length: kenoMaxSpots + 1 }, (_, i) => i).map((hit) => {
                              const m = row[hit] || 0;
                              return (
                                <td
                                  key={hit}
                                  className={`px-1.5 py-1 font-black ${
                                    isMyRow && m > 0
                                      ? 'text-cyan-300'
                                      : m > 0
                                      ? 'text-fuchsia-300'
                                      : 'text-zinc-700'
                                  }`}
                                >
                                  {m > 0 ? `${m}x` : '–'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[10px] text-zinc-600 font-semibold text-center">
                  Multipliers apply to your wager ({entryFee > 0 ? `$${entryFee.toFixed(2)} per round` : 'free play — no cash payouts'}). The highlighted row is your current spot count.
                </p>
              </div>
            )}

            {/* Players */}
            <div className="w-full max-w-md mx-auto glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Players In Room</h3>
              <div className="grid grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1">
                {kenoPlayers.map((p) => (
                  <div key={p.userId} className="p-2.5 bg-zinc-950/40 border border-white/5 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 truncate max-w-[140px]">{p.username}</span>
                    {p.userId === user?.id && (
                      <span className="text-[8px] bg-fuchsia-950 text-fuchsia-400 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">YOU</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Playing / Finished view */
          <div className="space-y-8">
            {/* Draw reveal board */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">The Draw ({kenoRevealedNumbers.length}/{kenoDrawSize})</h3>
                {kenoGameState === 'PLAYING' && (
                  <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-wider animate-pulse">Drawing...</span>
                )}
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {Array.from({ length: kenoDrawSize }, (_, i) => {
                  const num = kenoRevealedNumbers[i];
                  const isMatch = num !== undefined && picks.includes(num);
                  return (
                    <div
                      key={i}
                      className={`aspect-square flex items-center justify-center rounded-lg font-black text-sm transition-all duration-300 ${
                        num === undefined
                          ? 'bg-zinc-950 border border-dashed border-zinc-800 text-zinc-700'
                          : isMatch
                          ? 'bg-gradient-to-tr from-cyan-400 to-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-card-fly-in'
                          : 'bg-fuchsia-950/40 border border-fuchsia-500/30 text-fuchsia-200 animate-card-fly-in'
                      }`}
                    >
                      {num ?? '·'}
                    </div>
                  );
                })}
              </div>

              {/* Live hits */}
              {kenoGameState === 'PLAYING' && (
                <div className="flex items-center justify-center gap-6 pt-2">
                  <div className="text-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Your Hits</span>
                    <span className="text-2xl font-black text-emerald-400 block mt-1">{liveHits}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Current Win Potential</span>
                    <span className="text-2xl font-black text-cyan-400 block mt-1">
                      {potentialMultiplier > 0 ? `$${(potentialMultiplier * entryFee).toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* My picks board */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5">
              <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider mb-4">Your Numbers ({picks.length})</h3>
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
                {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => {
                  const isPicked = picks.includes(num);
                  const isDrawn = kenoRevealedNumbers.includes(num);
                  const isMatch = isPicked && isDrawn;
                  return (
                    <div
                      key={num}
                      className={`aspect-square flex items-center justify-center rounded-lg font-black text-xs transition-all duration-300 ${
                        isMatch
                          ? 'bg-gradient-to-tr from-cyan-400 to-emerald-400 text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                          : isPicked
                          ? 'bg-gradient-to-tr from-fuchsia-500 to-purple-600 text-white'
                          : isDrawn
                          ? 'bg-zinc-900 text-zinc-300 border border-white/10'
                          : 'bg-zinc-950 text-zinc-700 border border-white/5'
                      }`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result overlay */}
      {view === 'play' && kenoGameState === 'FINISHED' && kenoResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-filter backdrop-blur-md flex items-center justify-center p-6">
          <div className={`max-w-md w-full glass-panel p-8 rounded-3xl text-center space-y-6 animate-pulse-glow ${
            kenoResult.payout > 0 ? 'border-emerald-500/30' : 'border-white/5'
          }`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${
              kenoResult.payout > 0
                ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-950/40 border border-white/10 text-zinc-500'
            }`}>
              {kenoResult.payout > 0 ? <Trophy size={32} /> : <Dices size={32} />}
            </div>

            <div className="space-y-2">
              <h2 className={`text-3xl font-black tracking-wide bg-clip-text text-transparent ${
                kenoResult.payout > 0
                  ? 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                  : entryFee > 0
                  ? 'bg-gradient-to-r from-zinc-400 to-zinc-600'
                  : 'bg-gradient-to-r from-cyan-400 to-fuchsia-400'
              }`}>
                {kenoResult.payout > 0 ? 'KENO WIN!' : entryFee > 0 ? 'NO MATCHES' : 'ROUND COMPLETE'}
              </h2>
              <p className="text-zinc-400 font-semibold text-sm">
                You matched <strong className="text-zinc-100">{kenoResult.matched}</strong> of {picks.length} numbers
              </p>
            </div>

            <div className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl inline-block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Round Winnings</span>
              <span className={`text-2xl font-black block tracking-wider mt-1 ${
                kenoResult.payout > 0 ? 'text-emerald-400' : 'text-zinc-600'
              }`}>
                {kenoResult.payout > 0 ? `+$${kenoResult.payout.toFixed(2)}` : entryFee > 0 ? '$0.00' : 'FREE PLAY'}
              </span>
            </div>

            <div className="text-xs text-zinc-500 font-bold pt-4 border-t border-white/5">
              Returning to the picker shortly...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shows the last completed Keno rounds for this room, with per-player results. */
function KenoHistoryPanel({ roomId, currentUserId }: { roomId: string; currentUserId?: string }) {
  const [history, setHistory] = useState<KenoHistoryRound[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/keno/history/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      } else {
        setError('Failed to load round history');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* History header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <History size={18} className="text-cyan-400" />
            Round History
          </h2>
          <p className="text-zinc-500 text-xs font-semibold">Past draws and payouts for this Keno room.</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHistory(); }}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border border-white/5 hover:border-cyan-500/30 rounded-xl text-xs font-black uppercase text-zinc-300 hover:text-cyan-400 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-red-300 text-xs font-semibold max-w-xl">
          {error}
        </div>
      )}

      {loading && !history ? (
        <div className="glass-panel p-16 rounded-3xl border border-white/5 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
        </div>
      ) : !history || history.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl border border-white/5 text-center text-zinc-500 text-sm font-semibold">
          No completed rounds yet. Play a round and the results will show up here!
        </div>
      ) : (
        <div className="space-y-5">
          {history.map((round, idx) => (
            <div key={round.id} className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              {/* Round header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-xs">
                    #{history.length - idx}
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Round {history.length - idx}</span>
                    <span className="text-[11px] text-zinc-400 font-semibold block">Finished {formatTime(round.finishedAt)}</span>
                  </div>
                </div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider bg-zinc-950 border border-white/5 px-2.5 py-1 rounded-full">
                  {round.drawnNumbers.length} numbers drawn
                </span>
              </div>

              {/* Drawn numbers */}
              <div className="flex flex-wrap gap-1.5">
                {round.drawnNumbers.map((num, i) => (
                  <span
                    key={i}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-950 border border-white/5 text-[10px] font-black text-fuchsia-300"
                  >
                    {num}
                  </span>
                ))}
              </div>

              {/* Tickets table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[480px]">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5">
                      <th className="py-2.5">Player</th>
                      <th>Picks</th>
                      <th>Hits</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                    {round.tickets.map((t, i) => (
                      // A user can appear more than once per round only in legacy
                      // data (pre-race-fix), so the key must be unique per row.
                      <tr key={`${t.userId}-${i}`} className="hover:bg-white/1">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2">
                            <span className={t.userId === currentUserId ? 'text-fuchsia-400 font-black' : 'text-zinc-200'}>
                              {t.username}
                            </span>
                            {t.userId === currentUserId && (
                              <span className="text-[8px] bg-fuchsia-950 text-fuchsia-400 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">YOU</span>
                            )}
                          </span>
                        </td>
                        <td className="text-zinc-400">{t.spots.length} numbers</td>
                        <td>
                          <span className={`font-black ${t.matched > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {t.matched}
                          </span>
                        </td>
                        <td>
                          {t.payout > 0 ? (
                            <span className="font-black text-emerald-400">+${t.payout.toFixed(2)}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
