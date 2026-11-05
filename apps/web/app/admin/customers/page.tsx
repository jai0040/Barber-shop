'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  UserCheck,
  Scissors,
  Calendar,
  X,
  RefreshCw,
  FileText,
  Download,
  History,
  Clock,
  DollarSign,
  Award,
} from 'lucide-react';

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  internalNotes: string | null;
  preferredWorkerId: string | null;
  preferredWorkerName: string | null;
  hasAccount: boolean;
  linkPending: boolean;
  createdAt: string;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerHistory(selectedCustomer.id);
    } else {
      setCustomerHistory([]);
    }
  }, [selectedCustomer]);

  async function loadCustomerHistory(customerId: string) {
    try {
      setLoadingHistory(true);
      const res = await apiRequest<{ items: any[] }>(`/appointments?customerId=${customerId}&limit=20`);
      setCustomerHistory(res.items || []);
    } catch {
      setCustomerHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  // New Customer Form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, [searchQuery]);

  async function loadCustomers() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('limit', '50');

      const res = await apiRequest<{ items: CustomerItem[] }>(
        `/customers?${params.toString()}`
      );
      setCustomers(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    try {
      setSubmitting(true);
      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          notes: newNotes.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      await loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  function handleExportCsv() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      'Customer Name',
      'Phone',
      'Email',
      'Preferred Barber',
      'Account Linked',
      'Registration Date',
      'Customer Notes',
      'Internal Notes',
    ];
    const rows = customers.map((c) => [
      c.name,
      c.phone,
      c.email || '-',
      c.preferredWorkerName || '-',
      c.hasAccount ? 'Yes' : 'No',
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-',
      c.notes || '-',
      c.internalNotes || '-',
    ]);
    downloadCsv(`customers_directory_${dateStr}`, headers, rows);
  }

  return (
    <AdminLayout
      title="Customer Directory & Profiles"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={customers.length === 0}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Export Customers as CSV"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Export CSV
          </button>
          <button
            onClick={loadCustomers}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="text-xs text-slate-400">
          Total: <span className="text-white font-bold">{customers.length}</span> clients
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading customer profiles...
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Users className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No customers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Preferred Barber</th>
                  <th className="px-5 py-3.5">Styling Preferences</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-bold text-white flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      {c.name}
                    </td>

                    <td className="px-5 py-4 text-slate-300 font-mono">
                      {c.phone}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {c.preferredWorkerName ? (
                        <span className="font-semibold text-amber-400 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {c.preferredWorkerName}
                        </span>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-slate-400 max-w-xs truncate">
                      {c.notes || '—'}
                    </td>

                    <td className="px-5 py-4">
                      {c.hasAccount ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          App Registered
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700/60">
                          Walk-In Profile
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Add Customer */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" /> New Customer Profile
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. +91 98765 00000"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. client@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Haircut & Styling Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Prefers skin fade on sides, length 2 on top..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submitting ? 'Creating...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Customer Profile & Complete Service History (Sections 11 & 20) */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" /> Customer Profile & History
              </h3>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Profile Header Card */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-black text-white">{selectedCustomer.name}</p>
                    {selectedCustomer.hasAccount ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        App Account
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700/60">
                        Walk-In
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-slate-400 mt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-amber-400" /> {selectedCustomer.phone}
                    </span>
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-amber-400" /> {selectedCustomer.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Summary Badges */}
                <div className="flex items-center gap-3">
                  <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Visits</span>
                    <span className="text-sm font-black text-white">{customerHistory.length}</span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Spend</span>
                    <span className="text-sm font-black text-emerald-400">
                      {formatINR(
                        customerHistory.reduce(
                          (sum, a) => sum + (a.status === 'completed' ? a.totalAmountPaise : 0),
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preferences & Notes Grid (Section 21) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="block uppercase font-bold text-[10px] text-slate-400 mb-1">
                    Preferred Barber:
                  </span>
                  <p className="text-amber-300 font-bold flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    {selectedCustomer.preferredWorkerName || 'No specific barber preference'}
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="block uppercase font-bold text-[10px] text-slate-400 mb-1">
                    Styling Notes & Hair Preferences:
                  </span>
                  <p className="text-slate-300 italic">
                    {selectedCustomer.notes || 'No customer styling notes added.'}
                  </p>
                </div>
              </div>

              {/* Service & Visit History (Section 20) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-amber-400" /> Visit & Service History (Rule 20)
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {customerHistory.length} records
                  </span>
                </div>

                {loadingHistory ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading visit history...
                  </div>
                ) : customerHistory.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                    <Calendar className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                    No previous appointments or service visits recorded for this client.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {customerHistory.map((apt: any) => {
                      const serviceText = Array.isArray(apt.services)
                        ? apt.services.map((s: any) => s.serviceName).join(' + ')
                        : typeof apt.services === 'string'
                        ? apt.services
                        : 'Service';

                      return (
                        <div
                          key={apt.id}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-slate-200 font-bold">{apt.date}</span>
                              <span className="text-[10px] text-slate-500">
                                ({apt.startTime} - {apt.endTime})
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                  apt.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : apt.status === 'in_service'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : apt.status === 'cancelled'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}
                              >
                                {apt.status.replace('_', ' ')}
                              </span>
                            </div>

                            <p className="text-white font-medium text-xs">
                              {serviceText}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Barber: <strong className="text-slate-300">{apt.workerName || 'Unassigned'}</strong>
                              {apt.notes && ` • Note: ${apt.notes}`}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-amber-300 block">
                              {formatINR(apt.totalAmountPaise)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {apt.isWalkIn ? 'Walk-in' : 'Online'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
