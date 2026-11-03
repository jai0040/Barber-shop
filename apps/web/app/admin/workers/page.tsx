'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
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
} from 'lucide-react';

interface WorkerItem {
  id: string;
  displayName: string;
  phone: string;
  email?: string | null;
  commissionRatePercent?: number;
  productCommissionRatePercent?: number;
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

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [mappingWorker, setMappingWorker] = useState<WorkerItem | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);

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
        apiRequest<{ items: any[] }>('/workers?limit=50'),
        apiRequest<{ items: any[] }>('/services?limit=100'),
      ]);
      setWorkers(
        (wRes.items || []).map((w: any) => ({
          id: w.id,
          displayName: w.displayName ?? w.display_name,
          phone: w.phone,
          commissionRatePercent: Number(w.commissionRatePercent ?? w.commission_rate_percent ?? 0),
          productCommissionRatePercent: Number(w.productCommissionRatePercent ?? w.product_commission_rate_percent ?? 0),
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

  return (
    <AdminLayout
      title="Staff & Barber Management"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Staff"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Staff Member
          </button>
        </div>
      }
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading staff directory...
          </div>
        ) : workers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Briefcase className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No barbers or workers configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Barber Name</th>
                  <th className="px-5 py-3.5">Mobile Phone</th>
                  <th className="px-5 py-3.5">Commissions (%)</th>
                  <th className="px-5 py-3.5">Assigned Services</th>
                  <th className="px-5 py-3.5 text-right">Service Capabilities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {workers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-bold text-white flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                        {w.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      {w.displayName}
                    </td>

                    <td className="px-5 py-4 font-mono text-slate-300">
                      {w.phone}
                    </td>

                    <td className="px-5 py-4 font-mono text-[11px] text-emerald-400">
                      <span>✂️ {w.commissionRatePercent || 0}%</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-amber-400">📦 {w.productCommissionRatePercent || 0}%</span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {w.serviceIds?.length ? (
                          w.serviceIds.map((sid) => {
                            const s = services.find((x) => x.id === sid);
                            return (
                              <span
                                key={sid}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700/60"
                              >
                                {s ? s.name : 'Service'}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-slate-500 text-[11px]">
                            All standard services
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => {
                          setMappingWorker(w);
                          setSelectedServiceIds(w.serviceIds || []);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold border border-slate-700"
                      >
                        Edit Skills
                      </button>
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

      {/* MODAL 2: Edit Worker Service Mapping (Section 8) */}
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
