'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { apiRequest, formatINR } from '@/lib/api';
import {
  UserCheck,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  CreditCard,
  FileText,
  TrendingDown,
  Users,
} from 'lucide-react';
import {
  AttendanceStatus,
  WorkerAttendanceItem,
  WorkerSalaryAdvanceItem,
  WorkerSalarySettlementItem,
} from '@barbershop/shared';

export default function AdminAttendancePage() {
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'advances' | 'payroll'>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workers
  const [workers, setWorkers] = useState<any[]>([]);

  // Today's attendance
  const [todayDate, setTodayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [todayRecords, setTodayRecords] = useState<WorkerAttendanceItem[]>([]);

  // History
  const [historyRecords, setHistoryRecords] = useState<WorkerAttendanceItem[]>([]);
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Advances
  const [advances, setAdvances] = useState<WorkerSalaryAdvanceItem[]>([]);
  const [advanceFilterStatus, setAdvanceFilterStatus] = useState<string>('all');

  // Payroll
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [settlements, setSettlements] = useState<WorkerSalarySettlementItem[]>([]);
  const [previewingWorkerId, setPreviewingWorkerId] = useState<string>('');
  const [payrollPreview, setPayrollPreview] = useState<any | null>(null);
  const [previewBonusRupees, setPreviewBonusRupees] = useState('');
  const [generating, setGenerating] = useState(false);

  // Manual record attendance modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recWorkerId, setRecWorkerId] = useState('');
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));
  const [recStatus, setRecStatus] = useState<AttendanceStatus>('present');
  const [recNotes, setRecNotes] = useState('');
  const [submittingRec, setSubmittingRec] = useState(false);

  // Pay settlement modal
  const [payingSettlement, setPayingSettlement] = useState<WorkerSalarySettlementItem | null>(null);
  const [payMethod, setPayMethod] = useState<'bank_transfer' | 'cash' | 'upi'>('bank_transfer');
  const [recordExpense, setRecordExpense] = useState(true);
  const [submittingPay, setSubmittingPay] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      setError(null);
      const [wRes, attTodayRes, advRes, setRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/workers?limit=100'),
        apiRequest<WorkerAttendanceItem[]>(`/attendance/records?startDate=${todayDate}&endDate=${todayDate}`),
        apiRequest<WorkerSalaryAdvanceItem[]>('/attendance/advances'),
        apiRequest<WorkerSalarySettlementItem[]>(`/attendance/payroll/settlements?periodYear=${selectedYear}&periodMonth=${selectedMonth}`),
      ]);

      setWorkers(wRes.items || []);
      setTodayRecords(attTodayRes || []);
      setAdvances(advRes || []);
      setSettlements(setRes || []);
      if (wRes.items?.length > 0 && !recWorkerId) {
        setRecWorkerId(wRes.items[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterWorkerId) params.append('workerId', filterWorkerId);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);
      if (filterStatus) params.append('status', filterStatus);

      const res = await apiRequest<WorkerAttendanceItem[]>(`/attendance/records?${params.toString()}`);
      setHistoryRecords(res || []);
    } catch (err: any) {
      alert(err.message || 'Failed to load attendance history');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickStatusChange(workerId: string, status: AttendanceStatus) {
    try {
      await apiRequest('/attendance/record', {
        method: 'POST',
        body: JSON.stringify({
          workerId,
          attendanceDate: todayDate,
          status,
          notes: `Marked ${status} by admin`,
        }),
      });
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to update attendance');
    }
  }

  async function handleSaveManualRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!recWorkerId || !recDate) return;

    try {
      setSubmittingRec(true);
      await apiRequest('/attendance/record', {
        method: 'POST',
        body: JSON.stringify({
          workerId: recWorkerId,
          attendanceDate: recDate,
          status: recStatus,
          notes: recNotes.trim() || null,
        }),
      });
      setShowRecordModal(false);
      setRecNotes('');
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to save attendance record');
    } finally {
      setSubmittingRec(false);
    }
  }

  async function handleReviewAdvance(id: string, status: 'approved' | 'rejected') {
    try {
      await apiRequest(`/attendance/advances/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      const advRes = await apiRequest<WorkerSalaryAdvanceItem[]>('/attendance/advances');
      setAdvances(advRes || []);
    } catch (err: any) {
      alert(err.message || 'Failed to review advance request');
    }
  }

  async function handlePreviewPayroll(workerId: string) {
    try {
      setPreviewingWorkerId(workerId);
      const res = await apiRequest<any>(
        `/attendance/payroll/preview?workerId=${workerId}&periodMonth=${selectedMonth}&periodYear=${selectedYear}`
      );
      setPayrollPreview(res);
      setPreviewBonusRupees('');
    } catch (err: any) {
      alert(err.message || 'Failed to preview payroll');
    }
  }

  async function handleGeneratePayroll() {
    if (!payrollPreview) return;
    try {
      setGenerating(true);
      const bonusPaise = Math.round((parseFloat(previewBonusRupees) || 0) * 100);
      await apiRequest('/attendance/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({
          workerId: payrollPreview.workerId,
          periodMonth: selectedMonth,
          periodYear: selectedYear,
          bonusesPaise: bonusPaise,
        }),
      });
      setPayrollPreview(null);
      const setRes = await apiRequest<WorkerSalarySettlementItem[]>(
        `/attendance/payroll/settlements?periodYear=${selectedYear}&periodMonth=${selectedMonth}`
      );
      setSettlements(setRes || []);
    } catch (err: any) {
      alert(err.message || 'Failed to generate payroll settlement');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePaySettlement(e: React.FormEvent) {
    e.preventDefault();
    if (!payingSettlement) return;

    try {
      setSubmittingPay(true);
      await apiRequest(`/attendance/payroll/${payingSettlement.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: payMethod,
          recordExpense,
        }),
      });
      setPayingSettlement(null);
      const setRes = await apiRequest<WorkerSalarySettlementItem[]>(
        `/attendance/payroll/settlements?periodYear=${selectedYear}&periodMonth=${selectedMonth}`
      );
      setSettlements(setRes || []);
    } catch (err: any) {
      alert(err.message || 'Failed to disburse salary payment');
    } finally {
      setSubmittingPay(false);
    }
  }

  // Quick stats
  const presentCount = todayRecords.filter((r) => r.status === 'present').length;
  const leaveHalfCount = todayRecords.filter((r) => r.status === 'half_day' || r.status === 'on_leave').length;
  const pendingAdvancesCount = advances.filter((a) => a.status === 'pending').length;

  return (
    <AdminLayout
      title="Staff Attendance & Payroll"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecordModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" /> Record Attendance
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Total Staff</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mt-1">{workers.length}</p>
            <span className="text-[10px] text-slate-400">Registered Stylists</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Present Today</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400 mt-1">{presentCount}</p>
            <span className="text-[10px] text-slate-400">Active Shift Barbers</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Half Day / Leave</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-400 mt-1">{leaveHalfCount}</p>
            <span className="text-[10px] text-slate-400">Partial or Off-Duty</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Pending Advances</span>
              <DollarSign className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-black text-blue-400 mt-1">{pendingAdvancesCount}</p>
            <span className="text-[10px] text-slate-400">Needs Manager Review</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'today'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" /> Today's Board
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" /> Attendance Logs
          </button>

          <button
            onClick={() => setActiveTab('advances')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 relative ${
              activeTab === 'advances'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" /> Salary Advances
            {pendingAdvancesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'payroll'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" /> Monthly Payroll Sheet
          </button>
        </div>

        {/* TAB 1: Today's Attendance Board */}
        {activeTab === 'today' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-400" /> Today's Live Attendance
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Date: <span className="text-slate-200 font-mono">{todayDate}</span>
                </p>
              </div>
              <button
                onClick={loadInitialData}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Staff Member</th>
                    <th className="px-5 py-3.5">Base Salary</th>
                    <th className="px-5 py-3.5">Check In</th>
                    <th className="px-5 py-3.5">Check Out</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Quick Mark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {workers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        No workers configured yet.
                      </td>
                    </tr>
                  ) : (
                    workers.map((w) => {
                      const rec = todayRecords.find((r) => r.workerId === w.id);
                      return (
                        <tr key={w.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-4 font-bold text-white">
                            <div>{w.displayName}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {w.phone || 'No phone'}
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-slate-300">
                            {formatINR(w.baseSalaryPaise || 0)}/mo
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {rec?.checkInAt ? (
                              <span className="font-mono text-emerald-400">
                                {new Date(rec.checkInAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {rec?.checkOutAt ? (
                              <span className="font-mono text-slate-400">
                                {new Date(rec.checkOutAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {!rec ? (
                              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-semibold text-[10px]">
                                Not Marked
                              </span>
                            ) : rec.status === 'present' ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                                Present
                              </span>
                            ) : rec.status === 'half_day' ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[10px]">
                                Half Day
                              </span>
                            ) : rec.status === 'on_leave' ? (
                              <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[10px]">
                                On Leave
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]">
                                Absent
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleQuickStatusChange(w.id, 'present')}
                                className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold"
                                title="Mark Present"
                              >
                                P
                              </button>
                              <button
                                onClick={() => handleQuickStatusChange(w.id, 'half_day')}
                                className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold"
                                title="Mark Half Day"
                              >
                                HD
                              </button>
                              <button
                                onClick={() => handleQuickStatusChange(w.id, 'on_leave')}
                                className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[10px] font-bold"
                                title="Mark On Leave"
                              >
                                L
                              </button>
                              <button
                                onClick={() => handleQuickStatusChange(w.id, 'absent')}
                                className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold"
                                title="Mark Absent"
                              >
                                A
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Attendance History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Staff Member
                  </label>
                  <select
                    value={filterWorkerId}
                    onChange={(e) => setFilterWorkerId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  >
                    <option value="">All Workers</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  >
                    <option value="">All Statuses</option>
                    <option value="present">Present</option>
                    <option value="half_day">Half Day</option>
                    <option value="on_leave">On Leave</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={loadHistory}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                >
                  <Filter className="w-3.5 h-3.5" /> Apply Filter
                </button>
              </div>
            </div>

            {/* History Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Staff Member</th>
                      <th className="px-5 py-3.5">Check In</th>
                      <th className="px-5 py-3.5">Check Out</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historyRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          No attendance records matching filter.
                        </td>
                      </tr>
                    ) : (
                      historyRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40">
                          <td className="px-5 py-3.5 font-mono text-slate-200">
                            {r.attendanceDate}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-white">
                            {r.workerName || 'Worker'}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-emerald-400">
                            {r.checkInAt
                              ? new Date(r.checkInAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-slate-400">
                            {r.checkOutAt
                              ? new Date(r.checkOutAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'present'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : r.status === 'half_day'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : r.status === 'on_leave'
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {r.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-[11px] max-w-xs truncate">
                            {r.notes || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Salary Advances */}
        {activeTab === 'advances' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {['all', 'pending', 'approved', 'deducted', 'rejected'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setAdvanceFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                      advanceFilterStatus === st
                        ? 'bg-slate-800 text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Staff Member</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Reason</th>
                      <th className="px-5 py-3.5">Requested Date</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {advances
                      .filter((a) => advanceFilterStatus === 'all' || a.status === advanceFilterStatus)
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          No salary advance requests found.
                        </td>
                      </tr>
                    ) : (
                      advances
                        .filter((a) => advanceFilterStatus === 'all' || a.status === advanceFilterStatus)
                        .map((a) => (
                          <tr key={a.id} className="hover:bg-slate-800/40">
                            <td className="px-5 py-4 font-bold text-white">
                              {a.workerName || 'Worker'}
                            </td>
                            <td className="px-5 py-4 font-mono font-bold text-amber-400">
                              {formatINR(a.amountPaise)}
                            </td>
                            <td className="px-5 py-4 text-slate-300 max-w-xs">{a.reason}</td>
                            <td className="px-5 py-4 text-slate-400 font-mono text-[11px]">
                              {new Date(a.requestedAt).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  a.status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : a.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : a.status === 'deducted'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {a.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {a.status === 'pending' && (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleReviewAdvance(a.id, 'approved')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 font-bold text-xs flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleReviewAdvance(a.id, 'rejected')}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 font-bold text-xs flex items-center gap-1"
                                  >
                                    <X className="w-3.5 h-3.5" /> Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Monthly Payroll & Settlements */}
        {activeTab === 'payroll' && (
          <div className="space-y-6">
            {/* Month & Year Selection Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Month
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold"
                  >
                    {[
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December',
                    ].map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold"
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={previewingWorkerId}
                  onChange={(e) => handlePreviewPayroll(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="">Calculate for Stylist...</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.displayName} (Base: {formatINR(w.baseSalaryPaise || 0)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Payroll Calculation Preview Card */}
            {payrollPreview && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" /> Payroll Calculation Preview: {payrollPreview.workerName}
                  </h4>
                  <button
                    onClick={() => setPayrollPreview(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Base Salary
                    </span>
                    <span className="text-base font-bold text-white mt-1 block">
                      {formatINR(payrollPreview.baseSalaryPaise)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Days Present: {payrollPreview.attendanceDaysPresent} (HD: {payrollPreview.attendanceDaysHalf})
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Pro-Rated Base
                    </span>
                    <span className="text-base font-bold text-emerald-400 mt-1 block">
                      {formatINR(payrollPreview.proRatedBasePaise)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Based on days attended
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Commissions & Tips
                    </span>
                    <span className="text-base font-bold text-amber-400 mt-1 block">
                      +{formatINR(payrollPreview.commissionEarnedPaise + payrollPreview.tipEarnedPaise)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Comm: {formatINR(payrollPreview.commissionEarnedPaise)} | Tips: {formatINR(payrollPreview.tipEarnedPaise)}
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-rose-500/30">
                    <span className="text-[10px] uppercase font-semibold text-rose-400 block">
                      Advances Deducted
                    </span>
                    <span className="text-base font-bold text-rose-400 mt-1 block">
                      -{formatINR(payrollPreview.advancesDeductedPaise)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Auto-settled in payroll
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 font-semibold">
                      Add Performance Bonus (₹):
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1000"
                      value={previewBonusRupees}
                      onChange={(e) => setPreviewBonusRupees(e.target.value)}
                      className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Net Payable Amount
                      </span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {formatINR(
                          Math.max(
                            0,
                            payrollPreview.proRatedBasePaise +
                              payrollPreview.commissionEarnedPaise +
                              payrollPreview.tipEarnedPaise -
                              payrollPreview.advancesDeductedPaise +
                              Math.round((parseFloat(previewBonusRupees) || 0) * 100)
                          )
                        )}
                      </span>
                    </div>

                    <button
                      onClick={handleGeneratePayroll}
                      disabled={generating}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-slate-950 font-bold text-xs shadow-lg active:scale-95"
                    >
                      {generating ? 'Saving...' : 'Generate Settlement Sheet'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Settlements Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-5 py-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" /> Settled Payroll Sheets for {selectedMonth}/{selectedYear}
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Stylist</th>
                      <th className="px-5 py-3.5">Base (Pro-Rated)</th>
                      <th className="px-5 py-3.5">Commission</th>
                      <th className="px-5 py-3.5">Tips</th>
                      <th className="px-5 py-3.5">Advances</th>
                      <th className="px-5 py-3.5">Bonuses</th>
                      <th className="px-5 py-3.5">Net Payable</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {settlements.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                          No payroll settlements generated for this period yet. Choose a stylist above to calculate.
                        </td>
                      </tr>
                    ) : (
                      settlements.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/40">
                          <td className="px-5 py-4 font-bold text-white">
                            {s.workerName || 'Worker'}
                          </td>
                          <td className="px-5 py-4 font-mono text-slate-300">
                            {formatINR(s.proRatedBasePaise)}
                          </td>
                          <td className="px-5 py-4 font-mono text-amber-400">
                            +{formatINR(s.commissionEarnedPaise)}
                          </td>
                          <td className="px-5 py-4 font-mono text-amber-300">
                            +{formatINR(s.tipEarnedPaise)}
                          </td>
                          <td className="px-5 py-4 font-mono text-rose-400">
                            -{formatINR(s.advancesDeductedPaise)}
                          </td>
                          <td className="px-5 py-4 font-mono text-emerald-400">
                            +{formatINR(s.bonusesPaise)}
                          </td>
                          <td className="px-5 py-4 font-mono font-bold text-white text-sm">
                            {formatINR(s.netPayablePaise)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                s.payoutStatus === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {s.payoutStatus.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {s.payoutStatus !== 'paid' ? (
                              <button
                                onClick={() => setPayingSettlement(s)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md active:scale-95"
                              >
                                Disburse & Pay
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-mono">
                                Paid on {new Date(s.paidAt || s.createdAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Record Attendance Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400" /> Record / Override Attendance
              </h3>
              <button
                onClick={() => setShowRecordModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualRecord} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Stylist / Worker
                </label>
                <select
                  value={recWorkerId}
                  onChange={(e) => setRecWorkerId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Status
                </label>
                <select
                  value={recStatus}
                  onChange={(e) => setRecStatus(e.target.value as AttendanceStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                >
                  <option value="present">Present (Full Day)</option>
                  <option value="half_day">Half Day (0.5 Day)</option>
                  <option value="on_leave">On Leave</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or reason..."
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRec}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingRec ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Settlement Modal */}
      {payingSettlement && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" /> Disburse Salary Payment
              </h3>
              <button
                onClick={() => setPayingSettlement(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Stylist:</span>
                <span className="font-bold text-white">{payingSettlement.workerName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Period:</span>
                <span className="font-mono text-slate-200">
                  {payingSettlement.periodMonth}/{payingSettlement.periodYear}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400">Net Payable:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {formatINR(payingSettlement.netPayablePaise)}
                </span>
              </div>
            </div>

            <form onSubmit={handlePaySettlement} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                >
                  <option value="bank_transfer">Direct Bank Transfer (NEFT/IMPS)</option>
                  <option value="upi">UPI / Instant Transfer</option>
                  <option value="cash">Cash in Hand</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <input
                  type="checkbox"
                  checked={recordExpense}
                  onChange={(e) => setRecordExpense(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                />
                <span className="text-slate-300">
                  Automatically log this payment in Shop Expenses under{' '}
                  <strong className="text-amber-400 font-semibold">Salaries & Commissions</strong>
                </span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingSettlement(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPay}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-bold text-xs"
                >
                  {submittingPay ? 'Disbursing...' : 'Confirm & Mark Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
