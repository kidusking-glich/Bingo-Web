'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import {
  Dices, Sparkles, Volume2, VolumeX, RotateCcw, Undo2, Zap,
  Coins, Play, ChevronDown, ChevronUp, Trophy, XCircle, Timer, CircleDollarSign,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// ═══════════════════════════════════════════════════════════════════════════
// Keno Rules — mirrors backend/src/engine/KenoEngine.ts (display + preview only;
// the actual draw & settlement happen server-side via POST /api/keno/play)
// ═══════════════════════════════════════════════════════════════════════════
const KENO_TOTAL = 80;       // numbers on the board
const KENO_DRAWS = 20;       // numbers drawn each round
const KENO_MAX_PICKS = 10;   // max spots a player can pick

// Standard Keno multiplier paytable: spotsPicked -> catches -> multiplier
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 1: 1, 2: 12 },
  3: { 2: 3, 3: 43 },
  4: { 2: 2, 3: 20, 4: 150 },
  5: { 2: 1, 3: 6, 4: 100, 5: 800 },
  6: { 2: 1, 3: 6, 4: 50, 5: 350, 6: 1500 },
  7: { 3: 2, 4: 20, 5: 100, 6: 800, 7: 5000 },
  8: { 3: 2, 4: 15, 5: 100, 6: 500, 7: 2500, 8: 10000 },
  9: { 3: 1, 4: 5, 5: 40, 6: 200, 7: 1000, 8: 5000, 9: 20000 },
  10: { 3: 1, 4: 4, 5: 20, 6: 100, 7: 400, 8: 2000, 9: 10000, 10: 50000 },
};

const BET_OPTIONS = [0.5, 1, 2, 5, 10];

type Phase = 'picking' | 'drawing' | 'settled';

interface RoundResult {
  id?: string;
  bet: number;
  picks: number[];
  drawn: number[];
  matches: number;
  multiplier: number;
  payout: number;
  isWin: boolean;
}

interface HistoryItem extends RoundResult {
  createdAt: string;
}

// ── Local helper: unique random picks for Quick Pick (selection only, not the draw) ──
const drawUniqueNumbers = (count: number): number[] => {
  const pool = [...Array(KENO_TOTAL).keys()].map((i) => i + 1);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
};

// ── WebAudio sound helpers ──
const playTone = (freqStart: number, freqEnd: number, duration = 0.1, volume = 0.14) => {
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* audio unavailable */ }
};

// ── Confetti overlay (matching the Bingo room page) ──
interface ConfettiParticle {
  id: number;
  left: string;
  delay: string;
  duration: string;
  color: string;
  size: number;
  rotation: string;
}

// Generated outside render (in the draw-settle callback) to keep the component pure.
const makeConfettiParticles = (count = 24): ConfettiParticle[] =>
  [...Array(count).keys()].map((i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.4}s`,
    duration: `${1.2 + Math.random() * 1.4}s`,
    color: ['#06b6d4', '#d946ef', '#f59e0b', '#10b981', '#f97316', '#a855f7'][i % 6],
    size: 4 + Math.random() * 8,
    rotation: `${Math.random() * 360}deg`,
  }));

function ConfettiOverlay({ particles }: { particles: ConfettiParticle[] }) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 rounded-sm animate-confetti-fall"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotation})`,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Keno Page
// ═══════════════════════════════════════════════════════════════════════════
export default function KenoPage() {
  const { user, token, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('picking');
  const [picks, setPicks] = useState<number[]>([]);
  const [bet, setBet] = useState(1);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [currentDrawn, setCurrentDrawn] = useState<number | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [customBet, setCustomBet] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showPaytable, setShowPaytable] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiParticle[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playingRef = useRef(false);

  // ── Auth guard ──
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // ── Clean up pending draw timers on unmount ──
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // ── Load recent rounds ──
  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/keno/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.games || []);
      }
    } catch { /* history is non-critical */ }
  }, [token]);

  useEffect(() => {
    // Load recent rounds once the user is authenticated. The linter flags this as
    // setState-in-effect; fetching on mount is intentional here.
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadHistory();
    }
  }, [token, loadHistory]);

  const picksSet = useMemo(() => new Set(picks), [picks]);
  const revealedSet = useMemo(() => new Set(revealed), [revealed]);
  const isBusy = phase === 'drawing' || fetching;

  const maxMultiplier = useMemo(() => {
    const row = PAYTABLE[picks.length];
    if (!row) return 0;
    return Math.max(...Object.values(row));
  }, [picks.length]);

  const balance = parseFloat(user?.wallet?.balance || '0');
  const effectiveBet = customBet !== '' ? parseFloat(customBet) : bet;

  const playPop = useCallback(() => playTone(440, 880, 0.1, 0.12), []);
  const playTick = useCallback(() => playTone(320, 400, 0.06, 0.05), []);
  const playWin = useCallback(() => {
    playTone(523, 523, 0.15, 0.15);
    const t = setTimeout(() => playTone(784, 784, 0.28, 0.15), 140);
    timersRef.current.push(t);
  }, []);

  // ── Pick interactions ──
  const togglePick = (num: number) => {
    if (phase !== 'picking' || fetching) return;
    const adding = !picks.includes(num) && picks.length < KENO_MAX_PICKS;
    setPicks((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= KENO_MAX_PICKS) return prev;
      return [...prev, num];
    });
    if (adding && soundEnabled) playTick();
  };

  const quickPick = () => {
    if (phase !== 'picking' || fetching) return;
    setPicks(drawUniqueNumbers(KENO_MAX_PICKS));
  };

  const undoPick = () => {
    if (phase !== 'picking' || fetching) return;
    setPicks((prev) => prev.slice(0, -1));
  };

  const clearPicks = () => {
    if (phase !== 'picking' || fetching) return;
    setPicks([]);
  };

  // ── Play: server-side draw + live sequential reveal ──
  const startDraw = async () => {
    if (phase !== 'picking' || picks.length === 0 || fetching || playingRef.current) return;
    if (!Number.isFinite(effectiveBet) || effectiveBet <= 0) {
      setPlayError('Enter a valid bet amount.');
      return;
    }

    playingRef.current = true;
    setPlayError(null);
    setFetching(true);

    try {
      const res = await fetch(`${API_URL}/keno/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ picks, bet: effectiveBet }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPlayError(data.error || 'Failed to start round');
        return;
      }

      const game = data.game as RoundResult;
      clearTimers();
      setRevealed([]);
      setCurrentDrawn(null);
      setResult(null);
      setPhase('drawing');

      game.drawn.forEach((n, i) => {
        const t = setTimeout(() => {
          setRevealed((prev) => [...prev, n]);
          setCurrentDrawn(n);
          if (soundEnabled) playPop();
        }, 350 + i * 340);
        timersRef.current.push(t);
      });

      const settleT = setTimeout(() => {
        setResult(game);
        setPhase('settled');
        if (game.isWin) {
          setConfetti(makeConfettiParticles());
          const confettiT = setTimeout(() => setConfetti(null), 4500);
          timersRef.current.push(confettiT);
          if (soundEnabled) playWin();
        }
        refreshProfile();
        void loadHistory();
      }, 350 + KENO_DRAWS * 340 + 250);
      timersRef.current.push(settleT);
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Network error — is the server running?');
    } finally {
      playingRef.current = false;
      setFetching(false);
    }
  };

  const playAgain = () => {
    clearTimers();
    setPhase('picking');
    setRevealed([]);
    setCurrentDrawn(null);
    setResult(null);
    setConfetti(null);
    setPlayError(null);
  };

  // ── Loading / auth guard ──
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Board cell styling ──
  const cellClass = (num: number): string => {
    const isHit = picksSet.has(num) && revealedSet.has(num);
    const isLatest = currentDrawn === num;
    let cls =
      'relative aspect-square flex items-center justify-center rounded-lg md:rounded-xl font-black text-[10px] md:text-xs border transition-all duration-300 ';
    if (isHit) {
      cls += 'bg-gradient-to-br from-amber-500/60 to-orange-600/40 border-amber-400 text-amber-100 shadow-[0_0_14px_rgba(245,158,11,0.55)] scale-105';
    } else if (picksSet.has(num)) {
      cls += 'bg-gradient-to-br from-fuchsia-500/40 to-purple-600/40 border-fuchsia-400/70 text-fuchsia-100 shadow-[0_0_10px_rgba(217,70,239,0.35)]';
    } else if (revealedSet.has(num)) {
      cls += 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300';
    } else {
      cls += 'bg-zinc-950 border-white/5 text-zinc-600 hover:border-zinc-500/40 hover:text-zinc-300 hover:scale-105';
    }
    if (isLatest) cls += ' animate-bounce-once ring-2 ring-cyan-300/60 z-10';
    if (isBusy && !revealedSet.has(num) && !picksSet.has(num)) cls += ' opacity-30';
    return cls;
  };

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col select-none relative overflow-hidden neon-grid">
      <Navbar />
      {confetti && <ConfettiOverlay particles={confetti} />}

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="max-w-7xl mx-auto w-full px-4 md:px-6 pt-6 pb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-float">
            <Dices size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-[0.2em] bg-gradient-to-r from-emerald-400 via-cyan-400 to-fuchsia-400 bg-clip-text text-transparent text-glow-cyan">
              KENO
            </h1>
            <p className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-0.5">
              Pick up to 10 · 20 numbers drawn · Match to win
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="glass-panel rounded-2xl px-4 py-2 flex items-center gap-2">
            <Coins size={14} className="text-amber-400" />
            <span className="text-sm font-black text-cyan-400 tracking-wider">${balance.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className="p-2.5 bg-zinc-950 border border-white/5 hover:border-emerald-500/20 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      {/* ═══════════════ MAIN ═══════════════ */}
      <main className="max-w-7xl mx-auto w-full px-3 md:px-6 py-4 flex-grow flex flex-col lg:flex-row gap-4 md:gap-5">
        {/* ── Board Panel ── */}
        <section className="flex-1 min-w-0 glass-panel rounded-3xl border border-white/5 p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">Pick Your Numbers</h2>
              <p className="text-[10px] text-zinc-600 font-semibold mt-0.5">
                Click numbers to select · {picks.length} / {KENO_MAX_PICKS}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {phase === 'picking' ? (
                <>
                  <button
                    onClick={quickPick}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-500/40 text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    <Zap size={11} /> Quick Pick
                  </button>
                  <button
                    onClick={undoPick}
                    disabled={picks.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/15 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Undo2 size={11} /> Undo
                  </button>
                  <button
                    onClick={clearPicks}
                    disabled={picks.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-white/5 text-zinc-400 hover:text-red-400 hover:border-red-500/20 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <RotateCcw size={11} /> Clear
                  </button>
                </>
              ) : (
                <span
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                    phase === 'drawing'
                      ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                      : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  {phase === 'drawing' ? <Timer size={11} className="animate-pulse" /> : <Trophy size={11} />}
                  {phase === 'drawing' ? 'Drawing...' : 'Round Complete'}
                </span>
              )}
            </div>
          </div>

          {/* 80-number board */}
          <div className={`grid grid-cols-8 md:grid-cols-10 gap-1 md:gap-1.5 ${phase !== 'picking' ? 'pointer-events-none' : ''}`}>
            {[...Array(KENO_TOTAL).keys()].map((i) => {
              const num = i + 1;
              return (
                <button
                  key={num}
                  onClick={() => togglePick(num)}
                  className={cellClass(num)}
                  aria-pressed={picksSet.has(num)}
                >
                  {num}
                  {picksSet.has(num) && revealedSet.has(num) && (
                    <Sparkles size={7} className="absolute top-0.5 right-0.5 text-yellow-300" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Drawn history */}
          {revealed.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Drawn Numbers</span>
                <span className="text-[10px] text-zinc-600 font-mono font-bold">{revealed.length} / {KENO_DRAWS}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {revealed.map((n) => (
                  <div
                    key={n}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black border transition-all ${
                      picksSet.has(n)
                        ? 'bg-gradient-to-br from-amber-500/50 to-orange-600/40 border-amber-400 text-amber-100 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300'
                    }`}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Control Panel ── */}
        <aside className="w-full lg:w-80 flex-shrink-0 space-y-4">
          {/* Current draw / result display */}
          <div className="glass-panel-pink rounded-3xl border border-white/5 p-5 text-center space-y-3">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Current Draw</span>

            {currentDrawn ? (
              <div
                className={`mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center text-3xl font-black text-black shadow-[0_0_30px_rgba(6,182,212,0.5)] ${
                  phase === 'drawing' ? 'animate-bounce-once' : ''
                }`}
              >
                {currentDrawn}
              </div>
            ) : (
              <div className="mx-auto w-20 h-20 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center text-zinc-700">
                <CircleDollarSign size={28} />
              </div>
            )}

            {phase === 'drawing' && (
              <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all duration-300"
                  style={{ width: `${(revealed.length / KENO_DRAWS) * 100}%` }}
                />
              </div>
            )}

            {phase === 'settled' && result && (
              <div className="pt-3 border-t border-white/5 space-y-2 animate-fade-in">
                <div className={`font-black text-xl flex items-center justify-center gap-2 ${result.isWin ? 'text-amber-300' : 'text-zinc-500'}`}>
                  {result.isWin ? <Trophy size={20} /> : <XCircle size={20} />}
                  {result.isWin ? 'YOU WIN!' : 'NO LUCK'}
                </div>
                <div className="flex justify-center gap-3 text-[11px] font-bold text-zinc-400">
                  <span>{result.matches} / {result.picks.length} matches</span>
                  <span className="text-zinc-500">·</span>
                  <span>{result.multiplier}×</span>
                </div>
                <div className={`text-2xl font-black tracking-wider ${result.isWin ? 'text-emerald-400 text-glow-cyan' : 'text-red-400'}`}>
                  {result.isWin ? `+$${result.payout.toFixed(2)}` : `-$${result.bet.toFixed(2)}`}
                </div>
              </div>
            )}
          </div>

          {/* Bet selector */}
          <div className="glass-panel rounded-3xl border border-white/5 p-5 space-y-4">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Your Bet</span>

            <div className="grid grid-cols-5 gap-2">
              {BET_OPTIONS.map((opt) => {
                const active = customBet === '' && bet === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => { setBet(opt); setCustomBet(''); }}
                    className={`py-2 rounded-xl text-xs font-black transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)] scale-105'
                        : 'bg-zinc-950 border border-white/5 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/30'
                    }`}
                  >
                    ${opt === 0.5 ? '0.50' : opt}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Custom</span>
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={customBet}
                onChange={(e) => setCustomBet(e.target.value)}
                placeholder={bet.toString()}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/5 focus:border-emerald-500/40 rounded-xl outline-none text-sm font-bold text-zinc-200 placeholder:text-zinc-600"
              />
            </div>

            {/* Payout preview for current spot count */}
            <div className="p-3 bg-zinc-950/50 border border-white/5 rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">
                  Payouts — {picks.length || '?'} spots
                </span>
                {picks.length > 0 && (
                  <span className="text-[10px] font-black text-amber-400">Max {maxMultiplier}×</span>
                )}
              </div>
              {picks.length === 0 ? (
                <p className="text-[10px] text-zinc-600 font-semibold">Pick numbers on the board to preview payouts.</p>
              ) : (
                Object.entries(PAYTABLE[picks.length]).map(([catches, mult]) => (
                  <div key={catches} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 font-semibold">
                      {catches} catch{+catches > 1 ? 'es' : ''}
                    </span>
                    <span className={mult > 1 ? 'text-amber-300 font-black' : 'text-zinc-500 font-bold'}>
                      {mult}×
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Play / Play Again */}
          {phase === 'picking' && (
            <>
              {playError && (
                <div className="px-4 py-2.5 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-300 text-[11px] font-bold animate-fade-in">
                  {playError}
                </div>
              )}
              <button
                onClick={startDraw}
                disabled={picks.length === 0 || fetching || !Number.isFinite(effectiveBet) || effectiveBet <= 0}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-fuchsia-500 text-black font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <span className="flex items-center justify-center gap-2">
                  {fetching ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                      Contacting server...
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" />
                      {picks.length === 0
                        ? 'Pick at least 1 number'
                        : `Play · $${Number.isFinite(effectiveBet) ? effectiveBet.toFixed(2) : '0.00'}`}
                    </>
                  )}
                </span>
              </button>
            </>
          )}

          {phase === 'settled' && (
            <button
              onClick={playAgain}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-fuchsia-500 text-black font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-95 transition-all"
            >
              Play Again
            </button>
          )}

          {/* Recent rounds */}
          <div className="glass-panel rounded-3xl border border-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Recent Rounds</span>
              {history.length > 0 && (
                <span className="text-[10px] text-zinc-600 font-bold">{history.length}</span>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-[10px] text-zinc-600 font-semibold">Play a round to see your history here.</p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {history.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-2 bg-zinc-950/50 border border-white/5 rounded-xl text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${g.isWin ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500/60'}`} />
                      <span className="text-zinc-400 font-semibold">{g.matches}/{g.picks.length} · {g.multiplier}×</span>
                    </div>
                    <span className={`font-black ${g.isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                      {g.isWin ? `+$${g.payout.toFixed(2)}` : `-$${g.bet.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paytable toggle */}
          <button
            onClick={() => setShowPaytable((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-zinc-400 hover:text-cyan-300 text-xs font-black uppercase tracking-widest transition-all"
          >
            <span>Full Paytable</span>
            {showPaytable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showPaytable && (
            <div className="glass-panel rounded-3xl border border-white/5 p-4 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-[9px] text-zinc-600 font-black uppercase tracking-widest pb-1 border-b border-white/5">
                <span>Spots</span>
                <span>Catches → Multiplier</span>
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((spots) => (
                <div key={spots} className="flex items-center gap-2 text-[10px]">
                  <span className="w-14 text-zinc-500 font-black flex-shrink-0">{spots} spot{spots > 1 ? 's' : ''}</span>
                  <div className="flex gap-1 flex-wrap">
                    {[...Array(11).keys()].map((catches) => {
                      const mult = PAYTABLE[spots][catches];
                      return (
                        <span
                          key={catches}
                          className={`w-6 h-5 flex items-center justify-center rounded font-black ${
                            mult
                              ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-300'
                              : 'bg-zinc-950 border border-white/5 text-zinc-700'
                          }`}
                        >
                          {mult ?? '–'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </main>

      {/* Footer note */}
      <footer className="max-w-7xl mx-auto w-full px-6 pb-6">
        <p className="text-[9px] text-zinc-700 font-semibold text-center">
          Draws are performed and verified server-side — wagers and payouts are applied to your wallet.
        </p>
      </footer>
    </div>
  );
}
