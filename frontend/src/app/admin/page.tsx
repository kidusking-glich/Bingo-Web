'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import {
  ShieldAlert, Settings, DollarSign, Users, Activity, Check, X,
  RefreshCw, Lock, ShieldCheck, Search, History, Trophy,
  TrendingUp, TrendingDown, Gamepad2, Download, Eye, Dices
} from 'lucide-react';

// ── Types ──
interface AdminSettings {
  welcome_bonus: string;
  referral_bonus: string;
  referral_commission_pct: string;
  win_rate_percentage: string;
  rtp_percentage: string;
  bot_difficulty: string;
  number_calling_speed: string;
  jackpot_chance: string;
  jackpot_amount: string;
  keno_max_spots: string;
  keno_draw_size: string;
}

interface FinancialRequest {
  id: string;
  amount: string;
  txHash?: string;
  address?: string;
  status: string;
  createdAt: string;
  user: { username: string; email: string };
}

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
  wallet: { balance: string; totalWinnings: string; referralEarnings: string } | null;
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

interface KenoRoomStat {
  roomId: string;
  roomName: string;
  entryFee: number;
  roundsPlayed: number;
  ticketsSold: number;
  totalWagers: number;
  totalPayouts: number;
  houseTake: number;
  payoutRate: number;
}

interface KenoStats {
  stats: {
    totalRounds: number;
    totalTickets: number;
    totalWagers: number;
    totalPayouts: number;
    totalHouseTake: number;
  };
  rooms: KenoRoomStat[];
}

interface GameHistoryItem {
  id: string;
  state: string;
  createdAt: string;
  winnerName?: string;
  prizePool?: number;
  room: { name: string; entryFee: number };
  participants: { user: { username: string } }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// ── Stat Card ──
function StatCard({ label, value, color, icon, trend }: {
  label: string; value: string; color: string; icon: React.ReactNode; trend?: { up: boolean; pct: string };
}) {
  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">{label}</span>
          <span className={`text-lg md:text-xl font-black ${color} block mt-0.5 tracking-wider`}>{value}</span>
        </div>
        <div className={`p-2 rounded-xl bg-zinc-950 border border-white/5 ${color}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3 text-[10px]">
          {trend.up
            ? <TrendingUp size={10} className="text-emerald-400" />
            : <TrendingDown size={10} className="text-red-400" />}
          <span className={trend.up ? 'text-emerald-400' : 'text-red-400'}>{trend.pct}</span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function AdminPanelPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const tabs = [
    { id: 'settings', label: 'Game Settings', icon: <Settings size={14} /> },
    { id: 'finances', label: 'Financial Approvals', icon: <DollarSign size={14} /> },
    { id: 'users', label: 'User Manager', icon: <Users size={14} /> },
    { id: 'analytics', label: 'Analytics Dashboard', icon: <Activity size={14} /> },
    { id: 'games', label: 'Game History', icon: <History size={14} /> },
    { id: 'keno', label: 'Keno Analytics', icon: <Dices size={14} /> },
  ] as const;
  type TabId = typeof tabs[number]['id'];

  const [activeTab, setActiveTab] = useState<TabId>('settings');
  const [fetching, setFetching] = useState(true);

  // ── Settings ──
  const [settings, setSettings] = useState<AdminSettings>({
    welcome_bonus: '10.00', referral_bonus: '5.00', referral_commission_pct: '10.00',
    win_rate_percentage: '50.00', rtp_percentage: '90.00', bot_difficulty: '1',
    number_calling_speed: '4', jackpot_chance: '5.00', jackpot_amount: '100.00',
    keno_max_spots: '10', keno_draw_size: '20',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // ── Finances ──
  const [pendingDeposits, setPendingDeposits] = useState<FinancialRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<FinancialRequest[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ── Users ──
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [adjustingUser, setAdjustingUser] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');

  // ── Stats ──
  const [stats, setStats] = useState<SystemStats>({
    totalDeposits: '0', totalWithdrawals: '0', totalGames: 0, activeGames: 0,
    totalUsers: 0, bannedUsers: 0, totalEntryFees: 0, totalWinningsPayouts: 0,
    houseRevenue: 0, humanWins: 0, botWins: 0,
  });

  // Keno analytics
  const [kenoStats, setKenoStats] = useState<KenoStats | null>(null);

  // ── Game History ──
  const [gameHistory, setGameHistory] = useState<GameHistoryItem[]>([]);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState<'all' | 'PLAYING' | 'FINISHED'>('all');

  // ── Auth redirect ──
  useEffect(() => {
    if (!loading) {
      if (!user) router.push('/login');
      else if (user.role !== 'ADMIN') router.push('/dashboard');
    }
  }, [user, loading, router]);

  // ── Load data on tab change ──
  useEffect(() => {
    if (user && user.role === 'ADMIN') loadAdminData();
  }, [user, activeTab]);

  // ── Auto-refresh financials ──
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'finances' || !user || user.role !== 'ADMIN') return;
    const interval = setInterval(() => {
      loadFinancialData();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, user]);

  const loadFinancialData = async () => {
    if (!token) return;
    try {
      const [depRes, witRes] = await Promise.all([
        fetch(`${API_URL}/admin/deposits`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/withdrawals`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (depRes.ok && witRes.ok) {
        const depData = await depRes.json();
        const witData = await witRes.json();
        setPendingDeposits((depData.requests || []).filter((r: any) => r.status === 'PENDING'));
        setPendingWithdrawals((witData.requests || []).filter((r: any) => r.status === 'PENDING'));
      }
    } catch {}
  };

  const loadAdminData = async () => {
    if (!token) return;
    try {
      setFetching(true);
      switch (activeTab) {
        case 'settings': {
          const res = await fetch(`${API_URL}/admin/settings`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const d = await res.json(); setSettings(prev => ({ ...prev, ...d.settings })); }
          break;
        }
        case 'finances':
          await loadFinancialData();
          break;
        case 'users': {
          const res = await fetch(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const d = await res.json(); setUsersList(d.users || []); }
          break;
        }
        case 'analytics': {
          const res = await fetch(`${API_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const d = await res.json(); setStats(d.stats); }
          break;
        }
        case 'games': {
          const res = await fetch(`${API_URL}/admin/games`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const d = await res.json(); setGameHistory(d.games || []); }
          break;
        }
        case 'keno': {
          const res = await fetch(`${API_URL}/admin/keno-stats`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const data = await res.json(); setKenoStats(data); }
          break;
        }
      }
    } catch (err) { console.error('Failed to load admin data:', err); }
    finally { setFetching(false); }
  };

  // ── Handlers ──
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true); setSettingsSuccess(false);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) { setSettingsSuccess(true); setTimeout(() => setSettingsSuccess(false), 2000); }
    } catch {} finally { setSettingsLoading(false); }
  };

  const handleProcessAction = async (endpoint: string, requestId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) loadFinancialData();
    } catch {}
  };

  const handleToggleBan = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/ban`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) loadAdminData();
    } catch {}
  };

  const handleAdjustWallet = async (userId: string) => {
    const amtNum = parseFloat(adjustAmount);
    if (isNaN(amtNum) || amtNum <= 0) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/wallet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, amount: amtNum, type: adjustType }),
      });
      if (res.ok) { setAdjustAmount(''); setAdjustingUser(null); loadAdminData(); }
    } catch {}
  };

  const exportUsersCSV = () => {
    const header = 'Username,Email,Role,Balance,Winnings,Referrals,Status\n';
    const rows = usersList.map(u =>
      `"${u.username}","${u.email}",${u.role},${u.wallet?.balance || 0},${u.wallet?.totalWinnings || 0},${u.referrals.length},${u.isBanned ? 'Banned' : 'Active'}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Filtered users ──
  const filteredUsers = usersList.filter(u => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredGames = gameHistory.filter(g => {
    if (gameFilter === 'all') return true;
    return g.state === gameFilter;
  });

  // ── Loading guard ──
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

      <main className="max-w-7xl mx-auto px-4 md:px-6 mt-6 md:mt-8 w-full flex-grow space-y-6 md:space-y-8">
        {/* ════ HEADER ════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/10 pb-5">
          <div className="space-y-1">
            <h1 className="text-xl md:text-3xl font-black text-white flex items-center gap-2">
              <ShieldAlert className="text-amber-500" size={22} />
              SUPER ADMIN PORTAL
            </h1>
            <p className="text-zinc-400 text-xs font-semibold">Configure, approve, manage, and monitor the platform</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 overflow-x-auto max-w-full">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 md:px-4 py-2 text-[10px] md:text-xs font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-amber-950/40 text-amber-500 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ════ CONTENT ════ */}
        {fetching && activeTab !== 'settings' && activeTab !== 'finances' ? (
          <div className="glass-panel p-16 rounded-3xl border border-white/5 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── TAB 1: SETTINGS ── */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Probability Engine */}
                <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-5">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <Gamepad2 size={14} className="text-cyan-500" />
                    Probability Engine & RTP
                  </h2>

                  {[
                    { key: 'win_rate_percentage', label: 'User Target Win Rate vs Bots', min: 10, max: 90, color: 'accent-cyan-500', valColor: 'text-cyan-400', desc: 'Target probability of real players winning. Numbers are biased if human wins fall below target.' },
                    { key: 'rtp_percentage', label: 'Target RTP (Return to Player)', min: 50, max: 98, color: 'accent-fuchsia-500', valColor: 'text-fuchsia-400', desc: 'Desired % of entry fees returned to users in the long run.' },
                    { key: 'jackpot_chance', label: 'Jackpot Draw Chance', min: 0, max: 30, color: 'accent-amber-500', valColor: 'text-amber-500', desc: 'Chance of a jackpot bonus being added to each game.' },
                  ].map(s => (
                    <div key={s.key} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-zinc-300">
                        <span>{s.label}</span>
                        <span className={`font-mono ${s.valColor}`}>{settings[s.key as keyof AdminSettings]}%</span>
                      </div>
                      <input type="range" min={s.min} max={s.max}
                        value={parseFloat(settings[s.key as keyof AdminSettings])}
                        onChange={e => setSettings({ ...settings, [s.key]: e.target.value })}
                        className={`w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer ${s.color} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current`}
                      />
                      <span className="text-[10px] text-zinc-500 leading-relaxed block">{s.desc}</span>
                    </div>
                  ))}

                  {/* Jackpot amount */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Jackpot Amount ($)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      value={settings.jackpot_amount}
                      onChange={(e) => setSettings({ ...settings, jackpot_amount: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-white/5 rounded-2xl text-sm outline-none text-zinc-200"
                    />
                  </div>
                </div>

                {/* Rewards & Config */}
                <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-5">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <Settings size={14} className="text-amber-500" />
                    Rewards & Calling Configurations
                  </h2>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Welcome Bonus ($)" value={settings.welcome_bonus} onChange={v => setSettings({ ...settings, welcome_bonus: v })} />
                    <Field label="Referral Bonus ($)" value={settings.referral_bonus} onChange={v => setSettings({ ...settings, referral_bonus: v })} />
                    <Field label="Commission Rate (%)" value={settings.referral_commission_pct} onChange={v => setSettings({ ...settings, referral_commission_pct: v })} />
                    <Field label="Call Speed (seconds)" value={settings.number_calling_speed} onChange={v => setSettings({ ...settings, number_calling_speed: v })} />
                    <Field label="Keno Max Spots" value={settings.keno_max_spots} onChange={v => setSettings({ ...settings, keno_max_spots: v })} />
                    <Field label="Keno Draw Size" value={settings.keno_draw_size} onChange={v => setSettings({ ...settings, keno_draw_size: v })} />
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-white/5">
                    <span className="text-xs text-zinc-500">
                      {settingsSuccess &&
                        <span className="text-emerald-400 font-bold flex items-center gap-1"><Check size={14} /> Saved!</span>}
                    </span>
                    <button type="submit" disabled={settingsLoading}
                      className="px-5 md:px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {settingsLoading ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ── TAB 2: FINANCES ── */}
            {activeTab === 'finances' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Pending Requests</h2>
                  <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
                    <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/10 bg-zinc-900 accent-cyan-500" />
                    Auto-refresh (10s)
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                  {/* Deposits */}
                  <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Pending Deposits</h3>
                      <span className={`text-[10px] font-bold ${pendingDeposits.length > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {pendingDeposits.length} pending
                      </span>
                    </div>
                    <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
                      {pendingDeposits.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs font-semibold">✓ All deposits processed</div>
                      ) : pendingDeposits.map(dep => (
                        <FinReqCard key={dep.id} req={dep} color="emerald" onApprove={() => handleProcessAction('deposits/approve', dep.id)} onReject={() => handleProcessAction('deposits/reject', dep.id)} />
                      ))}
                    </div>
                  </div>

                  {/* Withdrawals */}
                  <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Pending Withdrawals</h3>
                      <span className={`text-[10px] font-bold ${pendingWithdrawals.length > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {pendingWithdrawals.length} pending
                      </span>
                    </div>
                    <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
                      {pendingWithdrawals.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs font-semibold">✓ All withdrawals processed</div>
                      ) : pendingWithdrawals.map(wit => (
                        <FinReqCard key={wit.id} req={wit} color="rose" onApprove={() => handleProcessAction('withdrawals/approve', wit.id)} onReject={() => handleProcessAction('withdrawals/reject', wit.id)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: USERS ── */}
            {activeTab === 'users' && (
              <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
                {/* Search & Export */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="relative flex-grow max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search by username or email..."
                      className="w-full pl-9 pr-4 py-2.5 bg-zinc-950 border border-white/5 focus:border-cyan-500/30 rounded-xl outline-none text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={loadAdminData}
                      className="p-2.5 rounded-xl bg-zinc-950 border border-white/5 text-zinc-400 hover:text-cyan-400 transition-colors">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={exportUsersCSV}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/5 text-zinc-400 hover:text-emerald-400 text-xs font-bold transition-colors">
                      <Download size={12} /> CSV
                    </button>
                    <span className="text-[10px] text-zinc-600 self-center font-medium">
                      {filteredUsers.length} / {usersList.length} users
                    </span>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto -mx-5 md:-mx-6">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead>
                      <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5">
                        <th className="py-3 pl-5 md:pl-6">Player</th>
                        <th className="py-3">Invites</th>
                        <th className="py-3">Balance</th>
                        <th className="py-3">Winnings</th>
                        <th className="py-3">Role</th>
                        <th className="py-3">Status</th>
                        <th className="py-3">Wallet</th>
                        <th className="py-3 pr-5 md:pr-6">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                      {filteredUsers.length === 0 ? (
                        <tr><td colSpan={8} className="py-12 text-center text-zinc-600 text-xs">No users found</td></tr>
                      ) : filteredUsers.map(usr => (
                        <tr key={usr.id} className="hover:bg-white/1 transition-colors">
                          <td className="py-3.5 pl-5 md:pl-6">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center text-[9px] font-black text-zinc-300 uppercase">
                                  {usr.username.charAt(0)}
                                </div>
                                <span className="text-xs font-bold text-zinc-200">{usr.username}</span>
                              </div>
                              <span className="text-[10px] text-zinc-500 font-medium block ml-8">{usr.email}</span>
                            </div>
                          </td>
                          <td className="text-zinc-400">{usr.referrals.length}</td>
                          <td className="font-black text-cyan-400">${parseFloat(usr.wallet?.balance || '0').toFixed(2)}</td>
                          <td className="text-fuchsia-400">${parseFloat(usr.wallet?.totalWinnings || '0').toFixed(2)}</td>
                          <td><span className={`text-[10px] font-black uppercase ${usr.role === 'ADMIN' ? 'text-amber-400' : 'text-zinc-500'}`}>{usr.role}</span></td>
                          <td>{usr.isBanned
                            ? <span className="text-red-400 flex items-center gap-1 text-[10px] font-black uppercase"><Lock size={10} /> Banned</span>
                            : <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-black uppercase"><ShieldCheck size={10} /> Active</span>
                          }</td>
                          <td>
                            {adjustingUser === usr.id ? (
                              <div className="flex items-center gap-1.5">
                                <select value={adjustType} onChange={e => setAdjustType(e.target.value as any)}
                                  className="bg-zinc-900 border border-white/5 rounded-lg px-1 py-1 text-[10px] outline-none text-zinc-300">
                                  <option value="add">+</option>
                                  <option value="deduct">−</option>
                                </select>
                                <input type="number" step="1" placeholder="Amt" value={adjustAmount}
                                  onChange={e => setAdjustAmount(e.target.value)}
                                  className="w-14 bg-zinc-950 border border-white/5 rounded-lg px-1.5 py-1 text-[10px] outline-none text-zinc-200" />
                                <button onClick={() => handleAdjustWallet(usr.id)} className="p-1 bg-emerald-950 border border-emerald-500/30 text-emerald-400 rounded-lg"><Check size={10} /></button>
                                <button onClick={() => setAdjustingUser(null)} className="p-1 bg-red-950 border border-red-500/30 text-red-400 rounded-lg"><X size={10} /></button>
                              </div>
                            ) : (
                              <button onClick={() => { setAdjustingUser(usr.id); setAdjustAmount(''); }}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-lg text-[10px] font-black uppercase text-zinc-300 transition-colors">
                                Adjust
                              </button>
                            )}
                          </td>
                          <td className="pr-5 md:pr-6">
                            <button onClick={() => handleToggleBan(usr.id)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                usr.isBanned
                                  ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black'
                                  : 'bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
                              }`}>
                              {usr.isBanned ? 'Unban' : 'Ban'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 4: ANALYTICS ── */}
            {activeTab === 'analytics' && (
              <div className="space-y-6 md:space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <StatCard label="Total Deposits" value={`$${parseFloat(stats.totalDeposits || '0').toFixed(2)}`} color="text-cyan-400" icon={<DollarSign size={16} />} />
                  <StatCard label="Total Withdrawals" value={`$${parseFloat(stats.totalWithdrawals || '0').toFixed(2)}`} color="text-rose-400" icon={<DollarSign size={16} />} />
                  <StatCard label="House Net Revenue" value={`$${stats.houseRevenue.toFixed(2)}`} color="text-emerald-400" icon={<TrendingUp size={16} />}
                    trend={stats.totalDeposits && parseFloat(stats.totalDeposits) > 0
                      ? { up: stats.houseRevenue >= 0, pct: `${((stats.houseRevenue / parseFloat(stats.totalDeposits)) * 100).toFixed(1)}% of deposits` }
                      : undefined} />
                  <StatCard label="Completed Games" value={`${stats.totalGames} Rounds`} color="text-fuchsia-400" icon={<Trophy size={16} />} />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  {/* Liquidity Ratios */}
                  <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-5">
                    <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Liquidity Ratios</h3>
                    <div className="space-y-4">
                      <BarRow label="Deposits" value={parseFloat(stats.totalDeposits || '0')} color="bg-cyan-500" glow="rgba(6,182,212,0.4)" max={Math.max(parseFloat(stats.totalDeposits || '0'), parseFloat(stats.totalWithdrawals || '0'), 1)} />
                      <BarRow label="Withdrawals" value={parseFloat(stats.totalWithdrawals || '0')} color="bg-rose-500" glow="rgba(239,68,68,0.4)" max={Math.max(parseFloat(stats.totalDeposits || '0'), parseFloat(stats.totalWithdrawals || '0'), 1)} />
                    </div>
                  </div>

                  {/* Win Shares */}
                  <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-5">
                    <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">Win Shares</h3>
                    <div className="flex items-center justify-around gap-4">
                      <WinCount label="Humans" wins={stats.humanWins} total={stats.humanWins + stats.botWins || 1} color="text-cyan-400" barColor="bg-cyan-500" />
                      <div className="w-12 h-12 rounded-full border-4 border-dashed border-purple-500/30 flex items-center justify-center text-zinc-500 text-xs font-bold">VS</div>
                      <WinCount label="Bots" wins={stats.botWins} total={stats.humanWins + stats.botWins || 1} color="text-fuchsia-400" barColor="bg-fuchsia-500" />
                    </div>
                    {/* Entry Fees vs Payouts */}
                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Entry Fees vs Payouts</div>
                      <BarRow label="Entry Fees" value={stats.totalEntryFees} color="bg-amber-500" glow="rgba(245,158,11,0.4)" max={Math.max(stats.totalEntryFees, stats.totalWinningsPayouts, 1)} />
                      <BarRow label="Winnings Paid" value={stats.totalWinningsPayouts} color="bg-purple-500" glow="rgba(168,85,247,0.4)" max={Math.max(stats.totalEntryFees, stats.totalWinningsPayouts, 1)} />
                    </div>
                  </div>
                </div>

                {/* Active Games */}
                <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
                  <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">System Status</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatusItem label="Total Users" value={stats.totalUsers.toString()} sub={`${stats.bannedUsers} banned`} />
                    <StatusItem label="Total Games" value={stats.totalGames.toString()} sub="all time" />
                    <StatusItem label="Active Now" value={stats.activeGames.toString()} sub="games in progress" />
                    <StatusItem label="Banned Users" value={stats.bannedUsers.toString()} sub={`${stats.totalUsers > 0 ? ((stats.bannedUsers / stats.totalUsers) * 100).toFixed(1) : 0}% of users`} />
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 5: GAME HISTORY ── */}
            {activeTab === 'games' && (
              <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
                {/* Filter */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <History size={14} className="text-cyan-500" />
                    Recent Games
                  </h3>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-xl border border-white/5">
                    {(['all', 'PLAYING', 'FINISHED'] as const).map(f => (
                      <button key={f} onClick={() => setGameFilter(f)}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                          gameFilter === f ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300'
                        }`}>
                        {f === 'all' ? 'All' : f === 'PLAYING' ? 'Live' : 'Finished'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Game List */}
                <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredGames.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600 text-xs font-semibold">No games found</div>
                  ) : filteredGames.map(game => (
                    <div key={game.id} className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden transition-all hover:border-white/10">
                      <button
                        onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                        className="w-full flex items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                            game.state === 'PLAYING' ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border border-white/10 text-zinc-500'
                          }`}>
                            {game.state === 'PLAYING' ? <Activity size={14} /> : <Trophy size={14} />}
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-zinc-200 block">{game.room.name}</span>
                            <span className="text-[10px] text-zinc-500 block">
                              {game.participants.length} players · ${game.room.entryFee} entry · {new Date(game.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {game.winnerName && (
                            <span className="text-[10px] text-cyan-400 font-bold">🏆 {game.winnerName}</span>
                          )}
                          <Eye size={14} className={`text-zinc-600 transition-transform ${expandedGame === game.id ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {expandedGame === game.id && (
                        <div className="px-4 pb-4 pt-0 border-t border-white/5">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                            <div className="p-3 rounded-xl bg-zinc-950 border border-white/5">
                              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Room</span>
                              <span className="text-xs font-bold text-zinc-200 block mt-0.5">{game.room.name}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-950 border border-white/5">
                              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">State</span>
                              <span className={`text-xs font-bold block mt-0.5 ${game.state === 'PLAYING' ? 'text-emerald-400' : 'text-zinc-400'}`}>{game.state}</span>
                            </div>
                            {game.winnerName && (
                              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Winner</span>
                                <span className="text-xs font-bold text-cyan-400 block mt-0.5">{game.winnerName}</span>
                              </div>
                            )}
                            {game.prizePool !== undefined && (
                              <div className="p-3 rounded-xl bg-zinc-950 border border-white/5">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Prize</span>
                                <span className="text-xs font-bold text-fuchsia-400 block mt-0.5">${(game.prizePool ?? 0).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3">
                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Players</span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {game.participants.map((p, i) => (
                                <span key={i} className="px-2 py-1 bg-zinc-950 border border-white/5 rounded-lg text-[10px] text-zinc-300 font-medium">
                                  {p.user.username}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 6: KENO ANALYTICS ── */}
            {activeTab === 'keno' && (
              <div className="space-y-8">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'Rounds Played', val: `${kenoStats?.stats.totalRounds ?? 0}`, color: 'text-cyan-400' },
                    { label: 'Tickets Sold', val: `${kenoStats?.stats.totalTickets ?? 0}`, color: 'text-fuchsia-400' },
                    { label: 'Total Wagers', val: `$${(kenoStats?.stats.totalWagers ?? 0).toFixed(2)}`, color: 'text-zinc-200' },
                    { label: 'Total Payouts', val: `$${(kenoStats?.stats.totalPayouts ?? 0).toFixed(2)}`, color: 'text-amber-400' },
                    { label: 'House Take', val: `$${(kenoStats?.stats.totalHouseTake ?? 0).toFixed(2)}`, color: 'text-emerald-400' },
                  ].map((stat, idx) => (
                    <div key={idx} className="glass-panel p-5 rounded-2xl border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">{stat.label}</span>
                      <span className={`text-xl font-black ${stat.color} block mt-1 tracking-wider`}>{stat.val}</span>
                    </div>
                  ))}
                </div>

                {/* Per-Room Table */}
                <div className="glass-panel p-6 rounded-3xl border border-white/5 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black uppercase text-zinc-400 tracking-wider">House Take by Room</h3>
                    <span className="text-[10px] text-zinc-500 font-semibold">Wagers = tickets × entry fee</span>
                  </div>

                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead>
                      <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5">
                        <th className="py-2.5">Room</th>
                        <th>Entry</th>
                        <th>Rounds</th>
                        <th>Tickets</th>
                        <th>Wagers</th>
                        <th>Payouts</th>
                        <th>House Take</th>
                        <th>Payout Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                      {kenoStats && kenoStats.stats.totalRounds === 0 && (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-zinc-600 text-xs font-semibold">
                            No Keno rounds played yet.
                          </td>
                        </tr>
                      )}
                      {kenoStats?.rooms.map((room) => (
                        <tr key={room.roomId} className="hover:bg-white/1">
                          <td className="py-3 font-bold text-zinc-200">{room.roomName}</td>
                          <td className="text-cyan-400">${room.entryFee.toFixed(2)}</td>
                          <td>{room.roundsPlayed}</td>
                          <td>{room.ticketsSold}</td>
                          <td className="text-zinc-200">${room.totalWagers.toFixed(2)}</td>
                          <td className="text-amber-400">${room.totalPayouts.toFixed(2)}</td>
                          <td className={`font-black ${room.houseTake >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ${room.houseTake.toFixed(2)}
                          </td>
                          <td className="text-zinc-400">{room.payoutRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Helper Components ──

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">{label}</label>
      <input type="number" step="0.1" required value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-zinc-950 border border-white/5 focus:border-cyan-500/30 rounded-2xl text-sm outline-none text-zinc-200 transition-colors" />
    </div>
  );
}

function FinReqCard({ req, color, onApprove, onReject }: {
  req: FinancialRequest; color: string; onApprove: () => void; onReject: () => void;
}) {
  return (
    <div className="p-4 bg-zinc-950/60 border border-white/5 rounded-2xl flex items-center justify-between gap-4 hover:border-white/10 transition-all">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-[7px] font-black text-zinc-300 uppercase">
            {req.user.username.charAt(0)}
          </div>
          <span className="text-xs font-black text-zinc-200 truncate">{req.user.username}</span>
        </div>
        <span className={`text-sm font-black block ${color === 'emerald' ? 'text-cyan-400' : 'text-rose-400'}`}>
          ${parseFloat(req.amount).toFixed(2)}
        </span>
        <span className="text-[10px] font-mono text-zinc-500 block truncate max-w-[160px]">
          {req.txHash || req.address || '—'}
        </span>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onApprove} className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black transition-all">
          <Check size={14} />
        </button>
        <button onClick={onReject} className="p-2 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function BarRow({ label, value, color, glow, max }: { label: string; value: number; color: string; glow: string; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-bold text-zinc-300">
        <span>{label}</span>
        <span className="font-mono">${value.toFixed(2)}</span>
      </div>
      <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%`, boxShadow: `0 0 10px ${glow}` }} />
      </div>
    </div>
  );
}

function WinCount({ label, wins, total, color, barColor }: { label: string; wins: number; total: number; color: string; barColor: string }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
  return (
    <div className="text-center space-y-2">
      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">{label}</span>
      <span className={`text-2xl font-black ${color} block tracking-wider`}>{wins}</span>
      <div className="w-24 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-600 font-bold">{pct}%</span>
    </div>
  );
}

function StatusItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4 bg-zinc-950/40 border border-white/5 rounded-2xl">
      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">{label}</span>
      <span className="text-lg font-black text-zinc-100 block mt-0.5">{value}</span>
      <span className="text-[10px] text-zinc-600 font-medium block mt-0.5">{sub}</span>
    </div>
  );
}
