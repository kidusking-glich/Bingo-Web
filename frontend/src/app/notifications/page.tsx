'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function NotificationsPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const fetchNotifications = async (pageNum = 1) => {
    if (!token) return;
    try {
      setFetching(true);
      const params = new URLSearchParams({ page: String(pageNum), limit: '20' });
      const res = await fetch(`${API_URL}/notifications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setFetching(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/notifications/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications(1);
    }
  }, [user]);

  const goToPage = (pageNum: number) => {
    if (pageNum < 1 || pageNum > pagination.totalPages) return;
    fetchNotifications(pageNum);
  };

  const getNotificationIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('welcome') || t.includes('bonus')) return '🎉';
    if (t.includes('referral') || t.includes('commission')) return '👥';
    if (t.includes('deposit')) return '💰';
    if (t.includes('withdrawal')) return '💸';
    if (t.includes('won') || t.includes('bingo') || t.includes('win')) return '🏆';
    if (t.includes('adjusted') || t.includes('wallet')) return '⚙️';
    return '🔔';
  };

  const formatTimeAgo = (dateStr: string) => {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const displayedNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col pb-16">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 mt-8 w-full flex-grow space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/10 pb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-zinc-400 hover:text-cyan-400 transition-all"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <Bell className="text-cyan-400" size={22} />
                Notifications
              </h1>
              <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                {pagination.total} total · {unreadCount} unread
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Tabs */}
            <div className="flex gap-1 bg-zinc-950 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setFilter('all')}
                className={`px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  filter === 'all'
                    ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-500/20'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  filter === 'unread'
                    ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-500/20'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Unread {unreadCount > 0 && `(${unreadCount})`}
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-cyan-400 transition-all"
              >
                <CheckCheck size={12} />
                Read All
              </button>
            )}

            <button
              onClick={() => fetchNotifications(pagination.page)}
              className="p-2 rounded-xl bg-zinc-950 border border-white/5 hover:border-purple-500/20 text-zinc-400 hover:text-purple-400 transition-all"
            >
              <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {fetching && notifications.length === 0 ? (
            <div className="glass-panel p-20 rounded-3xl border border-white/5 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="glass-panel p-16 rounded-3xl border border-white/5 text-center">
              <Bell size={40} className="mx-auto mb-4 text-zinc-700" />
              <h3 className="text-lg font-black text-zinc-400">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </h3>
              <p className="text-sm text-zinc-600 font-medium mt-2 max-w-md mx-auto">
                {filter === 'unread'
                  ? 'You\'ve caught up on everything! Nice work.'
                  : 'Notifications for welcome bonuses, referral earnings, deposit approvals, and game wins will appear here.'}
              </p>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden divide-y divide-white/5">
              {displayedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-6 py-5 flex items-start gap-4 transition-all duration-200 ${
                    !notification.isRead
                      ? 'bg-cyan-950/5 hover:bg-cyan-950/10'
                      : 'hover:bg-white/5'
                  }`}
                >
                  {/* Icon */}
                  <span className="text-xl shrink-0 mt-0.5">
                    {getNotificationIcon(notification.title)}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3
                          className={`text-sm font-bold ${
                            !notification.isRead ? 'text-zinc-100' : 'text-zinc-400'
                          }`}
                        >
                          {notification.title}
                        </h3>
                        <p
                          className={`text-xs leading-relaxed max-w-xl ${
                            !notification.isRead ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {notification.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-zinc-600 font-semibold whitespace-nowrap">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                        {!notification.isRead && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="p-1.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-black transition-all"
                            title="Mark as read"
                          >
                            <CheckCheck size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!notification.isRead && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-2 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && !fetching && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2.5 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-zinc-400 hover:text-cyan-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-2">
              {generatePageNumbers(pagination.page, pagination.totalPages).map(
                (pageNum, idx) =>
                  pageNum === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-zinc-600 text-xs font-bold">
                      ...
                    </span>
                  ) : (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum as number)}
                      className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${
                        pagination.page === pageNum
                          ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-black shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                          : 'bg-zinc-950 border border-white/5 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/20'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
              )}
            </div>

            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2.5 rounded-xl bg-zinc-950 border border-white/5 hover:border-cyan-500/20 text-zinc-400 hover:text-cyan-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Footer summary */}
        {pagination.total > 0 && !fetching && (
          <div className="text-center text-[10px] text-zinc-600 font-semibold">
            Showing page {pagination.page} of {pagination.totalPages} · {pagination.total} notifications total
          </div>
        )}
      </main>
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('...');

  pages.push(total);

  return pages;
}
