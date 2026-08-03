'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { User, Mail, Lock, ShieldAlert, Check, ArrowLeft, Eye, EyeOff, Save } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, token, loading, refreshProfile } = useAuth();
  const router = useRouter();

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Populate form with current values
  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email);
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (newPassword && newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const body: Record<string, string> = {};

    if (username !== user?.username) body.username = username;
    if (email !== user?.email) body.email = email;
    if (newPassword) {
      if (!currentPassword) {
        setError('Current password is required to set a new password');
        return;
      }
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }

    if (Object.keys(body).length === 0) {
      setError('No changes to save');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
        return;
      }

      // Update stored token (may have new email/username in JWT)
      localStorage.setItem('bingo_token', data.token);
      await refreshProfile();

      setSuccess('Profile updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-dismiss success message
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Server error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const hasChanges =
    username !== user.username ||
    email !== user.email ||
    newPassword.length > 0;

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col pb-16">
      <Navbar />

      <main className="max-w-2xl mx-auto px-6 mt-8 w-full flex-grow space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-purple-500/10 pb-6">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-zinc-400 hover:text-cyan-400 transition-all"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
              <User className="text-cyan-400" size={22} />
              Profile Settings
            </h1>
            <p className="text-zinc-500 text-xs font-semibold mt-0.5">
              Manage your account details and security
            </p>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-start gap-3 text-red-300 text-xs font-semibold">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3 text-emerald-300 text-xs font-semibold">
            <Check size={16} className="shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Account Information Section */}
          <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <User size={16} className="text-cyan-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                Account Information
              </h2>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                Username
              </label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
                />
              </div>
              <p className="text-[10px] text-zinc-600 font-medium mt-1">
                This is how other players see you in rooms.
              </p>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                Email Address
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
                />
              </div>
              <p className="text-[10px] text-zinc-600 font-medium mt-1">
                Changing your email will require re-verification.
              </p>
            </div>

            {/* Account meta */}
            <div className="flex items-center justify-between pt-2 text-[10px] text-zinc-600 font-semibold border-t border-white/5">
              <span>Joined: {new Date(user.createdAt || Date.now()).toLocaleDateString()}</span>
              <span className={user.isVerified ? 'text-emerald-500' : 'text-amber-500'}>
                {user.isVerified ? '✓ Verified' : 'Unverified'}
              </span>
            </div>
          </div>

          {/* Change Password Section */}
          <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <Lock size={16} className="text-fuchsia-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                Change Password
              </h2>
            </div>

            <p className="text-[11px] text-zinc-500 font-medium">
              Leave these fields blank if you don&apos;t want to change your password.
            </p>

            {/* Current Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                Current Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full pl-11 pr-10 py-3.5 bg-zinc-950 border border-white/5 focus:border-fuchsia-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                New Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full pl-11 pr-10 py-3.5 bg-zinc-950 border border-white/5 focus:border-fuchsia-500/50 rounded-2xl text-sm outline-none text-zinc-200 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className={`w-full pl-11 pr-10 py-3.5 bg-zinc-950 border rounded-2xl text-sm outline-none transition-colors ${
                    newPassword && confirmPassword && newPassword !== confirmPassword
                      ? 'border-red-500/50 text-red-300'
                      : 'border-white/5 focus:border-fuchsia-500/50 text-zinc-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[10px] text-red-400 font-medium mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Password strength hint */}
            {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-[10px] text-amber-400 font-medium">
                Password must be at least 6 characters long
              </p>
            )}
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4 pt-2">
            <Link
              href="/dashboard"
              className="px-6 py-3.5 rounded-2xl bg-zinc-950 border border-white/5 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 font-bold text-xs uppercase tracking-wider transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !hasChanges}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
