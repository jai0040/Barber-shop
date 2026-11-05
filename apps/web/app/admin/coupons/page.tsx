'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  Ticket,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Tag,
  Percent,
  Calendar,
  Users,
  TrendingUp,
  X,
  Power,
  Download,
} from 'lucide-react';
import { CouponItem } from '@barbershop/shared';

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Form State
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'flat',
    discountValue: 10,
    maxDiscountRupees: '' as string | number,
    minOrderRupees: '' as string | number,
    applicableTo: 'all' as 'all' | 'services' | 'products',
    maxRedemptionsTotal: '' as string | number,
    maxRedemptionsPerCustomer: 1,
    validUntil: '',
    isActive: true,
  });

  useEffect(() => {
    loadCoupons();
  }, [showActiveOnly]);

  async function loadCoupons() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiGet<CouponItem[]>(`/coupons${showActiveOnly ? '?activeOnly=true' : ''}`);
      setCoupons(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      setSuccess(null);

      const payload: any = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue:
          form.discountType === 'percentage'
            ? Number(form.discountValue)
            : Math.round(Number(form.discountValue) * 100),
        maxDiscountPaise:
          form.discountType === 'percentage' && form.maxDiscountRupees
            ? Math.round(Number(form.maxDiscountRupees) * 100)
            : undefined,
        minOrderPaise: form.minOrderRupees ? Math.round(Number(form.minOrderRupees) * 100) : 0,
        applicableTo: form.applicableTo,
        maxRedemptionsTotal: form.maxRedemptionsTotal ? Number(form.maxRedemptionsTotal) : undefined,
        maxRedemptionsPerCustomer: Number(form.maxRedemptionsPerCustomer) || 1,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
        isActive: form.isActive,
      };

      await apiPost('/coupons', payload);
      setSuccess(`Coupon "${form.code.toUpperCase()}" created successfully!`);
      setShowCreateModal(false);
      setForm({
        code: '',
        description: '',
        discountType: 'percentage',
        discountValue: 10,
        maxDiscountRupees: '',
        minOrderRupees: '',
        applicableTo: 'all',
        maxRedemptionsTotal: '',
        maxRedemptionsPerCustomer: 1,
        validUntil: '',
        isActive: true,
      });
      loadCoupons();
    } catch (err: any) {
      setError(err.message || 'Failed to create coupon');
    }
  }

  async function toggleStatus(coupon: CouponItem) {
    try {
      setError(null);
      await apiPatch(`/coupons/${coupon.id}`, { isActive: !coupon.isActive });
      setSuccess(`Coupon "${coupon.code}" ${!coupon.isActive ? 'activated' : 'deactivated'} successfully!`);
      loadCoupons();
    } catch (err: any) {
      setError(err.message || 'Failed to update coupon status');
    }
  }

  // Filtered coupons
  const filtered = coupons.filter(
    (c) =>
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Stats
  const activeCount = coupons.filter((c) => c.isActive).length;
  const totalRedemptions = coupons.reduce((acc, c) => acc + (c.timesRedeemed || 0), 0);

  function handleExportCsv() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      'Coupon Code',
      'Description',
      'Discount Type',
      'Discount Value',
      'Max Discount (INR)',
      'Min Order (INR)',
      'Applicable To',
      'Times Redeemed',
      'Total Cap',
      'Per-Customer Limit',
      'Expiry Date',
      'Status',
    ];
    const rows = coupons.map((c) => [
      c.code,
      c.description || '-',
      c.discountType,
      c.discountType === 'percentage' ? `${c.discountValue}%` : (c.discountValue / 100).toFixed(2),
      c.maxDiscountPaise ? (c.maxDiscountPaise / 100).toFixed(2) : 'None',
      (c.minOrderPaise / 100).toFixed(2),
      c.applicableTo,
      c.timesRedeemed || 0,
      c.maxRedemptionsTotal ?? 'Unlimited',
      c.maxRedemptionsPerCustomer ?? 1,
      c.validUntil ? new Date(c.validUntil).toLocaleDateString() : 'No expiry',
      c.isActive ? 'Active' : 'Inactive',
    ]);
    downloadCsv(`promotional_coupons_${dateStr}`, headers, rows);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Ticket className="w-6 h-6 text-amber-400" /> Promotional Coupons & Offers
            </h1>
            <p className="text-slate-400 text-sm">
              Configure promo codes, percentage or flat discounts, bill coverage limits, and redemption caps.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={coupons.length === 0}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all disabled:opacity-50"
              title="Export Coupons as CSV"
            >
              <Download className="w-4 h-4 text-amber-400" /> Export CSV
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-lg shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4" /> Create Coupon
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
              <span>ACTIVE COUPONS</span>
              <Tag className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white">{activeCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">Ready to apply at POS</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
              <span>TOTAL REDEMPTIONS</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">{totalRedemptions}</div>
            <div className="text-[11px] text-slate-500 mt-1">Across all promo campaigns</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
              <span>TOTAL CAMPAIGNS</span>
              <Ticket className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{coupons.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Active and historical codes</div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span>Show Active Only</span>
          </label>
        </div>

        {/* Coupons Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Coupon Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Conditions</th>
                  <th className="py-3 px-4">Applies To</th>
                  <th className="py-3 px-4">Usage & Caps</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading promotional coupons...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No coupons found. Click &quot;+ Create Coupon&quot; to add your first promotion.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isExpired = c.validUntil && new Date(c.validUntil) < new Date();
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-xs">
                              {c.code}
                            </span>
                          </div>
                          {c.description && (
                            <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                              {c.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {c.discountType === 'percentage' ? (
                            <div>
                              <span>{c.discountValue}% OFF</span>
                              {c.maxDiscountPaise && (
                                <span className="text-[11px] text-slate-400 block font-normal">
                                  Up to {formatINR(c.maxDiscountPaise)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-400 font-bold">
                              Flat {formatINR(c.discountValue)} OFF
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[11px] text-slate-300">
                          <div>
                            {c.minOrderPaise > 0 ? (
                              <span>Min order: {formatINR(c.minOrderPaise)}</span>
                            ) : (
                              <span className="text-slate-500">No min order</span>
                            )}
                          </div>
                          {c.validUntil && (
                            <div className="text-slate-400 mt-0.5">
                              Exp: {new Date(c.validUntil).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              c.applicableTo === 'all'
                                ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                : c.applicableTo === 'services'
                                ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}
                          >
                            {c.applicableTo === 'all'
                              ? 'All Items'
                              : c.applicableTo === 'services'
                              ? 'Services'
                              : 'Retail Products'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[11px]">
                          <div className="font-semibold text-white">
                            {c.timesRedeemed} redeemed
                          </div>
                          <div className="text-slate-400 text-[10px]">
                            {c.maxRedemptionsTotal
                              ? `Limit: ${c.maxRedemptionsTotal} total`
                              : 'Unlimited total'}
                            {c.maxRedemptionsPerCustomer && ` · ${c.maxRedemptionsPerCustomer}/cust`}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {isExpired ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Expired
                            </span>
                          ) : c.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleStatus(c)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                              c.isActive
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {c.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Coupon Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Ticket className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Create Promotional Coupon</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
                {/* Code & Discount Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Coupon Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FESTIVE20"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono uppercase tracking-wider focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Discount Type *</label>
                    <select
                      value={form.discountType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discountType: e.target.value as 'percentage' | 'flat',
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="flat">Flat Cash (₹)</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. 20% off all haircuts during festive season"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Discount Value & Max Cap */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      {form.discountType === 'percentage' ? 'Discount Percentage (%) *' : 'Flat Discount (₹) *'}
                    </label>
                    <input
                      type="number"
                      required
                      min={form.discountType === 'percentage' ? 1 : 1}
                      max={form.discountType === 'percentage' ? 100 : undefined}
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {form.discountType === 'percentage' && (
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Max Cap (₹)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 150 (Optional)"
                        value={form.maxDiscountRupees}
                        onChange={(e) => setForm({ ...form, maxDiscountRupees: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}
                </div>

                {/* Min Order & Applicability */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Min Bill Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0 for no min"
                      value={form.minOrderRupees}
                      onChange={(e) => setForm({ ...form, minOrderRupees: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Applicable To</label>
                    <select
                      value={form.applicableTo}
                      onChange={(e) =>
                        setForm({ ...form, applicableTo: e.target.value as any })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="all">Entire Bill (Services + Products)</option>
                      <option value="services">Services Only</option>
                      <option value="products">Products Only</option>
                    </select>
                  </div>
                </div>

                {/* Limits & Expiry */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Total Cap</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={form.maxRedemptionsTotal}
                      onChange={(e) => setForm({ ...form, maxRedemptionsTotal: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Per Customer</label>
                    <input
                      type="number"
                      min="1"
                      value={form.maxRedemptionsPerCustomer}
                      onChange={(e) => setForm({ ...form, maxRedemptionsPerCustomer: parseInt(e.target.value) || 1 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Expires On</label>
                    <input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
