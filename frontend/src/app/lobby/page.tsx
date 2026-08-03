'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { ArrowLeft, Play, Coins, Trophy, Users, ShieldAlert, Sparkles, RefreshCw, Dices, Grid3x3 } from 'lucide-react';
import Link from 'next/link';

interface Room {
  id: string;
  name: string;
  type: string;
  game: string;
  entryFee: string;
  prizePool: string;
  playerCount: number;
  state: string;
  countdown: number;
}

type GameFilter = 'ALL' | 'BINGO' | 'KENO';

export default function LobbyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState<GameFilter>('ALL');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const fetchRooms = async () => {
    try {
      setError(null);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms);
      } else {
        setError('Failed to fetch rooms from API');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRooms();
      const interval = setInterval(fetchRooms, 4000);
      return () => clearInterval(interval);
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 mt-8 w-full flex-grow space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-purple-500/10 pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2">
              <Sparkles className="text-cyan-400" size={24} />
              GAME LOBBY
            </h1>
            <p className="text-zinc-400 text-xs font-semibold">Choose your game — classic Bingo rooms or fast-paced Keno draws.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setFetching(true); fetchRooms(); }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border border-white/5 hover:border-cyan-500/30 rounded-xl text-xs font-black uppercase text-zinc-300 hover:text-cyan-400 transition-colors"
            >
              <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Game filter tabs */}
        <div className="flex gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 w-fit">
          {([
            { id: 'ALL', label: 'All Games', icon: <Grid3x3 size={13} /> },
            { id: 'BINGO', label: 'Bingo', icon: <Sparkles size={13} /> },
            { id: 'KENO', label: 'Keno', icon: <Dices size={13} /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setGameFilter(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                gameFilter === tab.id
                  ? tab.id === 'KENO'
                    ? 'bg-fuchsia-950/40 text-fuchsia-400 border border-fuchsia-500/30'
                    : 'bg-cyan-950/40 text-cyan-400 border border-cyan-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-start gap-3 text-red-300 text-xs font-semibold max-w-xl">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Rooms Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fetching && rooms.length === 0 ? (
            <div className="md:col-span-2 glass-panel p-16 rounded-3xl border border-white/5 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="md:col-span-2 glass-panel p-16 rounded-3xl border border-white/5 text-center text-zinc-500 text-sm font-semibold">
              No rooms are currently configured.
            </div>
          ) : (
            rooms
              .filter((room) => gameFilter === 'ALL' || room.game === gameFilter)
              .map((room) => {
              const isFree = room.type === 'FREE';
              const isKeno = room.game === 'KENO';
              return (
                <div
                  key={room.id}
                  className="glass-panel p-6 rounded-3xl border border-white/5 hover:border-cyan-500/20 flex flex-col justify-between gap-6 transition-all duration-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.03)]"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-black text-white">{room.name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black tracking-wider uppercase ${
                            isKeno
                              ? 'bg-fuchsia-950/50 border border-fuchsia-500/30 text-fuchsia-400'
                              : 'bg-cyan-950/50 border border-cyan-500/30 text-cyan-400'
                          }`}>
                            {room.game || 'BINGO'} GAME
                          </span>
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black tracking-wider uppercase ${
                            room.type === 'FREE'
                              ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-400'
                              : room.type === 'TOURNAMENT'
                              ? 'bg-amber-950/50 border border-amber-500/30 text-amber-400'
                              : 'bg-zinc-900 border border-white/10 text-zinc-400'
                          }`}>
                            {room.type} ROOM
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Entry Fee</span>
                        <span className={`text-lg font-black ${isFree ? 'text-emerald-400 animate-pulse-glow' : 'text-cyan-400'} mt-0.5 block tracking-wider`}>
                          {isFree ? 'FREE' : `$${parseFloat(room.entryFee).toFixed(2)}`}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 bg-zinc-950/50 border border-white/5 p-3 rounded-2xl">
                      <div className="text-center">
                        <span className="text-[8px] text-zinc-500 uppercase font-black tracking-wider block">Players</span>
                        <span className="text-xs font-bold text-zinc-200 block mt-1 flex items-center justify-center gap-1">
                          <Users size={12} className="text-zinc-500" />
                          {room.playerCount}
                        </span>
                      </div>
                      <div className="text-center border-x border-white/5">
                        <span className="text-[8px] text-zinc-500 uppercase font-black tracking-wider block">
                          {isKeno ? 'Max Win' : 'Prize Pool'}
                        </span>
                        <span className="text-xs font-black text-fuchsia-400 block mt-1 flex items-center justify-center gap-1">
                          <Trophy size={12} className="text-fuchsia-500" />
                          {isKeno ? '20,000x' : `$${parseFloat(room.prizePool).toFixed(2)}`}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-[8px] text-zinc-500 uppercase font-black tracking-wider block">Status</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider block mt-1 ${
                          room.state === 'PLAYING' ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {room.state === 'PLAYING' ? 'IN GAME' : 'WAITING'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <div className="text-xs font-semibold text-zinc-500">
                      {room.state === 'WAITING' && room.countdown > 0 && (
                        <span>Starting in <strong className="text-zinc-300 font-bold">{room.countdown}s</strong></span>
                      )}
                      {room.state === 'PLAYING' && (
                        <span>Wait or enter to watch</span>
                      )}
                    </div>
                    
                    <Link
                      href={isKeno ? `/keno/${room.id}` : `/play/${room.id}`}
                      className={`px-6 py-3 rounded-2xl text-black font-black text-xs tracking-wider uppercase shadow-[0_0_10px_rgba(6,182,212,0.2)] hover:scale-102 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all duration-300 ${
                        isKeno
                          ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600'
                          : 'bg-gradient-to-r from-cyan-500 to-purple-600'
                      }`}
                    >
                      {isKeno ? 'Play Keno' : 'Enter Room'}
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {rooms.filter((room) => gameFilter === 'ALL' || room.game === gameFilter).length === 0 && !fetching && (
          <div className="glass-panel p-12 rounded-3xl border border-white/5 text-center text-zinc-500 text-sm font-semibold">
            {gameFilter === 'ALL' ? 'No rooms are currently available.' : `No ${gameFilter.toLowerCase()} rooms available right now.`}
          </div>
        )}
      </main>
    </div>
  );
}
