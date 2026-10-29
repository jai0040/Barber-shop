'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, getSession, clearSession, UserSession } from '@/lib/api';
import Navbar from '@/components/customer/Navbar';
import BottomNav from '@/components/customer/BottomNav';
import {
  User,
  Scissors,
  Calendar,
  Clock,
  Sparkles,
  LogOut,
  Edit3,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  ChevronRight,
  Plus,
  Crown,
  Award,
  Percent,
} from 'lucide-react';
import { CustomerLoyaltySummary, CustomerMembership } from '@barbershop/shared';

interface CustomerProfile {
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  preferredWorker: { id: string; displayName: string } | null;
  serviceIds: string[];
}

export default function MyAccountPage() {
  const router = useRouter();
  const slug = 'classic-barber';

  const [session, setSession] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loyalty, setLoyalty] = useState<CustomerLoyaltySummary | null>(null);
  const [membership, setMembership] = useState<CustomerMembership | null>(null);
  const [joinStatus, setJoinStatus] = useState<'linked' | 'pending' | 'not_joined' | 'loading'>('loading');
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.push('/auth/login?returnTo=/my-account');
      return;
    }
    setSession(s);
    loadProfile();
  }, [router]);

  async function loadProfile() {
    try {
      setJoinStatus('loading');
      setError(null);
      const res = await apiRequest<{
        status: 'linked' | 'pending' | 'not_joined';
        profile?: CustomerProfile;
      }>(`/me/shops/${slug}/profile`);

      setJoinStatus(res.status);
      if (res.profile) {
        setProfile(res.profile);
        setNotes(res.profile.notes || '');

        // Fetch customer loyalty and active membership
        const [lRes, mRes] = await Promise.all([
          apiRequest<CustomerLoyaltySummary>(`/me/shops/${slug}/loyalty`).catch(() => null),
          apiRequest<CustomerMembership>(`/me/shops/${slug}/membership`).catch(() => null),
        ]);
        if (lRes) setLoyalty(lRes);
        if (mRes) setMembership(mRes);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load your profile.');
    }
  }

  async function handleJoin() {
    try {
      setError(null);
      const res = await apiRequest<{
        status: 'linked' | 'pending';
        profile?: CustomerProfile;
      }>(`/me/shops/${slug}/join`, { method: 'POST' });

      setJoinStatus(res.status);
      if (res.profile) {
        setProfile(res.profile);
        setNotes(res.profile.notes || '');
      }
      setSuccessMsg('Successfully connected with Classic Barber Shop!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to join shop.');
    }
  }

  async function handleSaveNotes() {
    try {
      setSavingNotes(true);
      setError(null);
      const res = await apiRequest<{
        status: 'linked';
        profile: CustomerProfile;
      }>(`/me/shops/${slug}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
      setProfile(res.profile);
      setIsEditingNotes(false);
      setSuccessMsg('Haircut styling preferences updated.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update preferences.');
    } finally {
      setSavingNotes(false);
    }
  }

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 md:pb-12">
      <Navbar shopSlug={slug} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 md:py-10">
        {/* Profile Card Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-2xl flex items-center justify-center shadow-lg">
                {session.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  {session.name}
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  {session.phone || 'No phone'} {session.email ? `• ${session.email}` : ''}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                  Customer Account
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/${slug}/book`}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-md"
              >
                <Calendar className="w-3.5 h-3.5" /> Book Appointment
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-all text-xs"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Join Shop Status Check */}
        {joinStatus === 'not_joined' && (
          <div className="mb-6 p-6 bg-slate-900 border border-amber-500/30 rounded-3xl text-center">
            <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white mb-1">Connect with Classic Barber Shop</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-4">
              Link your customer account to Classic Barber Shop to save your preferred stylist, haircut notes, and appointment records.
            </p>
            <button
              onClick={handleJoin}
              className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg transition-all"
            >
              Join Shop Directory
            </button>
          </div>
        )}

        {joinStatus === 'pending' && (
          <div className="mb-6 p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-sm flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-bold">Profile Linking Pending Approval</p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                The shop has an existing record with your phone number. A staff member will verify your account during your next visit.
              </p>
            </div>
          </div>
        )}

        {/* Phase 2: Loyalty Rewards & VIP Membership */}
        {joinStatus === 'linked' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Loyalty Rewards Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full pointer-events-none" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 inline-flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" /> Loyalty Rewards
                  </span>
                </div>
                <div className="text-3xl font-black text-white mt-2">
                  {loyalty?.pointsBalance ?? 0} <span className="text-sm font-normal text-slate-400">points</span>
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1">
                  Worth ₹{((loyalty?.monetaryValuePaise ?? 0) / 100).toFixed(2)} in checkout discounts
                </div>
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  Earn points on every haircut, beard styling, and grooming product purchase. Redeem points at the counter!
                </p>
              </div>
            </div>

            {/* VIP Membership Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 inline-flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" /> VIP Membership
                  </span>
                  {membership && (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>

                {membership ? (
                  <div>
                    <h3 className="text-lg font-black text-white">{membership.planName}</h3>
                    <div className="text-xs text-slate-400 mt-0.5">Valid until {membership.endDate}</div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-[10px] bg-slate-800 text-emerald-300 font-bold px-2 py-1 rounded-lg">
                        {membership.discountPercentServices}% Off Services
                      </span>
                      <span className="text-[10px] bg-slate-800 text-emerald-300 font-bold px-2 py-1 rounded-lg">
                        {membership.discountPercentProducts}% Off Products
                      </span>
                      <span className="text-[10px] bg-slate-800 text-amber-300 font-bold px-2 py-1 rounded-lg">
                        {membership.pointsMultiplier}x Points
                      </span>
                    </div>

                    {membership.includedServicesUsage && membership.includedServicesUsage.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Complimentary Quota:
                        </span>
                        {membership.includedServicesUsage.map((u, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-amber-200">
                            <span>{u.serviceName}:</span>
                            <span className="font-bold">{u.remainingCount} remaining (of {u.totalAllowed})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-bold text-white">Join the VIP Grooming Club</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Unlock 20% off all styling, retail product discounts, and complimentary services.
                    </p>
                    <div className="mt-4">
                      <Link
                        href={`/${slug}/memberships`}
                        className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-bold"
                      >
                        Explore Membership Plans <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preferences & Haircut Notes (Rule 11) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-amber-400" />
                Haircut & Styling Preferences
              </h2>
              {!isEditingNotes && (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Skin fade with scissor cut on top, neat beard lineup, natural hair wax finish..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotes(profile?.notes || '');
                      setIsEditingNotes(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed min-h-[90px] flex items-center">
                {profile?.notes ? (
                  profile.notes
                ) : (
                  <span className="text-slate-500 italic">
                    No custom styling preferences specified yet. Add your preferred fade guard length, trimming style, or styling clay choice.
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-amber-400" />
                Preferred Barber
              </h2>

              <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4">
                {profile?.preferredWorker ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center">
                      {profile.preferredWorker.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">
                        {profile.preferredWorker.displayName}
                      </div>
                      <div className="text-xs text-amber-400">Master Barber &bull; Dedicated Stylist</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-2">
                    No preferred barber assigned. You can select your favorite barber during slot booking or ask the front desk.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800/80">
              <Link
                href={`/${slug}/barbers`}
                className="text-xs text-amber-400 hover:underline font-semibold inline-flex items-center gap-1"
              >
                Browse all available barbers <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Booking Callout */}
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Ready for a fresh trim?</h3>
            <p className="text-xs text-slate-400 mt-1">
              Select your services and lock in your priority time slot in seconds.
            </p>
          </div>
          <Link
            href={`/${slug}/book`}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
          >
            <Calendar className="w-4 h-4" /> Book Appointment Now
          </Link>
        </div>
      </main>

      <BottomNav shopSlug={slug} />
    </div>
  );
}
