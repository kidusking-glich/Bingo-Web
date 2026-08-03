'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Wallet, Users, LayoutDashboard, Trophy, LogOut, ShieldAlert, PlayCircle } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="glass-panel border-b border-purple-500/20 px-6 py-4 sticky top-0 z-50 shadow-lg shadow-purple-950/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center font-bold text-black text-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] group-hover:scale-105 transition-transform duration-300">
            B
          </div>
          <span className="text-2xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent tracking-widest text-glow-cyan">
            NEON BINGO
          </span>
        </Link>

        {/* Navigation links */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
              isActive('/dashboard')
                ? 'text-cyan-400 bg-cyan-950/30 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>

          <Link
            href="/lobby"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
              isActive('/lobby')
                ? 'text-cyan-400 bg-cyan-950/30 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <PlayCircle size={16} />
            Lobby
          </Link>

          <Link
            href="/wallet"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
              isActive('/wallet')
                ? 'text-fuchsia-400 bg-fuchsia-950/30 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.1)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Wallet size={16} />
            Wallet
          </Link>

          <Link
            href="/referral"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
              isActive('/referral')
                ? 'text-purple-400 bg-purple-950/30 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Users size={16} />
            Referrals
          </Link>

          {user.role === 'ADMIN' && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
                isActive('/admin')
                  ? 'text-amber-400 bg-amber-950/30 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                  : 'text-amber-500 hover:text-amber-400 hover:bg-amber-950/20 border border-amber-500/10'
              }`}
            >
              <ShieldAlert size={16} />
              Admin Panel
            </Link>
          )}
        </div>

        {/* Action Panel */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Logged In As</span>
            <span className="text-xs font-bold text-zinc-300">{user.username}</span>
          </div>

          {/* Balance Widget */}
          <div className="bg-gradient-to-r from-cyan-950/40 to-fuchsia-950/40 px-4 py-2 rounded-2xl border border-purple-500/20 flex items-center gap-2 shadow-[inset_0_0_10px_rgba(168,85,247,0.05)]">
            <Trophy size={16} className="text-amber-400 animate-pulse" />
            <span className="text-sm font-black text-cyan-400 tracking-wider">
              ${parseFloat(user.wallet?.balance || '0.00').toFixed(2)}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-500/20 transition-all duration-300"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
}
