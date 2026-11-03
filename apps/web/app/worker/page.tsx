'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, getSession, clearSession, formatINR, UserSession } from '@/lib/api';
import {
  Scissors,
  Calendar,
  Clock,
  CheckCircle2,
  DollarSign,
  User,
  Plus,
  LogOut,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  X,
  Phone,
  FileText,
} from 'lucide-react';

interface WorkerDashboardData {
  worker: {
    id: string;
    displayName: string;
    phone: string;
  };
  metrics: {
    todayAppointmentsCount: number;
    completedCount: number;
    inServiceCount: number;
    personalRevenuePaise: number;
  };
  todayQueue: Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    startTime: string;
    endTime: string;
    status: string;
    totalAmountPaise: number;
    notes: string | null;
    services: Array<{ serviceName: string; unitPricePaise: number; durationMinutes: number }>;
  }>;
}

export default function WorkerMobilePage() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [data, setData] = useState<WorkerDashboardData | null>(null);
  const [commission, setCommission] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<any | null>(null);
  const [baseSalaryPaise, setBaseSalaryPaise] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Salary advance modal
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmountRupees, setAdvanceAmountRupees] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // Add-on service modal
  const [addServiceApt, setAddServiceApt] = useState<any | null>(null);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [submittingAddon, setSubmittingAddon] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.push('/auth/login?returnTo=/worker');
      return;
    }
    setSession(s);
    loadWorkerDashboard();
    loadServices();
  }, [router]);

  async function loadWorkerDashboard() {
    try {
      setLoading(true);
      setError(null);
      const [res, commRes, attRes] = await Promise.all([
        apiRequest<WorkerDashboardData>('/reports/dashboard/worker'),
        apiRequest<any[]>('/commission/summary').catch(() => []),
        apiRequest<any>('/attendance/today').catch(() => null),
      ]);
      setData(res);
      setCommission(commRes && commRes.length > 0 ? commRes[0] : null);
      if (attRes) {
        setAttendance(attRes.attendance);
        setBaseSalaryPaise(attRes.worker?.baseSalaryPaise || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load worker queue.');
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn() {
    try {
      setClocking(true);
      await apiRequest('/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify({ notes: 'Clocked in from barber station' }),
      });
      await loadWorkerDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to clock in');
    } finally {
      setClocking(false);
    }
  }

  async function handleClockOut() {
    try {
      setClocking(true);
      await apiRequest('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify({ notes: 'Clocked out from barber station' }),
      });
      await loadWorkerDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to clock out');
    } finally {
      setClocking(false);
    }
  }

  async function handleRequestAdvance(e: React.FormEvent) {
    e.preventDefault();
    const rupees = parseFloat(advanceAmountRupees);
    if (isNaN(rupees) || rupees <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!advanceReason.trim()) {
      alert('Please enter a reason for advance');
      return;
    }

    try {
      setSubmittingAdvance(true);
      await apiRequest('/attendance/advances/request', {
        method: 'POST',
        body: JSON.stringify({
          amountPaise: Math.round(rupees * 100),
          reason: advanceReason.trim(),
        }),
      });
      alert('Salary advance request submitted successfully!');
      setShowAdvanceModal(false);
      setAdvanceAmountRupees('');
      setAdvanceReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to request advance');
    } finally {
      setSubmittingAdvance(false);
    }
  }

  async function loadServices() {
    try {
      const res = await apiRequest<{ items: any[] }>('/services?limit=100');
      setAvailableServices(res.items || []);
    } catch {}
  }

  async function updateStatus(appointmentId: string, nextStatus: string) {
    try {
      setUpdatingId(appointmentId);
      await apiRequest(`/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadWorkerDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!addServiceApt || !selectedServiceId) return;

    try {
      setSubmittingAddon(true);
      await apiRequest(`/appointments/${addServiceApt.id}/services`, {
        method: 'POST',
        body: JSON.stringify({ serviceId: selectedServiceId }),
      });

      setAddServiceApt(null);
      setSelectedServiceId('');
      await loadWorkerDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to add service');
    } finally {
      setSubmittingAddon(false);
    }
  }

  function handleLogout() {
    clearSession();
    router.push('/auth/login');
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16">
      {/* Mobile Top Header */}
      <header className="px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-black text-white leading-tight">
              {data?.worker?.displayName || session.name}
            </div>
            <div className="text-[10px] text-amber-400 font-semibold tracking-wider uppercase">
              Stylist Station &bull; Classic Barber
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.isOwner && (
            <Link
              href="/admin/dashboard"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60"
              title="Switch to Admin Console"
            >
              <LayoutDashboard className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={loadWorkerDashboard}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-5">
        {/* Phase 5: Today's Shift & Attendance Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" /> Today's Shift & Attendance
            </span>
            {baseSalaryPaise > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                Base: {formatINR(baseSalaryPaise)}/mo
              </span>
            )}
          </div>

          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div>
              <div className="text-xs font-bold text-white">
                {attendance?.checkInAt
                  ? `Clocked In at ${new Date(attendance.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Not Clocked In Today'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {attendance?.checkOutAt
                  ? `Clocked out at ${new Date(attendance.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : attendance?.status === 'present'
                  ? 'Shift currently active'
                  : 'Tap below when your shift begins'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!attendance?.checkInAt ? (
                <button
                  onClick={handleClockIn}
                  disabled={clocking}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {clocking ? 'Clocking in...' : 'Clock In'}
                </button>
              ) : !attendance?.checkOutAt ? (
                <button
                  onClick={handleClockOut}
                  disabled={clocking}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {clocking ? 'Clocking out...' : 'Clock Out'}
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={() => setShowAdvanceModal(true)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Request Salary Advance
            </button>
          </div>
        </div>

        {/* Today's Personal Metrics */}
        {data && (
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-center shadow-lg">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                Assigned
              </span>
              <p className="text-xl font-black text-white mt-0.5">
                {data.metrics.todayAppointmentsCount}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-center shadow-lg">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                Finished
              </span>
              <p className="text-xl font-black text-emerald-400 mt-0.5">
                {data.metrics.completedCount}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-center shadow-lg">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                My Revenue
              </span>
              <p className="text-base font-black text-amber-400 mt-1 truncate">
                {formatINR(data.metrics.personalRevenuePaise)}
              </p>
            </div>
          </div>
        )}

        {/* Phase 3: My Commission & Tips Balance Card */}
        {commission && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" /> My Earnings & Commission
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {commission.commissionRatePercent}% Service / {commission.productCommissionRatePercent}% Product
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">Commissions</span>
                <span className="font-bold text-white mt-0.5 block">
                  {formatINR(commission.totalServiceCommissionPaise + commission.totalProductCommissionPaise)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">Tips Earned</span>
                <span className="font-bold text-amber-400 mt-0.5 block">
                  {formatINR(commission.totalTipsPaise)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-emerald-500/30">
                <span className="text-[10px] text-slate-400 block">Payout Pending</span>
                <span className="font-bold text-emerald-400 mt-0.5 block">
                  {formatINR(commission.balancePendingPaise)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Section Title */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Today's Service Queue
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {data?.todayQueue.length || 0} Clients
          </span>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Live Queue Cards */}
        {loading && !data ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-slate-900 border border-slate-800 rounded-3xl" />
            ))}
          </div>
        ) : data?.todayQueue.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-500 text-xs">
            <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-2" />
            No appointments assigned to your chair for today.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.todayQueue.map((apt) => {
              const isBusy = updatingId === apt.id;
              const isInChair = apt.status === 'in_service';

              return (
                <div
                  key={apt.id}
                  className={`bg-slate-900 rounded-3xl p-5 border transition-all shadow-xl ${
                    isInChair
                      ? 'border-amber-500 ring-1 ring-amber-500/30 bg-amber-500/5'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Card Header: Time & Status */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-sm text-white">
                        {apt.startTime} - {apt.endTime}
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                        apt.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : apt.status === 'in_service'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : apt.status === 'checked_in'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {apt.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Customer Info */}
                  <div className="mb-3">
                    <div className="font-bold text-base text-white flex items-center justify-between">
                      <span>{apt.customerName}</span>
                      <span className="text-amber-400 font-bold text-sm">
                        {formatINR(apt.totalAmountPaise)}
                      </span>
                    </div>
                    <a
                      href={`tel:${apt.customerPhone}`}
                      className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 hover:text-white"
                    >
                      <Phone className="w-3 h-3 text-amber-400" />
                      {apt.customerPhone}
                    </a>

                    {apt.notes && (
                      <div className="mt-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-amber-200">
                        <span className="font-bold text-amber-400">Styling Preference: </span>
                        {apt.notes}
                      </div>
                    )}
                  </div>

                  {/* Services List */}
                  <div className="mb-4 space-y-1">
                    <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                      Services:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {apt.services.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                        >
                          {s.serviceName} ({s.durationMinutes}m)
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Actions: Status Transitions & Add-On */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                    {apt.status === 'booked' && (
                      <button
                        disabled={isBusy}
                        onClick={() => updateStatus(apt.id, 'checked_in')}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                      >
                        <User className="w-4 h-4" /> Client Arrived (Check In)
                      </button>
                    )}

                    {apt.status === 'checked_in' && (
                      <button
                        disabled={isBusy}
                        onClick={() => updateStatus(apt.id, 'in_service')}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg"
                      >
                        <Scissors className="w-4 h-4" /> Start Service
                      </button>
                    )}

                    {apt.status === 'in_service' && (
                      <>
                        <button
                          disabled={isBusy}
                          onClick={() => setAddServiceApt(apt)}
                          className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center gap-1 border border-slate-700"
                        >
                          <Plus className="w-4 h-4" /> Add Service
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => updateStatus(apt.id, 'completed')}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Finish Service
                        </button>
                      </>
                    )}

                    {apt.status === 'completed' && (
                      <div className="w-full text-center py-1 text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Service Completed
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL: Worker Add-On Service (Rule 17, 49) */}
      {addServiceApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-amber-400" />
                Add Extra Service
              </h3>
              <button
                onClick={() => setAddServiceApt(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddService} className="mt-4 space-y-3">
              <p className="text-xs text-slate-300">
                Adding service for client <strong className="text-white">{addServiceApt.customerName}</strong>.
              </p>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Select Service
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select add-on service...</option>
                  {availableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (+{formatINR(s.pricePaise)}, +{s.durationMinutes}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddServiceApt(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAddon || !selectedServiceId}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingAddon ? 'Adding...' : 'Confirm Add-On'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Request Salary Advance Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" /> Request Salary Advance
              </h3>
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestAdvance} className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Amount in Rupees (₹)
                </label>
                <input
                  type="number"
                  min="100"
                  step="50"
                  placeholder="e.g. 2000"
                  value={advanceAmountRupees}
                  onChange={(e) => setAdvanceAmountRupees(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Reason / Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Festival family expense, medical needs..."
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdvance || !advanceAmountRupees || !advanceReason}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-bold text-xs"
                >
                  {submittingAdvance ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
