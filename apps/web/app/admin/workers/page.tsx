'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Briefcase,
  Plus,
  Scissors,
  CheckCircle2,
  X,
  RefreshCw,
  Phone,
  Mail,
  UserCheck,
  Edit2,
  Archive,
  RotateCcw,
  Download,
  Search,
} from 'lucide-react';

interface WorkerItem {
  id: string;
  displayName: string;
  phone: string;
  email?: string | null;
  commissionRatePercent: number;
  productCommissionRatePercent: number;
  baseSalaryPaise: number;
  status: string;
  archived: boolean;
  serviceIds: string[];
}

interface ServiceItem {
  id: string;
  name: string;
}

export default function AdminWorkersPage() {
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [mappingWorker, setMappingWorker] = useState<WorkerItem | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);

  // Edit Worker Modal
  const [editingWorker, setEditingWorker] = useState<WorkerItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editServiceComm, setEditServiceComm] = useState('40');
  const [editProductComm, setEditProductComm] = useState('10');
  const [editBaseSalaryRupees, setEditBaseSalaryRupees] = useState('25000');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Worker Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceComm, setServiceComm] = useState('40');
  const [productComm, setProductComm] = useState('10');
  const [baseSalaryRupees, setBaseSalaryRupees] = useState('25000');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [wRes, sRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/workers?limit=100&includeArchived=true'),
        apiRequest<{ items: any[] }>('/services?limit=100'),
      ]);
      setWorkers(
        (wRes.items || []).map((w: any) => ({
          id: w.id,
          displayName: w.displayName ?? w.display_name,
          phone: w.phone,
          email: w.email,
          commissionRatePercent: Number(w.commissionRatePercent ?? w.commission_rate_percent ?? 0),
          productCommissionRatePercent: Number(w.productCommissionRatePercent ?? w.product_commission_rate_percent ?? 0),
          baseSalaryPaise: Number(w.baseSalaryPaise ?? w.base_salary_paise ?? 0),
          status: w.status,
          archived: !!w.archived,
          serviceIds: w.serviceIds || [],
        }))
      );
      setServices(sRes.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load workers.');
    } finally {
      setLoading(false);
    }
  }

  // Filtered Workers
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      // Status filter
      if (statusFilter === 'active' && w.archived) return false;
      if (statusFilter === 'archived' && !w.archived) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = w.displayName.toLowerCase().includes(q);
        const matchesPhone = w.phone?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone) return false;
      }

      return true;
    });
  }, [workers, statusFilter, search]);

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    try {
      setSubmitting(true);
      await apiRequest('/workers', {
        method: 'POST',
        body: JSON.stringify({
          displayName: name.trim(),
          phone: phone.trim(),
          commissionRatePercent: parseFloat(serviceComm) || 0,
          productCommissionRatePercent: parseFloat(productComm) || 0,
          baseSalaryPaise: Math.round((parseFloat(baseSalaryRupees) || 0) * 100),
        }),
      });

      setShowAddModal(false);
      setName('');
      setPhone('');
      setServiceComm('40');
      setProductComm('10');
      setBaseSalaryRupees('25000');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add worker');
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(w: WorkerItem) {
    setEditingWorker(w);
    setEditName(w.displayName);
    setEditServiceComm(String(w.commissionRatePercent));
    setEditProductComm(String(w.productCommissionRatePercent));
    setEditBaseSalaryRupees(String(Math.round(w.baseSalaryPaise / 100)));
    setEditStatus((w.status as any) === 'inactive' ? 'inactive' : 'active');
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWorker || !editName.trim()) return;

    try {
      setSavingEdit(true);
      await apiRequest(`/workers/${editingWorker.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: editName.trim(),
          commissionRatePercent: parseFloat(editServiceComm) || 0,
          productCommissionRatePercent: parseFloat(editProductComm) || 0,
          baseSalaryPaise: Math.round((parseFloat(editBaseSalaryRupees) || 0) * 100),
          status: editStatus,
        }),
      });

      setEditingWorker(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update worker details');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchiveWorker(id: string, name: string) {
    if (!confirm(`Are you sure you want to deactivate and archive ${name}? They will no longer appear on the schedule or booking queue.`)) return;

    try {
      await apiRequest(`/workers/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive worker');
    }
  }

  async function handleRestoreWorker(id: string) {
    try {
      await apiRequest(`/workers/${id}/restore`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to restore worker');
    }
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!mappingWorker) return;

    try {
      setSavingMapping(true);
      await apiRequest(`/workers/${mappingWorker.id}/services`, {
        method: 'PUT',
        body: JSON.stringify({ ids: selectedServiceIds }),
      });

      setMappingWorker(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update service mapping');
    } finally {
      setSavingMapping(false);
    }
  }

  function handleExportCsv() {
    downloadCsv(
      `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Barber Name', 'Mobile Phone', 'Service Comm (%)', 'Product Comm (%)', 'Base Salary (INR)', 'Status', 'Archived', 'Assigned Skills Count'],
      filteredWorkers.map((w) => [
        w.displayName,
        w.phone,
        w.commissionRatePercent,
        w.productCommissionRatePercent,
        (w.baseSalaryPaise / 100).toFixed(2),
        w.status,
        w.archived ? 'Yes' : 'No',
        w.serviceIds.length,
      ])
    );
  }

  return (
    <AdminLayout
      title="Staff & Barber Management"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            title="Refresh Staff"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredWorkers.length === 0}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs inline-flex items-center gap-1.5 transition disabled:opacity-50"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-amber-500" /> Export CSV
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Add Staff Member
          </button>
        </div>
      }
    >
      {/* FILTER & SEARCH BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name or phone..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-lg font-semibold transition ${
              statusFilter === 'active'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('archived')}
            className={`px-3 py-1 rounded-lg font-semibold transition ${
              statusFilter === 'archived'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Archived
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* STAFF DIRECTORY TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading staff directory...
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Briefcase className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No staff members found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Barber Name</th>
                  <th className="px-5 py-3.5">Mobile Phone</th>
                  <th className="px-5 py-3.5">Commissions (%)</th>
                  <th className="px-5 py-3.5">Base Salary</th>
                  <th className="px-5 py-3.5">Assigned Skills</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredWorkers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                          {w.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{w.displayName}</div>
                          {w.email && <div className="text-[11px] text-slate-500">{w.email}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-slate-300">
                      {w.phone}
                    </td>

                    <td className="px-5 py-4 font-mono text-[11px] text-emerald-400">
                      <span>✂️ {w.commissionRatePercent || 0}%</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-amber-400">📦 {w.productCommissionRatePercent || 0}%</span>
                    </td>

                    <td className="px-5 py-4 font-mono text-slate-300">
                      {w.baseSalaryPaise > 0 ? formatINR(w.baseSalaryPaise) : '—'}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-1 max-w-xs">
                        {w.serviceIds?.length ? (
                          <>
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                              {w.serviceIds.length} Skill{w.serviceIds.length > 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => {
                                setMappingWorker(w);
                                setSelectedServiceIds(w.serviceIds || []);
                              }}
                              className="text-[10px] text-slate-400 hover:text-amber-400 underline ml-1"
                            >
                              View / Edit
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setMappingWorker(w);
                              setSelectedServiceIds([]);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] hover:text-white"
                          >
                            All Services (Click to specialize)
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {w.archived ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                          Archived
                        </span>
                      ) : w.status === 'active' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setMappingWorker(w);
                            setSelectedServiceIds(w.serviceIds || []);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                          title="Configure Service Skills"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => openEditModal(w)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Edit Profile & Commissions"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {w.archived ? (
                          <button
                            onClick={() => handleRestoreWorker(w.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition"
                            title="Restore Staff"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchiveWorker(w.id, w.displayName)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                            title="Archive Staff"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Add Worker */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" /> Add Barber / Worker
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddWorker} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Full Display Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Raj Malhotra"
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 00104"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Service Comm. (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={serviceComm}
                    onChange={(e) => setServiceComm(e.target.value)}
                    placeholder="40"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Product Comm. (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={productComm}
                    onChange={(e) => setProductComm(e.target.value)}
                    placeholder="10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Monthly Base Salary (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={baseSalaryRupees}
                  onChange={(e) => setBaseSalaryRupees(e.target.value)}
                  placeholder="25000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
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
                  {submitting ? 'Adding...' : 'Add Barber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Worker (PATCH /workers/:id) */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-400" /> Edit Staff: {editingWorker.displayName}
              </h3>
              <button
                onClick={() => setEditingWorker(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Full Display Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Service Comm. (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editServiceComm}
                    onChange={(e) => setEditServiceComm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Product Comm. (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editProductComm}
                    onChange={(e) => setEditProductComm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Monthly Base Salary (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={editBaseSalaryRupees}
                  onChange={(e) => setEditBaseSalaryRupees(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="active">Active (On Schedule & Chair)</option>
                  <option value="inactive">Inactive (Temporarily Paused)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWorker(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {savingEdit ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Worker Service Mapping (Section 8) */}
      {mappingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-400" />
                Service Skills: {mappingWorker.displayName}
              </h3>
              <button
                onClick={() => setMappingWorker(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="mt-4 space-y-4">
              <p className="text-xs text-slate-400">
                Customers selecting these services will only see this barber if they are mapped below.
              </p>

              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>{selectedServiceIds.length} of {services.length} Services Selected</span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedServiceIds(services.map((s) => s.id))}
                    className="text-amber-400 hover:underline text-[11px]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedServiceIds([])}
                    className="text-slate-400 hover:underline text-[11px]"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                {services.map((s) => {
                  const isChecked = selectedServiceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-500 text-white font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span>{s.name}</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedServiceIds(selectedServiceIds.filter((id) => id !== s.id));
                          } else {
                            setSelectedServiceIds([...selectedServiceIds, s.id]);
                          }
                        }}
                        className="accent-amber-500"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMappingWorker(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMapping}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {savingMapping ? 'Saving...' : 'Save Capabilities'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
