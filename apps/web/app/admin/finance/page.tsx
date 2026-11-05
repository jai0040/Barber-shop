'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
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
  Users,
  Award,
  Sparkles,
  AlertCircle,
  Clock,
  ShieldCheck,
  Check,
  Download,
} from 'lucide-react';
import { WorkerEarningsSummary } from '@barbershop/shared';

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
  const [activeTab, setActiveTab] = useState<'expenses' | 'commissions'>('expenses');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Section 35: Period Filter State (Today, Weekly, Monthly, Custom)
  const [periodPreset, setPeriodPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [filterEndDate, setFilterEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Phase 3: Staff Commissions State
  const [commissions, setCommissions] = useState<WorkerEarningsSummary[]>([]);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [payoutAmountRupees, setPayoutAmountRupees] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'cash' | 'bank_transfer' | 'upi'>('upi');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [recordExpense, setRecordExpense] = useState(true);

  // Manual Adjustment Form
  const [adjustAmountRupees, setAdjustAmountRupees] = useState('');
  const [adjustType, setAdjustType] = useState<'manual_adjustment' | 'tip'>('manual_adjustment');
  const [adjustNotes, setAdjustNotes] = useState('');

  // New Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [catId, setCatId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [vendor, setVendor] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('cash');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFinanceData(filterStartDate, filterEndDate);
    loadCommissions();
  }, []);

  function handleSelectPeriod(preset: 'today' | 'week' | 'month') {
    setPeriodPreset(preset);
    const today = new Date().toISOString().slice(0, 10);
    let s = today;
    if (preset === 'today') {
      s = today;
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      s = d.toISOString().slice(0, 10);
    } else if (preset === 'month') {
      const d = new Date();
      s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    setFilterStartDate(s);
    setFilterEndDate(today);
    loadFinanceData(s, today);
  }

  async function loadFinanceData(sDate = filterStartDate, eDate = filterEndDate) {
    try {
      setLoading(true);
      setError(null);

      let sumUrl = '/finance/summary';
      let expUrl = '/finance/expenses?limit=100';
      if (sDate && eDate) {
        sumUrl += `?startDate=${sDate}&endDate=${eDate}`;
        expUrl += `&startDate=${sDate}&endDate=${eDate}`;
      }

      const [sumRes, expRes, catRes] = await Promise.all([
        apiRequest<any>(sumUrl),
        apiRequest<{ items: any[] }>(expUrl),
        apiRequest<{ categories: any[] }>('/finance/categories'),
      ]);

      setSummary({
        revenuePaise: Number(sumRes.totalRevenuePaise ?? sumRes.revenuePaise ?? 0),
        serviceRevenuePaise: Number(sumRes.serviceRevenuePaise ?? 0),
        productRevenuePaise: Number(sumRes.productRevenuePaise ?? 0),
        expensesPaise: Number(sumRes.totalExpensesPaise ?? sumRes.expensesPaise ?? 0),
        netPaise: Number(sumRes.netResultPaise ?? sumRes.netPaise ?? 0),
      });
      setExpenses(
        (expRes.items || []).map((e: any) => ({
          id: e.id,
          categoryName: e.category_name ?? e.categoryName ?? 'General Expense',
          amountPaise: Number(e.amount_paise ?? e.amountPaise ?? 0),
          expenseDate: e.date ?? e.expense_date ?? e.expenseDate,
          paymentMode: e.payment_method ?? e.payment_mode ?? e.paymentMode ?? 'cash',
          vendorName: e.vendor_name ?? e.vendorName ?? null,
          description: e.description ?? null,
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

  async function loadCommissions() {
    try {
      setCommissionsLoading(true);
      const res = await apiRequest<WorkerEarningsSummary[]>('/commission/summary');
      setCommissions(res || []);
    } catch {
      // Gracefully handle
    } finally {
      setCommissionsLoading(false);
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

  async function handleRecordPayout(e: React.FormEvent) {
    e.preventDefault();
    const rupees = parseFloat(payoutAmountRupees);
    if (!rupees || rupees <= 0 || !selectedWorkerId) {
      alert('Please select a worker and enter a valid payout amount.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/commission/payout', {
        method: 'POST',
        body: JSON.stringify({
          workerId: selectedWorkerId,
          amountPaise: Math.round(rupees * 100),
          paymentMethod: payoutMethod,
          periodStartDate: periodStart || undefined,
          periodEndDate: periodEnd || undefined,
          notes: payoutNotes.trim() || undefined,
          recordExpense,
        }),
      });

      setShowPayoutModal(false);
      setPayoutAmountRupees('');
      setPayoutNotes('');
      setPeriodStart('');
      setPeriodEnd('');
      await Promise.all([loadCommissions(), loadFinanceData()]);
      alert('Payout recorded and settled successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to record payout.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdjustCommission(e: React.FormEvent) {
    e.preventDefault();
    const rupees = parseFloat(adjustAmountRupees);
    if (!rupees || !selectedWorkerId || !adjustNotes.trim()) {
      alert('Please select a worker, enter an amount, and provide a remark.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/commission/adjust', {
        method: 'POST',
        body: JSON.stringify({
          workerId: selectedWorkerId,
          amountPaise: Math.round(rupees * 100),
          type: adjustType,
          notes: adjustNotes.trim(),
        }),
      });

      setShowAdjustModal(false);
      setAdjustAmountRupees('');
      setAdjustNotes('');
      await loadCommissions();
      alert('Commission adjustment recorded!');
    } catch (err: any) {
      alert(err.message || 'Failed to adjust commission.');
    } finally {
      setSubmitting(false);
    }
  }

  function openPayoutForWorker(worker: WorkerEarningsSummary) {
    setSelectedWorkerId(worker.workerId);
    setPayoutAmountRupees(worker.balancePendingPaise > 0 ? (worker.balancePendingPaise / 100).toString() : '');
    setShowPayoutModal(true);
  }

  function handleExportCsv() {
    const dateStr = new Date().toISOString().split('T')[0];
    if (activeTab === 'expenses') {
      const headers = ['Date', 'Category', 'Amount (INR)', 'Payment Mode', 'Vendor', 'Description'];
      const rows = expenses.map((e) => [
        e.expenseDate,
        e.categoryName,
        (e.amountPaise / 100).toFixed(2),
        e.paymentMode,
        e.vendorName || '-',
        e.description || '-',
      ]);
      downloadCsv(`expenses_ledger_${dateStr}`, headers, rows);
    } else {
      const headers = [
        'Barber Name',
        'Service Comm %',
        'Service Comm (INR)',
        'Product Comm (INR)',
        'Tips (INR)',
        'Total Earned (INR)',
        'Total Paid (INR)',
        'Balance Pending (INR)',
      ];
      const rows = commissions.map((c) => [
        c.workerName,
        c.commissionRatePercent + '%',
        (c.totalServiceCommissionPaise / 100).toFixed(2),
        (c.totalProductCommissionPaise / 100).toFixed(2),
        (c.totalTipsPaise / 100).toFixed(2),
        (c.totalEarnedPaise / 100).toFixed(2),
        (c.totalPaidOutPaise / 100).toFixed(2),
        (c.balancePendingPaise / 100).toFixed(2),
      ]);
      downloadCsv(`staff_commissions_${dateStr}`, headers, rows);
    }
  }

  const totalCommissionsEarned = commissions.reduce(
    (acc, c) => acc + c.totalServiceCommissionPaise + c.totalProductCommissionPaise,
    0
  );
  const totalTipsEarned = commissions.reduce((acc, c) => acc + c.totalTipsPaise, 0);
  const totalCommissionsPending = commissions.reduce((acc, c) => acc + c.balancePendingPaise, 0);

  return (
    <AdminLayout
      title="Financial Performance & Payroll"
      actions={
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'expenses'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Expenses & P&L
            </button>
            <button
              onClick={() => {
                setActiveTab('commissions');
                loadCommissions();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'commissions'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Staff Commissions & Payouts
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={activeTab === 'expenses' ? expenses.length === 0 : commissions.length === 0}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Export Ledger as CSV"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Export CSV
          </button>

          <button
            onClick={() => {
              loadFinanceData();
              loadCommissions();
            }}
            disabled={loading || commissionsLoading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading || commissionsLoading ? 'animate-spin' : ''}`} />
          </button>

          {activeTab === 'expenses' ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" /> Record Expense
            </button>
          ) : (
            <button
              onClick={() => {
                if (commissions.length > 0 && !selectedWorkerId) {
                  setSelectedWorkerId(commissions[0].workerId);
                }
                setShowPayoutModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
            >
              <DollarSign className="w-4 h-4" /> Record Payout
            </button>
          )}
        </div>
      }
    >
      {activeTab === 'expenses' ? (
        <>
          {/* Period Filter Bar (Section 35: Today, Weekly, Monthly, Custom) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => handleSelectPeriod('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  periodPreset === 'today'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleSelectPeriod('week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  periodPreset === 'week'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => handleSelectPeriod('month')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  periodPreset === 'month'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setPeriodPreset('custom')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  periodPreset === 'custom'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                }`}
              >
                Custom Range
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">From:</span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">To:</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={() => loadFinanceData(filterStartDate, filterEndDate)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Apply
              </button>
            </div>
          </div>

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
                    Shop overheads, stock purchases & staff payroll
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
                    <PieChart className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <p
                    className={`text-3xl font-black ${
                      summary.netPaise >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatINR(summary.netPaise)}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    {summary.netPaise >= 0 ? 'Net Positive Operating Margin' : 'Operating Deficit'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expenses Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" /> Operating Expenses ({expenses.length})
              </h3>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                Loading ledger records...
              </div>
            ) : expenses.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No expenses logged yet. Click &quot;Record Expense&quot; above to add your first operating cost.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Category</th>
                      <th className="px-5 py-3.5">Remarks / Details</th>
                      <th className="px-5 py-3.5">Payment Mode</th>
                      <th className="px-5 py-3.5 text-right">Amount</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-800/40">
                        <td className="px-5 py-4 whitespace-nowrap text-slate-400">
                          {new Date(exp.expenseDate).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 font-bold text-white">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                            {exp.categoryName}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-200">
                            {exp.description || 'Operating Expense'}
                          </div>
                          {exp.vendorName && (
                            <div className="text-[10px] text-slate-500">Paid to: {exp.vendorName}</div>
                          )}
                        </td>
                        <td className="px-5 py-4 uppercase font-bold text-[10px] text-slate-400">
                          {exp.paymentMode}
                        </td>
                        <td className="px-5 py-4 text-right font-black text-rose-400">
                          -{formatINR(exp.amountPaise)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
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
        </>
      ) : (
        /* PHASE 3: STAFF COMMISSIONS & PAYOUTS TAB */
        <div className="space-y-6">
          {/* Commissions Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider block">
                Total Commissions Earned
              </span>
              <p className="text-3xl font-black text-white mt-2">
                {formatINR(totalCommissionsEarned)}
              </p>
              <p className="text-xs text-slate-400 mt-1">From completed haircuts & product sales</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider block">
                Total Tips Collected
              </span>
              <p className="text-3xl font-black text-amber-400 mt-2">
                {formatINR(totalTipsEarned)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Paid directly by satisfied clients</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider block">
                Unsettled Payout Liability
              </span>
              <p className="text-3xl font-black text-emerald-400 mt-2">
                {formatINR(totalCommissionsPending)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Net pending balance owed to staff</p>
            </div>
          </div>

          {/* Workers Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" /> Stylist Commission & Tips Ledger ({commissions.length})
              </h3>
            </div>

            {commissionsLoading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                Loading staff commission balances...
              </div>
            ) : commissions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No active staff found. Add staff members in Worker Profiles to track commissions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Stylist</th>
                      <th className="px-5 py-3.5">Rates (%)</th>
                      <th className="px-5 py-3.5">Service Comm.</th>
                      <th className="px-5 py-3.5">Product Comm.</th>
                      <th className="px-5 py-3.5">Tips</th>
                      <th className="px-5 py-3.5">Total Paid Out</th>
                      <th className="px-5 py-3.5 text-right">Pending Balance</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {commissions.map((c) => (
                      <tr key={c.workerId} className="hover:bg-slate-800/40">
                        <td className="px-5 py-4 font-bold text-white">
                          {c.workerName}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[11px] text-slate-300 font-mono">
                            ✂️ {c.commissionRatePercent}% | 📦 {c.productCommissionRatePercent}%
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-white">
                          {formatINR(c.totalServiceCommissionPaise)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-white">
                          {formatINR(c.totalProductCommissionPaise)}
                        </td>
                        <td className="px-5 py-4 font-bold text-amber-400">
                          {formatINR(c.totalTipsPaise)}
                        </td>
                        <td className="px-5 py-4 text-slate-400 font-semibold">
                          {formatINR(c.totalPaidOutPaise)}
                        </td>
                        <td className="px-5 py-4 text-right font-black text-sm text-emerald-400">
                          {formatINR(c.balancePendingPaise)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openPayoutForWorker(c)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all"
                          >
                            Settle Payout
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECORD PAYOUT MODAL */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" /> Settle Commission Payout
              </h3>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayout} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Stylist / Barber
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => {
                    setSelectedWorkerId(e.target.value);
                    const w = commissions.find((x) => x.workerId === e.target.value);
                    if (w && w.balancePendingPaise > 0) {
                      setPayoutAmountRupees((w.balancePendingPaise / 100).toString());
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {commissions.map((w) => (
                    <option key={w.workerId} value={w.workerId}>
                      {w.workerName} (Pending: {formatINR(w.balancePendingPaise)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Payout Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={payoutAmountRupees}
                  onChange={(e) => setPayoutAmountRupees(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Payment Method
                </label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="upi">UPI / Instant Online</option>
                  <option value="cash">Cash In Hand</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Period From</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Period To</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="e.g. Weekly settlement via GPay"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="recordExpenseCheck"
                  checked={recordExpense}
                  onChange={(e) => setRecordExpense(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-amber-500"
                />
                <label htmlFor="recordExpenseCheck" className="text-xs text-slate-300">
                  Record as shop expense under &quot;Salaries & Commissions&quot;
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  {submitting ? 'Settling...' : 'Confirm & Settle Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" /> Log Shop Expense
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Category
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
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
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
