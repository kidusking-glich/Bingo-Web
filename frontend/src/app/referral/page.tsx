'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Trophy, Gift, Users, Check, Copy, Award, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';

interface ReferralFriend {
  id: string;
  username: string;
  createdAt: string;
}

interface ReferralEarning {
  id: string;
  friendName: string;
  amount: string;
  createdAt: string;
}

interface LeaderboardItem {
  username: string;
  earnings: string;
  referralCount: number;
}

export default function ReferralPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const [referralsList, setReferralsList] = useState<ReferralFriend[]>([]);
  const [earningsHistory, setEarningsHistory] = useState<ReferralEarning[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const fetchReferralStats = async () => {
    if (!token) return;
    try {
      setFetching(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      
      const [statsRes, leadRes] = await Promise.all([
        fetch(`${API_URL}/referrals/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/referrals/leaderboard`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (statsRes.ok && leadRes.ok) {
        const statsData = await statsRes.json();
        const leadData = await leadRes.json();

        setReferralsList(statsData.referralsList);
        setEarningsHistory(statsData.earningsHistory);
        setLeaderboard(leadData.leaderboard);
      }
    } catch (err) {
      console.error('Failed to load referral metrics:', err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchReferralStats();
    }
  }, [user]);

  const copyReferralLink = () => {
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

      <main className="max-w-7xl mx-auto px-6 mt-8 w-full flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns (Code share and history lists) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Invite Header Panel */}
          <div className="glass-panel p-8 rounded-3xl border border-purple-500/10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-[0_0_20px_rgba(168,85,247,0.03)]">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-purple-500/5 blur-2xl pointer-events-none" />
            
            <div className="space-y-3 max-w-lg text-center md:text-left">
              <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2 justify-center md:justify-start">
                <Gift className="text-purple-400" size={24} />
                INVITE & EARN CASH
              </h1>
              <p className="text-zinc-400 text-xs font-semibold leading-relaxed">
                Unlock passive streams. Tell your friends to register using your custom code. Collect $5.00 flat welcome credits and 10% cash commission off all their game entries!
              </p>
            </div>

            <div className="bg-zinc-950 p-5 rounded-2xl border border-white/5 space-y-2 shrink-0 w-full md:w-auto min-w-[240px]">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Your Unique Invite URL</span>
              <div className="flex items-center justify-between gap-4 font-mono text-zinc-300 text-xs bg-black/40 px-3 py-2 rounded-xl">
                <span>{user.referralCode}</span>
                <button
                  onClick={copyReferralLink}
                  className="p-1.5 rounded-lg bg-purple-950/40 border border-purple-500/20 hover:border-cyan-500/30 text-purple-400 hover:text-cyan-400 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* User's Referrals Lists */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Friends list */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                <Users size={16} className="text-cyan-400" />
                Invited Friends ({referralsList.length})
              </h2>

              <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
                {fetching ? (
                  <div className="py-6 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : referralsList.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-xs font-semibold">No friends have registered yet.</div>
                ) : (
                  referralsList.map((friend) => (
                    <div key={friend.id} className="p-3 bg-zinc-950/50 border border-white/5 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300">{friend.username}</span>
                      <span className="text-[10px] text-zinc-500">{new Date(friend.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Commissions history */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
              <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                <Award size={16} className="text-fuchsia-400" />
                Earnings Ledger ({earningsHistory.length})
              </h2>

              <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
                {fetching ? (
                  <div className="py-6 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : earningsHistory.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-xs font-semibold">No earnings transactions found.</div>
                ) : (
                  earningsHistory.map((earn) => (
                    <div key={earn.id} className="p-3 bg-zinc-950/50 border border-white/5 rounded-2xl flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-zinc-300 block">{earn.friendName}</span>
                        <span className="text-[9px] text-zinc-500">{new Date(earn.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-sm font-black text-emerald-400 tracking-wider">+${parseFloat(earn.amount).toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Leaderboard) */}
        <div className="space-y-6 lg:col-span-1">
          <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                <Trophy size={16} className="text-amber-400" />
                Referrers Leaderboard
              </h2>
              <button
                onClick={fetchReferralStats}
                className="p-1 bg-zinc-950 border border-white/5 hover:border-purple-500/20 rounded-lg text-zinc-400"
              >
                <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="space-y-4">
              {fetching && leaderboard.length === 0 ? (
                <div className="py-12 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-xs font-semibold">Leaderboard empty.</div>
              ) : (
                leaderboard.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-zinc-950/30 border border-white/5 rounded-2xl flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                        idx === 0
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : idx === 1
                          ? 'bg-zinc-400/25 text-zinc-300 border border-zinc-500/30'
                          : idx === 2
                          ? 'bg-amber-800/30 text-amber-600 border border-amber-800/30'
                          : 'bg-zinc-900 text-zinc-500'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-zinc-200 block">{item.username}</span>
                        <span className="text-[9px] text-zinc-500">{item.referralCount} Invites</span>
                      </div>
                    </div>

                    <span className="text-xs font-black text-cyan-400 tracking-wider">
                      ${parseFloat(item.earnings).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
