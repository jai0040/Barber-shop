'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest, formatINR } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Scissors,
  Plus,
  RefreshCw,
  ChevronRight,
  Package,
} from 'lucide-react';

interface NormalizedDashboardData {
  metrics: {
    todayRevenuePaise: number;
    serviceRevenuePaise: number;
    productRevenuePaise: number;
    todayExpensesPaise: number;
    netResultPaise: number;
    todayAppointments: number;
    completedAppointments: number;
    pendingAppointments: number;
    todayCustomers: number;
    lowStockCount: number;
  };
  lowStockItems: Array<{
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }>;
  appointments: Array<{
    id: string;
    appointmentNumber?: number;
    customerName: string;
    customerPhone: string;
    workerName: string;
    startTime: string;
    endTime: string;
    status: string;
    totalAmountPaise: number;
    services: string | Array<{ serviceName: string; unitPricePaise: number }>;
  }>;
  workerPerformance: Array<{
    workerId: string;
    displayName: string;
    todayCustomers: number;
    completedCount: number;
    revenuePaise: number;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<NormalizedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<any>('/reports/dashboard/admin');

      // Normalize backend response to handle both API formats safely
      const rawMetrics = res.metrics || res.kpis || {};
      const normalizedMetrics = {
        todayRevenuePaise: Number(rawMetrics.todayRevenuePaise ?? rawMetrics.revenuePaise ?? 0),
        serviceRevenuePaise: Number(rawMetrics.serviceRevenuePaise ?? 0),
        productRevenuePaise: Number(rawMetrics.productRevenuePaise ?? 0),
        todayExpensesPaise: Number(rawMetrics.todayExpensesPaise ?? rawMetrics.expensesPaise ?? 0),
        netResultPaise: Number(rawMetrics.netResultPaise ?? rawMetrics.netPaise ?? 0),
        todayAppointments: Number(rawMetrics.todayAppointments ?? rawMetrics.totalAppointments ?? 0),
        completedAppointments: Number(rawMetrics.completedAppointments ?? 0),
        pendingAppointments: Number(rawMetrics.pendingAppointments ?? rawMetrics.inServiceAppointments ?? 0),
        todayCustomers: Number(rawMetrics.todayCustomers ?? 0),
        lowStockCount: Number(rawMetrics.lowStockCount ?? 0),
      };

      const normalizedAppointments = (res.appointments || res.todayAppointments || []).map((a: any) => ({
        id: a.id,
        appointmentNumber: a.appointmentNumber,
        customerName: a.customerName || 'Guest',
        customerPhone: a.customerPhone || '',
        workerName: a.workerName || 'Unassigned',
        startTime: a.startTime || '00:00',
        endTime: a.endTime || '00:00',
        status: a.status || 'booked',
        totalAmountPaise: Number(a.totalAmountPaise || 0),
        services: a.services || a.serviceNames || 'Custom Service',
      }));

      const normalizedWorkers = (res.workerPerformance || []).map((w: any) => ({
        workerId: w.workerId || w.id,
        displayName: w.displayName || w.workerName || 'Barber',
        todayCustomers: Number(w.todayCustomers ?? 0),
        completedCount: Number(w.completedCount ?? w.appointmentsCount ?? 0),
        revenuePaise: Number(w.revenuePaise ?? 0),
      }));

      const normalizedLowStock = (res.lowStockItems || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQuantity: Number(p.stockQuantity ?? p.stock_quantity ?? 0),
        lowStockThreshold: Number(p.lowStockThreshold ?? p.low_stock_threshold ?? 0),
      }));

      setData({
        metrics: normalizedMetrics,
        lowStockItems: normalizedLowStock,
        appointments: normalizedAppointments,
        workerPerformance: normalizedWorkers,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function updateStatus(appointmentId: string, nextStatus: string) {
    try {
      setUpdatingId(appointmentId);
      await apiRequest(`/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <AdminLayout
      title="Shop Operations Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Refresh Dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/admin/appointments?action=walkin"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> New Walk-In
          </Link>
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadDashboard} className="underline font-bold">
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl p-6" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Low Stock Warning Banner (Section 25) */}
          {data.metrics.lowStockCount > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300 shadow-md">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <p className="text-xs sm:text-sm font-bold text-amber-300">
                    Low Stock Alert: {data.metrics.lowStockCount} product(s) below reorder threshold
                  </p>
                  {data.lowStockItems.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {data.lowStockItems.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30 font-medium"
                        >
                          {p.name}: <strong className="text-white">{p.stockQuantity} left</strong> (threshold: {p.lowStockThreshold})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Link
                href="/admin/inventory"
                className="text-xs font-bold text-amber-400 hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Manage Inventory <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue with Service vs Product Breakdown (Section 29) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Today's Revenue
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-400">
                  {formatINR(data.metrics.todayRevenuePaise)}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                  <span>Services: <strong className="text-slate-200">{formatINR(data.metrics.serviceRevenuePaise)}</strong></span>
                  <span>&bull;</span>
                  <span>Retail: <strong className="text-slate-200">{formatINR(data.metrics.productRevenuePaise)}</strong></span>
                </div>
              </div>
            </div>

            {/* Expenses (Section 30) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Today's Expenses
                </span>
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-rose-400">
                  {formatINR(data.metrics.todayExpensesPaise)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Operational costs & purchases</p>
              </div>
            </div>

            {/* Net Result (Section 31) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Today's Net Result
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p
                  className={`text-2xl font-black ${
                    data.metrics.netResultPaise >= 0 ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {formatINR(data.metrics.netResultPaise)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Revenue minus expenses</p>
              </div>
            </div>

            {/* Appointments Overview (Section 37) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Today's Bookings
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {data.metrics.todayAppointments}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  <span className="text-emerald-400 font-bold">{data.metrics.completedAppointments} Done</span> &bull;{' '}
                  <span className="text-amber-400 font-bold">{data.metrics.pendingAppointments} Active</span> &bull;{' '}
                  <span className="text-slate-300">{data.metrics.todayCustomers} Client(s)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Today's Live Queue & Worker Summary Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Queue (2 Cols) */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Today's Live Queue
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time shop floor appointments</p>
                </div>
                <Link
                  href="/admin/appointments"
                  className="text-xs text-amber-400 hover:underline font-semibold flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.appointments.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                  No appointments scheduled for today yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.appointments.slice(0, 6).map((apt) => {
                    const isBusy = updatingId === apt.id;
                    const serviceDisplay =
                      typeof apt.services === 'string'
                        ? apt.services
                        : Array.isArray(apt.services)
                        ? apt.services.map((s: any) => s.serviceName).join(', ')
                        : 'Custom';

                    return (
                      <div
                        key={apt.id}
                        className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className="font-mono text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                              {apt.startTime} - {apt.endTime}
                            </span>
                            <span className="font-bold text-sm text-white">
                              {apt.customerName}
                            </span>
                            {apt.customerPhone && (
                              <span className="text-xs text-slate-400">
                                ({apt.customerPhone})
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>
                              Barber:{' '}
                              <strong className="text-slate-200">
                                {apt.workerName}
                              </strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              Services: <strong className="text-slate-300">{serviceDisplay}</strong>
                            </span>
                            <span>&bull;</span>
                            <span className="text-amber-300 font-semibold">
                              {formatINR(apt.totalAmountPaise)}
                            </span>
                          </div>
                        </div>

                        {/* Status Progression Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              apt.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : apt.status === 'in_service'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : apt.status === 'checked_in'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {apt.status.replace('_', ' ')}
                          </span>

                          {apt.status === 'booked' && (
                            <button
                              disabled={isBusy}
                              onClick={() => updateStatus(apt.id, 'checked_in')}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-semibold border border-blue-500/40"
                            >
                              Check In
                            </button>
                          )}
                          {apt.status === 'checked_in' && (
                            <button
                              disabled={isBusy}
                              onClick={() => updateStatus(apt.id, 'in_service')}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40"
                            >
                              Start
                            </button>
                          )}
                          {apt.status === 'in_service' && (
                            <button
                              disabled={isBusy}
                              onClick={() => updateStatus(apt.id, 'completed')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/40"
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Worker Performance Snapshot (Section 32) (1 Col) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    Barber Daily Stats
                  </h2>
                  <Link
                    href="/admin/reports?type=workers"
                    className="text-xs text-amber-400 hover:underline font-semibold"
                  >
                    Details
                  </Link>
                </div>

                <div className="space-y-3">
                  {data.workerPerformance.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No worker metrics recorded today.
                    </div>
                  ) : (
                    data.workerPerformance.map((wp) => (
                      <div
                        key={wp.workerId}
                        className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center">
                            {wp.displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{wp.displayName}</p>
                            <p className="text-[10px] text-slate-400">
                              {wp.completedCount} done &bull; {wp.todayCustomers} client(s)
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-bold text-emerald-400">
                            {formatINR(wp.revenuePaise)}
                          </p>
                          <p className="text-[10px] text-slate-500">Revenue</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Checkout Link */}
              <div className="pt-4 mt-4 border-t border-slate-800/80">
                <Link
                  href="/admin/billing"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <DollarSign className="w-4 h-4" /> Open POS Billing Checkout
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
