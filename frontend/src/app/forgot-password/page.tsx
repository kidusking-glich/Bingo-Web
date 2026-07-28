'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ShieldAlert, ArrowLeft, Sparkles, Check, Copy } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setResetToken(null);

    try {
      setIsSubmitting(true);
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      setSuccess(data.message);
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
    } catch (err: any) {
      setError(err.message || 'Server error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToken = () => {
    if (!resetToken) return;
    navigator.clipboard.writeText(resetToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#03000a] flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] rounded-full bg-purple-900/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] rounded-full bg-cyan-900/10 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.05)] relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/login" className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-cyan-400 mb-4 transition-colors">
            <ArrowLeft size={12} />
            Back to Login
          </Link>
          <h2 className="text-2xl font-black tracking-tight text-white">Reset Password</h2>
          <p className="text-zinc-400 text-sm font-medium">
            Enter your email and we&apos;ll generate a reset token.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-start gap-3 text-red-300 text-xs font-semibold">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success with token */}
        {success && (
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold space-y-3">
            <p className="flex items-center gap-2">
              <Check size={14} />
              {success}
            </p>

            {resetToken && (
              <div className="bg-zinc-950/60 border border-white/5 p-3 rounded-xl space-y-2">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">
                  Your Reset Token (demo only)
                </span>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-[12px] font-mono text-cyan-400 break-all">{resetToken}</code>
                  <button
                    onClick={copyToken}
                    className="p-1.5 rounded-lg bg-purple-950/40 border border-purple-500/20 hover:border-cyan-500/30 text-purple-400 hover:text-cyan-400 transition-colors shrink-0"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <Link
                  href={`/reset-password?token=${resetToken}`}
                  className="mt-2 block w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black font-black text-[10px] uppercase tracking-wider text-center shadow-[0_0_10px_rgba(6,182,212,0.2)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all"
                >
                  Continue to Reset Password
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Form (hidden after success) */}
        {!success && (
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
                  Send Reset Token
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="text-center text-xs font-semibold text-zinc-500">
          Remember your password?{' '}
          <Link href="/login" className="text-fuchsia-400 hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
