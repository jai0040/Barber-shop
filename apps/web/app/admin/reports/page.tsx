'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  BarChart3,
  Users,
  Package,
  TrendingUp,
  DollarSign,
  Calendar,
  RefreshCw,
  Scissors,
  CheckCircle2,
  Download,
} from 'lucide-react';

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState<'sales' | 'workers' | 'inventory' | 'finance'>('sales');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [reportType]);

  async function loadReport() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<any>(`/reports/analytics?type=${reportType}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load report analytics.');
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    if (!data) return;
    const dateStr = new Date().toISOString().split('T')[0];

    if (reportType === 'sales') {
      const headers = ['Category', 'Revenue (INR)'];
      const rows = (data.breakdown || []).map((b: any) => [
        b.itemType || b.type,
        ((b.revenuePaise || b.totalPaise || 0) / 100).toFixed(2),
      ]);
      rows.unshift(['Total Revenue', ((data.totalRevenuePaise || 0) / 100).toFixed(2)]);
      rows.unshift(['Invoices Count', data.invoicesCount || 0]);
      downloadCsv(`sales_report_${dateStr}`, headers, rows);
    } else if (reportType === 'workers') {
      const headers = ['Barber Name', 'Clients Served', 'Revenue Generated (INR)'];
      const rows = (data.workers || []).map((w: any) => [
        w.workerName || w.displayName || 'Staff Member',
        w.appointmentsCount || w.clientsCount || 0,
        ((w.revenuePaise || 0) / 100).toFixed(2),
      ]);
      downloadCsv(`worker_productivity_report_${dateStr}`, headers, rows);
    } else if (reportType === 'inventory') {
      const headers = ['Product Name', 'Units in Stock', 'Unit Cost (INR)', 'Total Valuation (INR)'];
      const rows = (data.items || []).map((it: any) => [
        it.name,
        it.stockQuantity,
        ((it.costPricePaise || 0) / 100).toFixed(2),
        (((it.stockQuantity || 0) * (it.costPricePaise || 0)) / 100).toFixed(2),
      ]);
      downloadCsv(`inventory_valuation_report_${dateStr}`, headers, rows);
    } else if (reportType === 'finance') {
      const headers = ['Metric', 'Amount (INR)'];
      const rows = [
        ['Total Revenue', ((data.summary?.revenuePaise || 0) / 100).toFixed(2)],
        ['Total Expenses', ((data.summary?.expensesPaise || 0) / 100).toFixed(2)],
        ['Net Result', ((data.summary?.netPaise || 0) / 100).toFixed(2)],
      ];
      downloadCsv(`finance_summary_report_${dateStr}`, headers, rows);
    }
  }

  return (
    <AdminLayout
      title="Business Reports & Analytics"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={loading || !data}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Export Report as CSV"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Export CSV
          </button>
          <button
            onClick={loadReport}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Report"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {/* Type Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6">
        {[
          { id: 'sales', label: 'Sales & Revenue', icon: TrendingUp },
          { id: 'workers', label: 'Worker Productivity', icon: Users },
          { id: 'inventory', label: 'Inventory Valuation', icon: Package },
          { id: 'finance', label: 'Finance Summary', icon: DollarSign },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = reportType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportType(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap transition-all ${
                active
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          Calculating metrics and compiling report...
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-3xl text-center text-xs">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* SALES REPORT */}
          {reportType === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Total Revenue</span>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    {formatINR(data.totalRevenuePaise || 0)}
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Invoices Count</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {data.invoicesCount || 0}
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Avg Ticket Size</span>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {formatINR(
                      data.invoicesCount ? Math.round(data.totalRevenuePaise / data.invoicesCount) : 0
                    )}
                  </p>
                </div>
              </div>

              {/* Service vs Product breakdown */}
              {data.breakdown && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                    Inflow by Category
                  </h3>
                  <div className="space-y-3">
                    {data.breakdown.map((b: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between text-xs">
                        <span className="font-bold text-white capitalize">{b.itemType || b.type}</span>
                        <span className="font-bold text-amber-400">{formatINR(b.revenuePaise || b.totalPaise || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WORKER PRODUCTIVITY REPORT */}
          {reportType === 'workers' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Stylist Productivity & Revenue Contribution
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Barber Name</th>
                      <th className="px-5 py-3.5">Clients Served</th>
                      <th className="px-5 py-3.5">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {(data.workers || []).map((w: any) => (
                      <tr key={w.workerId || w.id} className="hover:bg-slate-800/40">
                        <td className="px-5 py-4 font-bold text-white">
                          {w.workerName || w.displayName}
                        </td>
                        <td className="px-5 py-4">
                          {w.appointmentsCount || w.clientsCount || 0}
                        </td>
                        <td className="px-5 py-4 font-bold text-emerald-400">
                          {formatINR(w.revenuePaise || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INVENTORY REPORT */}
          {reportType === 'inventory' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Total Stock Asset Value</span>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    {formatINR(data.totalValuationPaise || 0)}
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">SKUs in Catalog</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {data.totalSkus || 0}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Product Valuation Breakdown
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Product</th>
                        <th className="px-5 py-3.5">Units in Stock</th>
                        <th className="px-5 py-3.5">Unit Cost</th>
                        <th className="px-5 py-3.5">Total Valuation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {(data.items || []).map((it: any) => (
                        <tr key={it.id} className="hover:bg-slate-800/40">
                          <td className="px-5 py-4 font-bold text-white">{it.name}</td>
                          <td className="px-5 py-4">{it.stockQuantity}</td>
                          <td className="px-5 py-4">{formatINR(it.costPricePaise)}</td>
                          <td className="px-5 py-4 font-bold text-amber-400">
                            {formatINR(it.stockQuantity * it.costPricePaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* FINANCE REPORT */}
          {reportType === 'finance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Total Revenue</span>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {formatINR(data.summary?.revenuePaise || 0)}
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Total Expenses</span>
                  <p className="text-2xl font-black text-rose-400 mt-1">
                    {formatINR(data.summary?.expensesPaise || 0)}
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase text-slate-400 font-semibold">Net Result</span>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    {formatINR(data.summary?.netPaise || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </AdminLayout>
  );
}
