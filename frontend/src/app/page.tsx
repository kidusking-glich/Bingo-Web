'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, ShieldCheck, Zap, Coins, Users, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between relative overflow-hidden bg-[#03000a]">
      {/* Decorative neon background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 py-6 border-b border-purple-500/10 max-w-7xl mx-auto w-full flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center font-bold text-black text-2xl shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            B
          </div>
          <span className="text-2xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent tracking-widest text-glow-cyan">
            NEON BINGO
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-zinc-400 hover:text-cyan-400 text-sm font-bold transition-colors">
            Login
          </Link>
          <Link
            href="/register"
            className="px-5 py-2.5 rounded-xl text-sm font-black bg-gradient-to-r from-cyan-500 to-purple-600 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] hover:scale-105 transition-all duration-300"
          >
            Play Now
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow flex items-center justify-center px-6 py-12 relative z-10">
        <div className="max-w-4xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-950/40 border border-purple-500/30 text-xs font-bold text-purple-300 tracking-wider uppercase animate-bounce">
            <Sparkles size={12} className="text-cyan-400" />
            Next-Gen Real-Time Bingo Platform
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight">
            The Ultimate Real-Time{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-fuchsia-500 bg-clip-text text-transparent text-glow-cyan">
              Multiplayer Bingo
            </span>
          </h1>

          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto font-medium">
            Join thousands of active players. Win real jackpots in fast-paced lobbies. Claim welcome bonuses and referral shares with automated admin payouts.
          </p>

          {/* Quick CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black bg-gradient-to-r from-cyan-500 to-purple-600 text-black text-lg shadow-[0_0_25px_rgba(6,182,212,0.5)] hover:shadow-[0_0_40px_rgba(6,182,212,0.7)] hover:scale-105 transition-all duration-300"
            >
              Get Welcome Bonus
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black bg-zinc-900 border border-purple-500/30 text-zinc-100 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-zinc-800 transition-all duration-300"
            >
              Explore Lobbies
            </Link>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto pt-12">
            {[
              { label: 'Active Lobbies', val: '4 Live Rooms', color: 'text-cyan-400' },
              { label: 'RTP Percentage', val: '95% RTP', color: 'text-fuchsia-400' },
              { label: 'Welcome Credit', val: '$10.00 Free', color: 'text-purple-400' },
              { label: 'Referral Share', val: '10% Commission', color: 'text-emerald-400' },
            ].map((stat, idx) => (
              <div key={idx} className="glass-panel p-4 rounded-2xl border border-white/5">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block">
                  {stat.label}
                </span>
                <span className={`text-lg font-black ${stat.color} block mt-1`}>
                  {stat.val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Features Grid */}
      <section className="py-16 border-t border-purple-500/10 bg-purple-950/5 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-12 space-y-2">
            <h2 className="text-3xl font-black tracking-tight">Why Play on Neon Bingo?</h2>
            <p className="text-zinc-400 font-medium">Built with clean architecture, anti-cheat features, and transparent algorithms.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Zap className="text-cyan-400" size={24} />,
                title: 'Real-Time Sync',
                desc: 'WebSockets power our game rooms. Numbers are called every few seconds with auto/manual daub feedback.',
              },
              {
                icon: <Coins className="text-fuchsia-400" size={24} />,
                title: 'Dual Wallet System',
                desc: 'Deduct entry fees and request withdrawals instantly. Full transaction logs with administrative control.',
              },
              {
                icon: <Users className="text-purple-400" size={24} />,
                title: 'Referral Commissions',
                desc: 'Generate a unique code, invite players, and earn a flat reward plus 10% of their game entries forever.',
              },
            ].map((f, idx) => (
              <div key={idx} className="glass-panel p-8 rounded-3xl border border-white/5 space-y-4 hover:border-cyan-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-zinc-100">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-purple-500/10 max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between text-zinc-500 text-xs font-semibold relative z-10 gap-4">
        <span>© 2026 Neon Bingo. All rights reserved.</span>
        <div className="flex items-center gap-6">
          <span className="hover:text-cyan-400 cursor-pointer">Responsible Gaming</span>
          <span className="hover:text-cyan-400 cursor-pointer">Terms of Service</span>
          <span className="hover:text-cyan-400 cursor-pointer">Privacy Policy</span>
        </div>
      </footer>
    </div>
  );
}
