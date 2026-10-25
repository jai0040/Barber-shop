'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Tag,
  CheckCircle2,
  X,
  RefreshCw,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface FinanceSummary {
  revenuePaise: number;
  serviceRevenuePaise: number;
  productRevenuePaise: number;
  expensesPaise: number;
  netPaise: number;
}

interface ExpenseItem {
  id: string;
  categoryName: string;
  amountPaise: number;
  expenseDate: string;
  paymentMode: string;
  vendorName: string | null;
  description: string | null;
  createdAt: string;
}

export default function AdminFinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [catId, setCatId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [vendor, setVendor] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('cash');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFinanceData();
  }, []);

  async function loadFinanceData() {
    try {
      setLoading(true);
      setError(null);
      const [sumRes, expRes, catRes] = await Promise.all([
        apiRequest<FinanceSummary>('/finance/summary'),
        apiRequest<{ items: any[] }>('/finance/expenses?limit=100'),
        apiRequest<{ categories: any[] }>('/finance/categories'),
      ]);
      setSummary(sumRes);
      setExpenses(
        (expRes.items || []).map((e: any) => ({
          id: e.id,
          categoryName: e.categoryName ?? e.category_name ?? 'General',
          amountPaise: e.amountPaise ?? e.amount_paise,
          expenseDate: e.expenseDate ?? e.expense_date,
          paymentMode: e.paymentMode ?? e.payment_mode,
          vendorName: e.vendorName ?? e.vendor_name,
          description: e.description,
          createdAt: e.created_at ?? e.createdAt,
        }))
      );
      setCategories(catRes.categories || []);
      if (catRes.categories?.length && !catId) {
        setCatId(catRes.categories[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load financial records.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const rupees = parseFloat(amountRupees);
    if (!rupees || rupees <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: catId || undefined,
          amountPaise: Math.round(rupees * 100),
          paymentMode: mode,
          vendorName: vendor.trim() || undefined,
          description: desc.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setAmountRupees('');
      setVendor('');
      setDesc('');
      await loadFinanceData();
    } catch (err: any) {
      alert(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await apiRequest(`/finance/expenses/${id}`, { method: 'DELETE' });
      await loadFinanceData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense');
    }
  }

  return (
    <AdminLayout
      title="Financial Performance & Expenses"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadFinanceData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Financials"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Record Expense
          </button>
        </div>
      }
    >
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {/* Revenue */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Total Inflow (Revenue)
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-emerald-400">
                {formatINR(summary.revenuePaise)}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                <span>Services: {formatINR(summary.serviceRevenuePaise)}</span>
                <span>&bull;</span>
                <span>Products: {formatINR(summary.productRevenuePaise)}</span>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Total Outflow (Expenses)
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-rose-400">
                {formatINR(summary.expensesPaise)}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Shop overheads, stock purchases & operations
              </p>
            </div>
          </div>

          {/* Net Result */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                Net Result (Profit / Margin)
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div>
              <p
                className={`text-3xl font-black ${
                  summary.netPaise >= 0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {formatINR(summary.netPaise)}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Real-time Net: Inflow minus Outflow
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expense History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Expense Ledger ({expenses.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading expense ledger...
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No expenses recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Vendor / Payee</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Payment Mode</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/40">
                    <td className="px-5 py-4 whitespace-nowrap text-slate-400">
                      {new Date(exp.expenseDate).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-4 font-semibold text-white">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                        {exp.categoryName}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-200">
                      {exp.vendorName || '—'}
                    </td>

                    <td className="px-5 py-4 text-slate-400 max-w-xs truncate">
                      {exp.description || '—'}
                    </td>

                    <td className="px-5 py-4 uppercase font-mono text-[11px] text-slate-400">
                      {exp.paymentMode}
                    </td>

                    <td className="px-5 py-4 font-bold text-rose-400 whitespace-nowrap">
                      -{formatINR(exp.amountPaise)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Record Expense */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" /> Record Shop Expense
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Expense Category
                </label>
                <select
                  value={catId}
                  onChange={(e) => setCatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="">General Overhead</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(e.target.value)}
                  placeholder="e.g. 1500.00"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Vendor / Paid To
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. BESCOM Power / Landlord"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Payment Mode
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / Online</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Description / Remarks
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="e.g. Shop monthly electricity bill..."
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
                  {submitting ? 'Recording...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
