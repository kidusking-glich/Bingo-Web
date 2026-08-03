'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Trophy, Coins, Users, Gift, Play, ArrowRight, Wallet, Check, Copy, Mail, ShieldCheck } from 'lucide-react';
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
}

export default function DashboardPage() {
  const { user, token, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [copied, setCopied] = useState(false);
  const [fetchingRooms, setFetchingRooms] = useState(true);
  const [verifSending, setVerifSending] = useState(false);
  const [verifToken, setVerifToken] = useState<string | null>(null);
  const [verifMessage, setVerifMessage] = useState<string | null>(null);
  const [verifError, setVerifError] = useState<string | null>(null);
  const [verifLoading, setVerifLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      refreshProfile();
      fetchRooms();
      const interval = setInterval(fetchRooms, 5000); // refresh room counts every 5 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms.slice(0, 3)); // show top 3 on dashboard
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
    } finally {
      setFetchingRooms(false);
    }
  };

  const handleSendVerification = async () => {
    setVerifMessage(null);
    setVerifError(null);
    setVerifToken(null);
    setVerifSending(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/send-verification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setVerifError(data.error || 'Failed to send verification');
      } else {
        setVerifToken(data.verificationToken);
        setVerifMessage('Verification code generated! Click "Verify Now" to confirm your email.');
      }
    } catch (err: any) {
      setVerifError(err.message || 'Server error');
    } finally {
      setVerifSending(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verifToken) return;
    setVerifLoading(true);
    setVerifError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/verify-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verifToken }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setVerifError(data.error || 'Verification failed');
      } else {
        setVerifMessage('Email verified successfully!');
        setVerifToken(null);
        await refreshProfile();
      }
    } catch (err: any) {
      setVerifError(err.message || 'Server error');
    } finally {
      setVerifLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (!user) return;
    const url = `${window.location.origin}/register?ref=${user.referralCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      <main className="max-w-7xl mx-auto px-6 mt-8 flex-grow w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Stats and Referral Widget) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Email Verification Banner */}
          {!user.isVerified && (
            <div className="glass-panel-cyan p-5 rounded-3xl border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-9 h-9 rounded-xl bg-amber-950/40 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Mail size={18} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-100">Verify Your Email</h3>
                  <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                    {verifMessage || 'Confirm your email address to unlock all platform features.'}
                  </p>
                  {verifToken && (
                    <div className="mt-2 p-2 bg-zinc-950/60 border border-white/5 rounded-xl">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block mb-1">
                        Verification Token (demo)
                      </span>
                      <code className="text-[11px] font-mono text-cyan-400 break-all">{verifToken}</code>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {verifError && (
                  <span className="text-[10px] text-red-400 font-semibold max-w-[160px] text-right">
                    {verifError}
                  </span>
                )}
                {verifToken ? (
                  <button
                    onClick={handleVerifyEmail}
                    disabled={verifLoading}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {verifLoading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    ) : (
                      <ShieldCheck size={12} />
                    )}
                    Verify Now
                  </button>
                ) : (
                  <button
                    onClick={handleSendVerification}
                    disabled={verifSending}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {verifSending ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    ) : (
                      <Mail size={12} />
                    )}
                    Send Verification
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Welcome Banner */}
          <div className="glass-panel p-8 rounded-3xl border border-cyan-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-cyan-500/5 blur-2xl pointer-events-none" />
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-black text-white">
                Welcome back, <span className="bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent text-glow-cyan">{user.username}</span>!
              </h1>
              <p className="text-zinc-400 text-sm font-medium">Ready to play? Join any active room below and start daubing!</p>
            </div>
            <Link
              href="/lobby"
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-105 transition-transform duration-300"
            >
              <Play size={14} className="fill-black" />
              Quick Play
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            
            {/* Wallet Balance */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 relative overflow-hidden">
              <div className="w-10 h-10 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
                <Wallet size={20} />
              </div>
              <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">Wallet Balance</span>
              <span className="text-2xl font-black text-cyan-400 block mt-1 tracking-wider">
                ${parseFloat(user.wallet?.balance || '0.00').toFixed(2)}
              </span>
              <Link href="/wallet" className="text-[10px] font-bold text-zinc-400 hover:text-cyan-400 mt-3 flex items-center gap-1 transition-colors">
                Top Up Balance <ArrowRight size={10} />
              </Link>
            </div>

            {/* Total Winnings */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 relative overflow-hidden">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-950/40 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 mb-4">
                <Trophy size={20} />
              </div>
              <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">Total Winnings</span>
              <span className="text-2xl font-black text-fuchsia-400 block mt-1 tracking-wider">
                ${parseFloat(user.wallet?.totalWinnings || '0.00').toFixed(2)}
              </span>
              <span className="text-[10px] font-semibold text-zinc-500 block mt-3">From all completed games</span>
            </div>

            {/* Referral Earnings */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 relative overflow-hidden">
              <div className="w-10 h-10 rounded-2xl bg-purple-950/40 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                <Users size={20} />
              </div>
              <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">Referral Share</span>
              <span className="text-2xl font-black text-purple-400 block mt-1 tracking-wider">
                ${parseFloat(user.wallet?.referralEarnings || '0.00').toFixed(2)}
              </span>
              <Link href="/referral" className="text-[10px] font-bold text-zinc-400 hover:text-purple-400 mt-3 flex items-center gap-1 transition-colors">
                View Referrals <ArrowRight size={10} />
              </Link>
            </div>
          </div>

          {/* Featured Rooms */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Active Rooms</h2>
              <Link href="/lobby" className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1">
                View All Rooms <ArrowRight size={12} />
              </Link>
            </div>

            <div className="space-y-4">
              {fetchingRooms ? (
                <div className="glass-panel p-8 rounded-3xl border border-white/5 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                </div>
              ) : rooms.length === 0 ? (
                <div className="glass-panel p-8 rounded-3xl border border-white/5 text-center text-zinc-500 text-sm font-semibold">
                  No rooms configured. Contact the Administrator.
                </div>
              ) : (
                rooms.map((room) => (
                  <div
                    key={room.id}
                    className="glass-panel p-6 rounded-3xl border border-white/5 hover:border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-6 transition-all duration-300"
                  >
                    <div className="space-y-1.5 text-center sm:text-left">
                      <div className="flex items-center gap-3 justify-center sm:justify-start">
                        <h3 className="font-bold text-zinc-100">{room.name}</h3>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-wider uppercase ${
                          room.game === 'KENO'
                            ? 'bg-fuchsia-950/50 border border-fuchsia-500/30 text-fuchsia-400'
                            : 'bg-cyan-950/50 border border-cyan-500/30 text-cyan-400'
                        }`}>
                          {room.game || 'BINGO'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold text-zinc-400">
                        <span>Players: <strong className="text-zinc-200">{room.playerCount}</strong></span>
                        <span>•</span>
                        <span>Prize Pool: <strong className="text-fuchsia-400">${parseFloat(room.prizePool).toFixed(2)}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center sm:text-right">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Entry Fee</span>
                        <span className="text-sm font-black text-cyan-400 mt-0.5 block">
                          {parseFloat(room.entryFee) === 0 ? 'FREE' : `$${parseFloat(room.entryFee).toFixed(2)}`}
                        </span>
                      </div>
                      <Link
                        href={room.game === 'KENO' ? `/keno/${room.id}` : `/play/${room.id}`}
                        className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-cyan-950/30 border border-purple-500/20 hover:border-cyan-500/40 text-zinc-200 hover:text-cyan-400 font-bold text-xs tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5"
                      >
                        {room.game === 'KENO' ? 'Play Keno' : 'Enter Room'}
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Referral Link Sharing Box) */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/10 space-y-6 shadow-[0_0_20px_rgba(168,85,247,0.03)]">
            <div className="w-10 h-10 rounded-2xl bg-purple-950/40 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Gift size={20} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-lg font-black text-white">Invite Friends, Earn Cash!</h2>
              <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                Share your link below. You receive a flat **$5.00 bonus** when they register, plus a **10% commission** on every paid game entry fee they spend!
              </p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-2">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Your Unique Invite URL</span>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-zinc-400 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                  {user.referralCode}
                </span>
                <button
                  onClick={copyReferralCode}
                  className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/20 hover:border-cyan-500/30 text-purple-400 hover:text-cyan-400 transition-colors shrink-0"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
