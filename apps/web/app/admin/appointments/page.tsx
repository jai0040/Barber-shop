'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest, formatINR } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Calendar,
  Clock,
  User,
  Users,
  Plus,
  Filter,
  CheckCircle2,
  AlertCircle,
  Scissors,
  X,
  UserCheck,
  ChevronRight,
  Search,
  RefreshCw,
  Download,
} from 'lucide-react';
import { downloadCsv } from '@/lib/csv';

interface AppointmentItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  workerId: string | null;
  workerName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  totalAmountPaise: number;
  notes: string | null;
  isWalkIn: boolean;
  services: Array<{
    id: string;
    serviceId: string;
    serviceName: string;
    unitPricePaise: number;
    durationMinutes: number;
  }>;
}

interface WorkerItem {
  id: string;
  displayName: string;
}

interface ServiceItem {
  id: string;
  name: string;
  pricePaise: number;
  durationMinutes: number;
}

function AdminAppointmentsContent() {
  const searchParams = useSearchParams();
  const initialAction = searchParams.get('action');

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showWalkInModal, setShowWalkInModal] = useState(initialAction === 'walkin');
  const [assignModalApt, setAssignModalApt] = useState<AppointmentItem | null>(null);
  const [addServiceModalApt, setAddServiceModalApt] = useState<AppointmentItem | null>(null);

  // Walk-In Form State
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInWorkerId, setWalkInWorkerId] = useState('');
  const [walkInServiceIds, setWalkInServiceIds] = useState<string[]>([]);
  const [walkInNotes, setWalkInNotes] = useState('');
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);

  // Assign & Add-on state
  const [selectedAssignWorker, setSelectedAssignWorker] = useState('');
  const [selectedAddServiceId, setSelectedAddServiceId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadPrerequisites();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [selectedDate, statusFilter, workerFilter]);

  async function loadPrerequisites() {
    try {
      const [wRes, sRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/workers?limit=100'),
        apiRequest<{ items: any[] }>('/services?limit=100'),
      ]);
      setWorkers(wRes.items.map((w: any) => ({ id: w.id, displayName: w.displayName })));
      setServices(sRes.items.map((s: any) => ({ id: s.id, name: s.name, pricePaise: s.pricePaise, durationMinutes: s.durationMinutes })));
    } catch {
      // Workers/services will load gracefully
    }
  }

  async function loadAppointments() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedDate) params.set('date', selectedDate);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (workerFilter !== 'all') params.set('workerId', workerFilter);
      params.set('limit', '100');

      const res = await apiRequest<{ items: AppointmentItem[] }>(
        `/appointments?${params.toString()}`
      );
      setAppointments(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await loadAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignModalApt || !selectedAssignWorker) return;
    try {
      setActionLoading(true);
      await apiRequest(`/appointments/${assignModalApt.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ workerId: selectedAssignWorker }),
      });
      setAssignModalApt(null);
      setSelectedAssignWorker('');
      await loadAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to assign worker');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddServiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addServiceModalApt || !selectedAddServiceId) return;
    try {
      setActionLoading(true);
      await apiRequest(`/appointments/${addServiceModalApt.id}/services`, {
        method: 'POST',
        body: JSON.stringify({ serviceId: selectedAddServiceId }),
      });
      setAddServiceModalApt(null);
      setSelectedAddServiceId('');
      await loadAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to add service');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateWalkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!walkInName.trim() || !walkInPhone.trim() || walkInServiceIds.length === 0) {
      alert('Please enter customer name, phone, and select at least one service.');
      return;
    }

    try {
      setSubmittingWalkIn(true);
      await apiRequest('/appointments/walk-in', {
        method: 'POST',
        body: JSON.stringify({
          customerName: walkInName.trim(),
          customerPhone: walkInPhone.trim(),
          workerId: walkInWorkerId || undefined,
          serviceIds: walkInServiceIds,
          notes: walkInNotes.trim() || undefined,
        }),
      });

      setShowWalkInModal(false);
      setWalkInName('');
      setWalkInPhone('');
      setWalkInWorkerId('');
      setWalkInServiceIds([]);
      setWalkInNotes('');
      await loadAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to create walk-in appointment');
    } finally {
      setSubmittingWalkIn(false);
    }
  }

  const filteredAppointments = appointments.filter((apt) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      apt.customerName.toLowerCase().includes(q) ||
      apt.customerPhone.includes(q) ||
      (apt.workerName && apt.workerName.toLowerCase().includes(q))
    );
  });

  function handleExportCsv() {
    const rows = filteredAppointments.map((apt) => [
      apt.id,
      apt.date,
      apt.startTime,
      apt.endTime,
      apt.customerName,
      apt.customerPhone,
      apt.workerName || 'Unassigned',
      apt.isWalkIn ? 'Walk-In' : 'Online',
      apt.status,
      apt.services.map((s) => s.serviceName).join('; '),
      (apt.totalAmountPaise / 100).toFixed(2),
      apt.notes || '',
    ]);

    downloadCsv(
      `appointments-${selectedDate || 'all'}.csv`,
      [
        'Appointment ID',
        'Date',
        'Start Time',
        'End Time',
        'Customer Name',
        'Customer Phone',
        'Barber Name',
        'Type',
        'Status',
        'Services',
        'Total Amount (₹)',
        'Notes',
      ],
      rows
    );
  }

  return (
    <AdminLayout
      title="Appointment Management"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Export CSV
          </button>
          <button
            onClick={loadAppointments}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowWalkInModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> New Walk-In
          </button>
        </div>
      }
    >
      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="booked">Booked</option>
              <option value="checked_in">Checked In</option>
              <option value="in_service">In Service</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Worker Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">Barber:</span>
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Barbers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer, phone..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Appointment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading appointments...
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No appointments match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Time</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Services</th>
                  <th className="px-5 py-3.5">Barber</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Time */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="font-bold text-slate-100">
                        {apt.startTime} - {apt.endTime}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {apt.isWalkIn ? 'Walk-In' : 'Online Booked'}
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {apt.customerName}
                      </div>
                      <div className="text-[11px] text-slate-400">{apt.customerPhone}</div>
                      {apt.notes && (
                        <div className="text-[10px] text-amber-300/80 italic mt-0.5 max-w-xs truncate">
                          Note: {apt.notes}
                        </div>
                      )}
                    </td>

                    {/* Services */}
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        {apt.services.map((s) => (
                          <div key={s.id} className="text-xs text-slate-200">
                            &bull; {s.serviceName}{' '}
                            <span className="text-slate-500 text-[10px]">
                              ({s.durationMinutes}m)
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* + Add Service Button */}
                      {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            setAddServiceModalApt(apt);
                            setSelectedAddServiceId('');
                          }}
                          className="mt-1 text-[11px] text-amber-400 hover:underline font-semibold inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Service
                        </button>
                      )}
                    </td>

                    {/* Barber */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {apt.workerName ? (
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                          {apt.workerName}
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setAssignModalApt(apt);
                            setSelectedAssignWorker('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30"
                        >
                          + Assign Barber
                        </button>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-5 py-4 whitespace-nowrap font-bold text-amber-400">
                      {formatINR(apt.totalAmountPaise)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                          apt.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : apt.status === 'in_service'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : apt.status === 'checked_in'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : apt.status === 'cancelled'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                        }`}
                      >
                        {apt.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap text-right space-x-1.5">
                      {apt.status === 'booked' && (
                        <button
                          onClick={() => handleStatusChange(apt.id, 'checked_in')}
                          className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-semibold"
                        >
                          Check In
                        </button>
                      )}
                      {apt.status === 'checked_in' && (
                        <button
                          onClick={() => handleStatusChange(apt.id, 'in_service')}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold"
                        >
                          Start
                        </button>
                      )}
                      {apt.status === 'in_service' && (
                        <button
                          onClick={() => handleStatusChange(apt.id, 'completed')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold"
                        >
                          Complete
                        </button>
                      )}
                      {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            if (confirm('Cancel this appointment?')) {
                              handleStatusChange(apt.id, 'cancelled');
                            }
                          }}
                          className="px-2 py-1 rounded-lg text-slate-500 hover:text-rose-400 text-xs"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Walk-In Drawer / Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                New Walk-In Appointment
              </h3>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWalkIn} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. Ramesh Verma"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="e.g. +91 98765 00000"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Select Barber (Optional)
                </label>
                <select
                  value={walkInWorkerId}
                  onChange={(e) => setWalkInWorkerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Any Available Barber (Auto-Assign)</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Services Offered *
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-950/60 rounded-xl border border-slate-800">
                  {services.map((s) => {
                    const isChecked = walkInServiceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-amber-500/20 border-amber-500/50 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="truncate pr-1">{s.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setWalkInServiceIds(walkInServiceIds.filter((id) => id !== s.id));
                            } else {
                              setWalkInServiceIds([...walkInServiceIds, s.id]);
                            }
                          }}
                          className="accent-amber-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Styling Notes / Preferences
                </label>
                <input
                  type="text"
                  value={walkInNotes}
                  onChange={(e) => setWalkInNotes(e.target.value)}
                  placeholder="e.g. Scissor cut, zero beard lineup..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWalkIn}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingWalkIn ? 'Creating...' : 'Create Walk-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Assign Worker Modal */}
      {assignModalApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                Assign Barber
              </h3>
              <button
                onClick={() => setAssignModalApt(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-400">
                Assign a qualified barber for{' '}
                <strong className="text-white">{assignModalApt.customerName}</strong> ({assignModalApt.startTime} - {assignModalApt.endTime}).
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Select Barber
                </label>
                <select
                  value={selectedAssignWorker}
                  onChange={(e) => setSelectedAssignWorker(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Choose a barber...</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalApt(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedAssignWorker}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add-On Service Modal (Rule 17, 49, 74) */}
      {addServiceModalApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-400" />
                + Add Service to Ongoing Appointment
              </h3>
              <button
                onClick={() => setAddServiceModalApt(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddServiceSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                <p>
                  Customer: <strong>{addServiceModalApt.customerName}</strong>
                </p>
                <p>
                  Current total:{' '}
                  <strong className="text-amber-400">
                    {formatINR(addServiceModalApt.totalAmountPaise)}
                  </strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Choose Additional Service
                </label>
                <select
                  value={selectedAddServiceId}
                  onChange={(e) => setSelectedAddServiceId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select a service to add...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (+{formatINR(s.pricePaise)}, +{s.durationMinutes} mins)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddServiceModalApt(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedAddServiceId}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {actionLoading ? 'Adding...' : 'Add Service & Update Total'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default function AdminAppointmentsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Appointment Management">
          <div className="p-12 text-center text-slate-500 text-xs">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading appointments...
          </div>
        </AdminLayout>
      }
    >
      <AdminAppointmentsContent />
    </Suspense>
  );
}
