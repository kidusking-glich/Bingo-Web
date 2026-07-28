'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { ShieldAlert, Settings, DollarSign, Users, Activity, Check, X, RefreshCw, Slash, Lock, ShieldCheck } from 'lucide-react';

interface AdminSettings {
  welcome_bonus: string;
  referral_bonus: string;
  referral_commission_pct: string;
  win_rate_percentage: string;
  rtp_percentage: string;
  bot_difficulty: string;
  number_calling_speed: string;
  jackpot_chance: string;
}

interface FinancialRequest {
  id: string;
  amount: string;
  txHash?: string;
  address?: string;
  status: string;
  createdAt: string;
  user: {
    username: string;
    email: string;
  };
}

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
  wallet: {
    balance: string;
    totalWinnings: string;
    referralEarnings: string;
  } | null;
  referrals: { id: string }[];
}

interface SystemStats {
  totalDeposits: string;
  totalWithdrawals: string;
  totalGames: number;
  activeGames: number;
  totalUsers: number;
  bannedUsers: number;
  totalEntryFees: number;
  totalWinningsPayouts: number;
  houseRevenue: number;
  humanWins: number;
  botWins: number;
}

export default function AdminPanelPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'settings' | 'finances' | 'users' | 'analytics'>('settings');
  const [fetching, setFetching] = useState(true);

  // Settings
  const [settings, setSettings] = useState<AdminSettings>({
    welcome_bonus: '10.00',
    referral_bonus: '5.00',
    referral_commission_pct: '10.00',
    win_rate_percentage: '50.00',
    rtp_percentage: '90.00',
    bot_difficulty: '1',
    number_calling_speed: '4',
    jackpot_chance: '5.00',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Finances
  const [pendingDeposits, setPendingDeposits] = useState<FinancialRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<FinancialRequest[]>([]);
  
  // Users
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [adjustingUser, setAdjustingUser] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');

  // Stats
  const [stats, setStats] = useState<SystemStats>({
    totalDeposits: '0',
    totalWithdrawals: '0',
    totalGames: 0,
    activeGames: 0,
    totalUsers: 0,
    bannedUsers: 0,
    totalEntryFees: 0,
    totalWinningsPayouts: 0,
    houseRevenue: 0,
    humanWins: 0,
    botWins: 0,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'ADMIN') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      loadAdminData();
    }
  }, [user, activeTab]);

  const loadAdminData = async () => {
    if (!token) return;
    try {
      setFetching(true);

      if (activeTab === 'settings') {
        const res = await fetch(`${API_URL}/admin/settings`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      } else if (activeTab === 'finances') {
        const [depRes, witRes] = await Promise.all([
          fetch(`${API_URL}/admin/deposits`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/admin/withdrawals`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (depRes.ok && witRes.ok) {
          const depData = await depRes.json();
          const witData = await witRes.json();
          // Filter only pending requests for admin action
          setPendingDeposits(depData.requests.filter((r: any) => r.status === 'PENDING'));
          setPendingWithdrawals(witData.requests.filter((r: any) => r.status === 'PENDING'));
        }
      } else if (activeTab === 'users') {
        const res = await fetch(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setUsersList(data.users);
        }
      } else if (activeTab === 'analytics') {
        const res = await fetch(`${API_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load admin panel data:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsSuccess(false);

    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });

      if (res.ok) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleProcessDeposit = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`${API_URL}/admin/deposits/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      if (res.ok) {
        loadAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleProcessWithdrawal = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`${API_URL}/admin/withdrawals/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      if (res.ok) {
        loadAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBan = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        loadAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdjustWallet = async (userId: string) => {
    const amtNum = parseFloat(adjustAmount);
    if (isNaN(amtNum) || amtNum <= 0) return;

    try {
      const res = await fetch(`${API_URL}/admin/users/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, amount: amtNum, type: adjustType }),
      });

      if (res.ok) {
        setAdjustAmount('');
        setAdjustingUser(null);
        loadAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !user || user.role !== 'ADMIN') {
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
              <ShieldAlert className="text-amber-500" size={24} />
              SUPER ADMIN PORTAL
            </h1>
            <p className="text-zinc-400 text-xs font-semibold">Configure live game statistics, review deposit hashes, release withdrawals, or adjust user sheets.</p>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 overflow-x-auto max-w-full">
            {[
              { id: 'settings', label: 'Game Settings', icon: <Settings size={14} /> },
              { id: 'finances', label: 'Financial Approvals', icon: <DollarSign size={14} /> },
              { id: 'users', label: 'User Manager', icon: <Users size={14} /> },
              { id: 'analytics', label: 'Analytics Dashboard', icon: <Activity size={14} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-amber-950/40 text-amber-500 border border-amber-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data View */}
        {fetching && activeTab !== 'settings' ? (
          <div className="glass-panel p-16 rounded-3xl border border-white/5 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Tab 1: Settings Manager */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Game Engine Probabilities */}
                <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Probability Engine & RTP</h2>
                  
                  {/* Bot Win Rate Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-zinc-300">
                      <span>User Target Win Rate vs Bots</span>
                      <span className="text-cyan-400 font-mono">{settings.win_rate_percentage}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={parseFloat(settings.win_rate_percentage)}
                      onChange={(e) => setSettings({ ...settings, win_rate_percentage: e.target.value })}
                      className="w-full h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-[10px] text-zinc-500 leading-relaxed block">
                      Target probability of real players winning a game vs computer bots. If actual human wins are below this target, numbers are dynamically biased to complete human card paths first.
                    </span>
                  </div>

                  {/* RTP Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-zinc-300">
                      <span>Target RTP (Return to Player)</span>
                      <span className="text-fuchsia-400 font-mono">{settings.rtp_percentage}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="98"
                      value={parseFloat(settings.rtp_percentage)}
                      onChange={(e) => setSettings({ ...settings, rtp_percentage: e.target.value })}
                      className="w-full h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                    />
                    <span className="text-[10px] text-zinc-500 leading-relaxed block">
                      Desired percentage of general entry fees returned to users in the long run.
                    </span>
                  </div>

                  {/* Jackpot chance */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-zinc-300">
                      <span>Jackpot Draw Chance</span>
                      <span className="text-amber-500 font-mono">{settings.jackpot_chance}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={parseFloat(settings.jackpot_chance)}
                      onChange={(e) => setSettings({ ...settings, jackpot_chance: e.target.value })}
                      className="w-full h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                </div>

                {/* Bonus Adjustments */}
                <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Rewards & Calling Configurations</h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Welcome Bonus ($)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={settings.welcome_bonus}
                        onChange={(e) => setSettings({ ...settings, welcome_bonus: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950 border border-white/5 rounded-2xl text-sm outline-none text-zinc-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Referral Welcome Bonus ($)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={settings.referral_bonus}
                        onChange={(e) => setSettings({ ...settings, referral_bonus: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950 border border-white/5 rounded-2xl text-sm outline-none text-zinc-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Commission Rate (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        value={settings.referral_commission_pct}
                        onChange={(e) => setSettings({ ...settings, referral_commission_pct: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950 border border-white/5 rounded-2xl text-sm outline-none text-zinc-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Call Ticks Speed (seconds)</label>
                      <input
                        type="number"
                        step="1"
                        required
                        value={settings.number_calling_speed}
                        onChange={(e) => setSettings({ ...settings, number_calling_speed: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950 border border-white/5 rounded-2xl text-sm outline-none text-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {settingsSuccess && <span className="text-emerald-400 font-bold flex items-center gap-1"><Check size={14} /> Saved!</span>}
                    </span>
                    <button
                      type="submit"
                      disabled={settingsLoading}
                      className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {settingsLoading ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tab 2: Financial Control */}
            {activeTab === 'finances' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Deposit Approvals */}
                <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Pending Deposits ({pendingDeposits.length})</h2>

                  <div className="space-y-3 overflow-y-auto max-h-[450px]">
                    {pendingDeposits.length === 0 ? (
                      <div className="text-center py-12 text-zinc-600 text-xs font-semibold">No pending deposits.</div>
                    ) : (
                      pendingDeposits.map((dep) => (
                        <div key={dep.id} className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-xs font-black text-zinc-200">{dep.user.username}</span>
                            <span className="text-sm font-black text-cyan-400 block">${parseFloat(dep.amount).toFixed(2)}</span>
                            <span className="text-[10px] font-mono text-zinc-500 block truncate max-w-[180px]">{dep.txHash}</span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleProcessDeposit(dep.id, 'approve')}
                              className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black transition-all"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => handleProcessDeposit(dep.id, 'reject')}
                              className="p-2 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Withdrawal Approvals */}
                <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Pending Withdrawals ({pendingWithdrawals.length})</h2>

                  <div className="space-y-3 overflow-y-auto max-h-[450px]">
                    {pendingWithdrawals.length === 0 ? (
                      <div className="text-center py-12 text-zinc-600 text-xs font-semibold">No pending withdrawals.</div>
                    ) : (
                      pendingWithdrawals.map((wit) => (
                        <div key={wit.id} className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-xs font-black text-zinc-200">{wit.user.username}</span>
                            <span className="text-sm font-black text-rose-400 block">${parseFloat(wit.amount).toFixed(2)}</span>
                            <span className="text-[10px] font-mono text-zinc-500 block truncate max-w-[180px]">{wit.address}</span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleProcessWithdrawal(wit.id, 'approve')}
                              className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black transition-all"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => handleProcessWithdrawal(wit.id, 'reject')}
                              className="p-2 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: User Manager */}
            {activeTab === 'users' && (
              <div className="glass-panel p-6 rounded-3xl border border-white/5 overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5 pb-2">
                      <th className="py-2.5">Player</th>
                      <th>Invites</th>
                      <th>Balance</th>
                      <th>Winnings</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Wallet Edit</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                    {usersList.map((usr) => (
                      <tr key={usr.id} className="hover:bg-white/1">
                        <td className="py-4">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-zinc-200 block">{usr.username}</span>
                            <span className="text-[10px] text-zinc-500 font-medium block">{usr.email}</span>
                          </div>
                        </td>
                        <td>{usr.referrals.length} friends</td>
                        <td className="font-black text-cyan-400 text-sm">${parseFloat(usr.wallet?.balance || '0').toFixed(2)}</td>
                        <td className="text-fuchsia-400">${parseFloat(usr.wallet?.totalWinnings || '0').toFixed(2)}</td>
                        <td>{usr.role}</td>
                        <td>
                          {usr.isBanned ? (
                            <span className="text-red-400 flex items-center gap-0.5 text-[10px] font-black uppercase"><Lock size={10} /> Banned</span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-0.5 text-[10px] font-black uppercase"><ShieldCheck size={10} /> Active</span>
                          )}
                        </td>
                        <td>
                          {adjustingUser === usr.id ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={adjustType}
                                onChange={(e) => setAdjustType(e.target.value as any)}
                                className="bg-zinc-900 border border-white/5 rounded-lg px-1.5 py-1 text-[11px] outline-none text-zinc-300"
                              >
                                <option value="add">Add</option>
                                <option value="deduct">Sub</option>
                              </select>
                              <input
                                type="number"
                                step="1"
                                placeholder="Amt"
                                value={adjustAmount}
                                onChange={(e) => setAdjustAmount(e.target.value)}
                                className="w-14 bg-zinc-950 border border-white/5 rounded-lg px-1.5 py-1 text-[11px] outline-none text-zinc-200"
                              />
                              <button
                                onClick={() => handleAdjustWallet(usr.id)}
                                className="p-1 bg-emerald-950 border border-emerald-500/30 text-emerald-400 rounded-lg"
                              >
                                <Check size={10} />
                              </button>
                              <button
                                onClick={() => setAdjustingUser(null)}
                                className="p-1 bg-red-950 border border-red-500/30 text-red-400 rounded-lg"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAdjustingUser(usr.id); setAdjustAmount(''); }}
                              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-lg text-[10px] font-black uppercase text-zinc-300"
                            >
                              Adjust
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleToggleBan(usr.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                              usr.isBanned
                                ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black'
                                : 'bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
                            }`}
                          >
                            {usr.isBanned ? 'Unban' : 'Ban'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 4: Analytics */}
            {activeTab === 'analytics' && (
              <div className="space-y-8">
                {/* Stats Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Deposits', val: `$${parseFloat(stats.totalDeposits || '0').toFixed(2)}`, color: 'text-cyan-400' },
                    { label: 'Total Withdrawals', val: `$${parseFloat(stats.totalWithdrawals || '0').toFixed(2)}`, color: 'text-rose-400' },
                    { label: 'House Net Revenue', val: `$${stats.houseRevenue.toFixed(2)}`, color: 'text-emerald-400' },
                    { label: 'Completed Games', val: `${stats.totalGames} Rounds`, color: 'text-fuchsia-400' },
                  ].map((stat, idx) => (
                    <div key={idx} className="glass-panel p-5 rounded-2xl border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">{stat.label}</span>
                      <span className={`text-xl font-black ${stat.color} block mt-1 tracking-wider`}>{stat.val}</span>
                    </div>
                  ))}
                </div>

                {/* Custom Charts Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Financial Ratios CSS Chart */}
                  <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
                    <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Liquidity Ratios (Deposit vs Withdrawal)</h3>
                    
                    <div className="space-y-4 pt-4">
                      {/* Deposits Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-zinc-300">
                          <span>General Deposits</span>
                          <span className="text-cyan-400">${parseFloat(stats.totalDeposits || '0').toFixed(2)}</span>
                        </div>
                        <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]" style={{ width: '100%' }} />
                        </div>
                      </div>

                      {/* Withdrawals Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-zinc-300">
                          <span>General Withdrawals</span>
                          <span className="text-rose-400">${parseFloat(stats.totalWithdrawals || '0').toFixed(2)}</span>
                        </div>
                        <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                            style={{
                              width: stats.totalDeposits && parseFloat(stats.totalDeposits) > 0
                                ? `${Math.min((parseFloat(stats.totalWithdrawals) / parseFloat(stats.totalDeposits)) * 100, 100)}%`
                                : '0%'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Win Shares Chart */}
                  <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
                    <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Win Shares (Humans vs Bots)</h3>
                    
                    <div className="flex items-center justify-around gap-6 pt-4">
                      <div className="text-center space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Real Humans</span>
                        <span className="text-2xl font-black text-cyan-400 block tracking-wider">{stats.humanWins} Wins</span>
                      </div>

                      <div className="w-14 h-14 rounded-full border-4 border-dashed border-purple-500/30 flex items-center justify-center text-zinc-500 text-xs font-bold font-mono">
                        VS
                      </div>

                      <div className="text-center space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">Computer Bots</span>
                        <span className="text-2xl font-black text-fuchsia-400 block tracking-wider">{stats.botWins} Wins</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
