'use client';

import React, { useEffect, useState, useRef } from 'react';
import { apiRequest } from '@/lib/api';
import {
  Bell,
  CheckCheck,
  Calendar,
  AlertTriangle,
  Star,
  CreditCard,
  X,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { NotificationItem, NotificationCountSummary } from '@barbershop/shared';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function loadUnreadCount() {
    try {
      const res = await apiRequest<NotificationCountSummary>('/notifications/unread-count');
      setUnreadCount(res.unreadCount);
    } catch {
      // silent fail if unauthenticated
    }
  }

  async function loadNotifications() {
    try {
      setLoading(true);
      const res = await apiRequest<{ items: NotificationItem[] }>('/notifications?limit=8');
      setNotifications(res.items || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAsRead(id: string) {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'read' as const, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  }

  async function handleMarkAllRead() {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read' as const, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'appointment_booked':
      case 'appointment_confirmed':
        return <Calendar className="w-4 h-4 text-amber-400" />;
      case 'low_stock':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'payment_received':
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      case 'review_received':
        return <Star className="w-4 h-4 text-amber-400 fill-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all focus:outline-none"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading alerts...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">No notifications right now.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.status === 'unread';
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 transition-colors flex items-start gap-3 ${
                      isUnread ? 'bg-slate-800/40 hover:bg-slate-800/60' : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-800 border border-slate-700/60 shrink-0">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${isUnread ? 'font-bold text-white' : 'font-semibold text-slate-300'}`}>
                          {n.title}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unread" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                        {n.message}
                      </p>

                      {/* WhatsApp Share Link */}
                      {n.whatsappUrl && (
                        <div className="mt-2">
                          <a
                            href={n.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition-all shadow-sm"
                          >
                            <MessageCircle className="w-3 h-3 fill-current" />
                            Share on WhatsApp
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(n.id)}
                            className="text-amber-400 hover:underline font-semibold"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
