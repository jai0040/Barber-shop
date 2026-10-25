'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Scissors,
  Plus,
  Clock,
  DollarSign,
  Tag,
  CheckCircle2,
  X,
  RefreshCw,
  Edit2,
} from 'lucide-react';

interface ServiceItem {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName?: string;
  description: string | null;
  durationMinutes: number;
  pricePaise: number;
  status: string;
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadServices();
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const res = await apiRequest<{ categories: any[] }>('/services/categories');
      setCategories(res.categories || []);
      if (res.categories?.length && !categoryId) {
        setCategoryId(res.categories[0].id);
      }
    } catch {}
  }

  async function loadServices() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ items: any[] }>('/services?limit=100');
      setServices(
        (res.items || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          categoryId: s.categoryId ?? s.category_id,
          categoryName: s.categoryName ?? s.category_name,
          description: s.description,
          durationMinutes: s.durationMinutes ?? s.duration_minutes,
          pricePaise: s.pricePaise ?? s.price_paise,
          status: s.status,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !priceRupees) return;

    try {
      setSubmitting(true);
      await apiRequest('/services', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          categoryId: categoryId || undefined,
          durationMinutes: parseInt(durationMinutes) || 30,
          pricePaise: Math.round(parseFloat(priceRupees) * 100),
          description: description.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setName('');
      setPriceRupees('');
      setDurationMinutes('30');
      setDescription('');
      await loadServices();
    } catch (err: any) {
      alert(err.message || 'Failed to create service');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminLayout
      title="Salon Services & Pricing"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadServices}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Services"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      }
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading services...
          </div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Scissors className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No services configured in catalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Service Name</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Price</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40">
                    <td className="px-5 py-4">
                      <div className="font-bold text-white text-sm">{s.name}</div>
                      {s.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {s.description}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]">
                        {s.categoryName || 'General Grooming'}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-mono text-slate-300">
                      {s.durationMinutes} mins
                    </td>

                    <td className="px-5 py-4 font-black text-amber-400 text-sm">
                      {formatINR(s.pricePaise)}
                    </td>

                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Add Service */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-400" /> New Service
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddService} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Royal Beard Grooming"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="">General Grooming</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceRupees}
                    onChange={(e) => setPriceRupees(e.target.value)}
                    placeholder="350.00"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    step="5"
                    min="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="30"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Hot towel treatment, razor lineup, beard butter nourishment..."
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
                  {submitting ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
