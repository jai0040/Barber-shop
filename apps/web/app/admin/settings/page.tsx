'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Settings,
  Store,
  Clock,
  QrCode,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';

const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [hours, setHours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Profile Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [gst, setGst] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const [profRes, hoursRes] = await Promise.all([
        apiRequest<any>('/shops/profile'),
        apiRequest<any[]>('/shops/hours'),
      ]);
      setProfile(profRes);
      setName(profRes.name || '');
      setPhone(profRes.phone || '');
      setEmail(profRes.email || '');
      setAddress(profRes.address || '');
      setCity(profRes.city || '');
      setState(profRes.state || '');
      setGst(profRes.gstNumber || profRes.gst_number || '');

      // Normalize hours
      const hMap = new Map();
      for (const h of hoursRes || []) {
        hMap.set(h.weekday, h);
      }
      const fullHours = WEEKDAYS.map((w) => {
        const found = hMap.get(w.id);
        return {
          weekday: w.id,
          isClosed: found ? !!found.isClosed || !!found.is_closed : false,
          openTime: found ? (found.openTime || found.open_time || '10:00').slice(0, 5) : '10:00',
          closeTime: found ? (found.closeTime || found.close_time || '21:00').slice(0, 5) : '21:00',
        };
      });
      setHours(fullHours);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingProfile(true);
      await apiRequest('/shops/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          gstNumber: gst.trim() || undefined,
        }),
      });
      setMsg('Shop profile details updated successfully.');
      setTimeout(() => setMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveHours(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingHours(true);
      await apiRequest('/shops/hours', {
        method: 'PUT',
        body: JSON.stringify({ hours }),
      });
      setMsg('Business operating hours saved.');
      setTimeout(() => setMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update business hours');
    } finally {
      setSavingHours(false);
    }
  }

  return (
    <AdminLayout title="Shop Settings & Operations">
      {msg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Shop Profile */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Store className="w-5 h-5 text-amber-400" /> Shop Details & Contact Info
            </h3>

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Shop Phone Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Public Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={gst}
                  onChange={(e) => setGst(e.target.value)}
                  placeholder="29AAAAA0000A1Z5"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop #, Street, Area..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Business Hours (Section 6) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" /> Shop Working Hours & Days
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Online slot calculations strictly respect these working hours. Closed days are excluded from appointment booking.
            </p>

            <form onSubmit={handleSaveHours} className="space-y-3">
              {hours.map((h, idx) => {
                const day = WEEKDAYS.find((w) => w.id === h.weekday);
                return (
                  <div
                    key={h.weekday}
                    className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 w-36">
                      <input
                        type="checkbox"
                        checked={!h.isClosed}
                        onChange={(e) => {
                          const updated = [...hours];
                          updated[idx] = { ...h, isClosed: !e.target.checked };
                          setHours(updated);
                        }}
                        className="accent-amber-500"
                      />
                      <span className={`font-bold ${h.isClosed ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {day?.name}
                      </span>
                    </div>

                    {!h.isClosed ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">Open:</span>
                        <input
                          type="time"
                          value={h.openTime}
                          onChange={(e) => {
                            const updated = [...hours];
                            updated[idx] = { ...h, openTime: e.target.value };
                            setHours(updated);
                          }}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs"
                        />
                        <span className="text-slate-400 text-[11px]">Close:</span>
                        <input
                          type="time"
                          value={h.closeTime}
                          onChange={(e) => {
                            const updated = [...hours];
                            updated[idx] = { ...h, closeTime: e.target.value };
                            setHours(updated);
                          }}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-rose-400 font-bold uppercase text-[10px]">
                        Closed
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingHours}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  {savingHours ? 'Saving...' : 'Save Hours'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
