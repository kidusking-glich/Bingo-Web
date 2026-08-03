'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, ShieldAlert, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03000a] flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] rounded-full bg-purple-900/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] rounded-full bg-cyan-900/10 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.05)] relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 items-center justify-center font-black text-black text-2xl shadow-[0_0_15px_rgba(6,182,212,0.4)] mb-2">
            B
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Welcome Back!</h2>
          <p className="text-zinc-400 text-sm font-medium">Log in to enter the neon gaming halls.</p>
        </div>

        {/* Error Callout */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-start gap-3 text-red-300 text-xs font-semibold">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-zinc-500 tracking-wider">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3.5 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-zinc-500 tracking-wider">Password</label>
              <span className="text-[10px] font-bold text-cyan-400 hover:underline cursor-pointer">Forgot?</span>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-cyan-500 to-purple-600 text-black text-sm tracking-wider uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin" />
            ) : (
              <>
                <Sparkles size={14} />
                Access Dashboard
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center text-xs font-semibold text-zinc-500">
          New player?{' '}
          <Link href="/register" className="text-fuchsia-400 hover:underline">
            Register an account
          </Link>
        </div>
      </div>
    </div>
  );
}
