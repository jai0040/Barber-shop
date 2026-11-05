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
  Star,
  X,
  MessageSquare,
} from 'lucide-react';
import { CustomerLoyaltySummary, CustomerMembership } from '@barbershop/shared';

interface CustomerAppointment {
  id: string;
  appointmentNumber: number;
  status: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  totalAmountPaise: number;
  worker: { id: string; name: string } | null;
  services: { id: string; name: string; pricePaise: number }[];
  review: { id: string; rating: number; comment?: string } | null;
}

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
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState<boolean>(false);
  const [reviewModalAppt, setReviewModalAppt] = useState<CustomerAppointment | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [barberRating, setBarberRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [cancelModalAppt, setCancelModalAppt] = useState<CustomerAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancellingAppt, setCancellingAppt] = useState<boolean>(false);
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

  async function loadAppointments() {
    try {
      setLoadingAppts(true);
      const appts = await apiRequest<CustomerAppointment[]>(`/me/shops/${slug}/appointments`);
      setAppointments(appts || []);
    } catch {
      // appointments fail silently if user not yet linked
    } finally {
      setLoadingAppts(false);
    }
  }

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

        // Fetch customer loyalty, active membership, and appointment history
        const [lRes, mRes, aRes] = await Promise.all([
          apiRequest<CustomerLoyaltySummary>(`/me/shops/${slug}/loyalty`).catch(() => null),
          apiRequest<CustomerMembership>(`/me/shops/${slug}/membership`).catch(() => null),
          apiRequest<CustomerAppointment[]>(`/me/shops/${slug}/appointments`).catch(() => []),
        ]);
        if (lRes) setLoyalty(lRes);
        if (mRes) setMembership(mRes);
        if (aRes) setAppointments(aRes);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load your profile.');
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewModalAppt) return;
    try {
      setSubmittingReview(true);
      setError(null);
      await apiRequest('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          appointmentId: reviewModalAppt.id,
          workerId: reviewModalAppt.worker?.id || undefined,
          rating,
          barberRating,
          comment: reviewComment.trim() || undefined,
        }),
      });
      setSuccessMsg('Thank you! Your verified review has been published.');
      setReviewModalAppt(null);
      setReviewComment('');
      await loadAppointments();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
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

  async function handleCancelAppointment() {
    if (!cancelModalAppt) return;
    try {
      setCancellingAppt(true);
      setError(null);
      await apiRequest(`/me/shops/${slug}/appointments/${cancelModalAppt.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setSuccessMsg(`Appointment #${cancelModalAppt.appointmentNumber} has been cancelled.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setCancelModalAppt(null);
      setCancelReason('');
      await loadAppointments();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel appointment. Please contact the shop directly.');
      setCancelModalAppt(null);
    } finally {
      setCancellingAppt(false);
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

        {/* Appointment History & Reviews */}
        {joinStatus === 'linked' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl mb-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  Appointment History & Reviews
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  View your recent salon visits and leave verified ratings for your barbers.
                </p>
              </div>
              <Link
                href={`/${slug}/reviews`}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1"
              >
                Public Reviews <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loadingAppts ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading visit history...</div>
            ) : appointments.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center">
                <Scissors className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No appointments recorded yet.</p>
                <Link
                  href={`/${slug}/book`}
                  className="mt-3 inline-block px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Book Your First Cut
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.map((appt) => {
                  const isCompleted = appt.status === 'completed';
                  const isCancellable = appt.status === 'booked' || appt.status === 'confirmed';
                  return (
                    <div
                      key={appt.id}
                      className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-700"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-400 font-bold">
                            #{appt.appointmentNumber}
                          </span>
                          <span className="text-xs text-slate-200 font-semibold">{appt.date}</span>
                          {appt.startTime && (
                            <span className="text-xs text-slate-400">
                              &bull; {appt.startTime} {appt.endTime ? `- ${appt.endTime}` : ''}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isCompleted
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : appt.status === 'cancelled'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {appt.status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="text-xs text-white font-medium">
                          {appt.services.map((s) => s.name).join(', ') || 'Barber Service'}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-3">
                          {appt.worker && (
                            <span>
                              Stylist: <span className="text-slate-300 font-medium">{appt.worker.name}</span>
                            </span>
                          )}
                          <span>Total: ₹{(appt.totalAmountPaise / 100).toFixed(0)}</span>
                        </div>

                        {appt.review && (
                          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-2">
                            <div className="flex items-center text-amber-400">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3.5 h-3.5 ${
                                    s <= appt.review!.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {appt.review.comment ? `"${appt.review.comment}"` : 'Reviewed'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {isCancellable && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelModalAppt(appt);
                              setCancelReason('');
                            }}
                            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                            title="Cancel this appointment"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}
                        {isCompleted && !appt.review && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewModalAppt(appt);
                              setRating(5);
                              setBarberRating(5);
                              setReviewComment('');
                            }}
                            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                          >
                            <Star className="w-3.5 h-3.5 fill-current" /> Rate & Review
                          </button>
                        )}
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `Classic Barber Shop Appointment #${appt.appointmentNumber} on ${appt.date} at ${appt.startTime || ''} for ${appt.services.map((s) => s.name).join(', ')} (Total: Rs ${appt.totalAmountPaise / 100}).`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                          title="Share or Save Details on WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline text-[11px]">WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

      {/* Rate & Review Modal */}
      {reviewModalAppt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setReviewModalAppt(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              Rate Your Experience
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Appointment #{reviewModalAppt.appointmentNumber} &bull; {reviewModalAppt.date}
              {reviewModalAppt.worker ? ` with ${reviewModalAppt.worker.name}` : ''}
            </p>

            <form onSubmit={handleReviewSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Overall Experience Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setRating(s)}
                      className="p-1 focus:outline-none transition hover:scale-110"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs text-amber-400 font-bold ml-2">
                    {rating === 5
                      ? 'Excellent (5★)'
                      : rating === 4
                      ? 'Great (4★)'
                      : rating === 3
                      ? 'Average (3★)'
                      : rating === 2
                      ? 'Poor (2★)'
                      : 'Disappointing (1★)'}
                  </span>
                </div>
              </div>

              {reviewModalAppt.worker && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Barber Styling Skill & Hospitality ({reviewModalAppt.worker.name})
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setBarberRating(s)}
                        className="p-1 focus:outline-none transition hover:scale-110"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            s <= barberRating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs text-slate-400 font-medium ml-2">
                      {barberRating} of 5 stars
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Feedback & Comments (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Tell us what you loved about your haircut or experience..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalAppt(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg disabled:opacity-50 transition"
                >
                  {submittingReview ? 'Submitting...' : 'Publish Verified Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Appointment Confirmation Modal */}
      {cancelModalAppt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setCancelModalAppt(null)}
              disabled={cancellingAppt}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/50 hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              Cancel Appointment #{cancelModalAppt.appointmentNumber}?
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Are you sure you want to cancel your visit scheduled for{' '}
              <span className="text-slate-200 font-semibold">{cancelModalAppt.date}</span> at{' '}
              <span className="text-slate-200 font-semibold">{cancelModalAppt.startTime || 'scheduled time'}</span>?
              Your booked slot will be released back to the barber's calendar.
            </p>

            <div className="mb-4">
              <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                Reason for Cancellation (Optional)
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule conflict, feeling unwell, rescheduled directly..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalAppt(null)}
                disabled={cancellingAppt}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={handleCancelAppointment}
                disabled={cancellingAppt}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition disabled:opacity-50"
              >
                {cancellingAppt ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav shopSlug={slug} />
    </div>
  );
}
