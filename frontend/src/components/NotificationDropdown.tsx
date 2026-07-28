'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { useNotifications, NotificationItem } from '../context/NotificationContext';

export default function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-cyan-950/20 border border-transparent hover:border-cyan-500/20 transition-all duration-300"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-[9px] font-black text-black shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 glass-panel border border-purple-500/20 rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.1)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-cyan-400" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-300">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[9px] font-black bg-cyan-950/40 text-cyan-400 px-1.5 py-0.5 rounded-full border border-cyan-500/20">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-cyan-400 transition-colors"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">
                <Bell size={24} className="mx-auto mb-3 opacity-30" />
                <p className="text-xs font-semibold">No notifications yet</p>
                <p className="text-[10px] text-zinc-600 mt-1">They&apos;ll appear here as you play.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-5 py-4 transition-all duration-200 hover:bg-white/5 ${
                    !notification.isRead ? 'bg-cyan-950/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-base shrink-0 mt-0.5">
                      {getNotificationIcon(notification.title)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold truncate ${
                            !notification.isRead ? 'text-zinc-100' : 'text-zinc-400'
                          }`}
                        >
                          {notification.title}
                        </span>
                        <span className="text-[9px] text-zinc-600 shrink-0 font-semibold">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 leading-relaxed line-clamp-2 ${
                          !notification.isRead ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-2 shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer with count and View All link */}
          <div className="px-5 py-3 border-t border-white/5 bg-zinc-950/30 flex items-center justify-between">
            <span className="text-[9px] text-zinc-600 font-semibold">
              {notifications.length === 0
                ? 'No notifications'
                : `${notifications.length} total · ${unreadCount} unread`}
            </span>
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View All
              <ExternalLink size={10} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
