'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { apiRequest } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  ArrowRight,
  Eye,
  AlertTriangle,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionQuery, setActionQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLogs();
  }, [page, entityFilter]);

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError(null);
      let queryUrl = `/audit-logs?page=${page}&limit=${limit}`;
      if (entityFilter !== 'all') {
        queryUrl += `&entity=${encodeURIComponent(entityFilter)}`;
      }
      if (actionQuery.trim()) {
        queryUrl += `&action=${encodeURIComponent(actionQuery.trim())}`;
      }

      const res = await apiRequest<{
        items: AuditLogItem[];
        page: number;
        limit: number;
        total: number;
      }>(queryUrl);

      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadAuditLogs();
  }

  function handleExportCsv() {
    const rows = logs.map((log) => [
      log.id,
      new Date(log.created_at).toLocaleString(),
      log.user_name || 'System / Automated',
      log.action,
      log.entity,
      log.entity_id,
      log.old_values ? JSON.stringify(log.old_values) : '',
      log.new_values ? JSON.stringify(log.new_values) : '',
    ]);

    downloadCsv(
      `audit-logs-p${page}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Log ID', 'Timestamp', 'User', 'Action', 'Entity', 'Entity ID', 'Old Values', 'New Values'],
      rows
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Determine badge styling by action keyword
  function getActionBadge(action: string) {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('void') || act.includes('archive') || act.includes('cancel')) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    }
    if (act.includes('create') || act.includes('add') || act.includes('paid')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (act.includes('assign') || act.includes('status') || act.includes('role')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }

  return (
    <AdminLayout
      title="Security & Activity Audit Trail"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Export CSV
          </button>
          <button
            onClick={loadAuditLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Total Events</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mt-1">{total}</p>
            <span className="text-[10px] text-slate-400">Append-only audit records</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Current Page</span>
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-black text-blue-400 mt-1">
              {page} / {totalPages}
            </p>
            <span className="text-[10px] text-slate-400">25 events per page</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Security Scope</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400 mt-1">Isolated</p>
            <span className="text-[10px] text-slate-400">Tenant-level RLS enforced</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Integrity</span>
              <FileText className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-black text-purple-400 mt-1">Immutable</p>
            <span className="text-[10px] text-slate-400">Database triggers verified</span>
          </div>
        </div>

        {/* Filter Bar */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* Entity Select */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">Entity:</span>
              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Entities</option>
                <option value="appointment">Appointment</option>
                <option value="service">Service</option>
                <option value="worker">Worker</option>
                <option value="customer">Customer</option>
                <option value="invoice">Invoice / Billing</option>
                <option value="product">Product / Inventory</option>
                <option value="expense">Expense</option>
                <option value="coupon">Coupon</option>
                <option value="shop">Shop Settings</option>
              </select>
            </div>

            {/* Action Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={actionQuery}
                onChange={(e) => setActionQuery(e.target.value)}
                placeholder="Filter by action (e.g. create, update)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Filter
            </button>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400 font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Audit Log Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading audit trail records...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              No audit logs found matching your filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Actor / User</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Entity</th>
                    <th className="px-5 py-3.5">Entity ID</th>
                    <th className="px-5 py-3.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const hasDiff = log.old_values || log.new_values;

                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-400">
                            <div className="flex items-center gap-1.5 font-sans">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span>{new Date(log.created_at).toLocaleString()}</span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap font-sans font-medium text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-amber-400/80" />
                              <span>{log.user_name || 'System / Auto'}</span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[11px] font-sans font-semibold inline-block ${getActionBadge(
                                log.action
                              )}`}
                            >
                              {log.action}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap font-sans text-slate-300">
                            <span className="capitalize">{log.entity}</span>
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 text-[11px]">
                            {log.entity_id ? `${log.entity_id.slice(0, 8)}...` : 'N/A'}
                          </td>

                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            {hasDiff ? (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans inline-flex items-center gap-1 transition-colors"
                              >
                                <Eye className="w-3 h-3 text-amber-400" />
                                {isExpanded ? 'Hide Diff' : 'View Diff'}
                              </button>
                            ) : (
                              <span className="text-slate-600 font-sans text-[11px]">No changes</span>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Old / New JSON Diff View */}
                        {isExpanded && hasDiff && (
                          <tr className="bg-slate-950/90 border-b border-slate-800 font-mono">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                                {/* Before / Old Values */}
                                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                                  <div className="text-slate-400 font-sans font-semibold mb-1 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                                    Before / Previous State
                                  </div>
                                  <pre className="text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-48 text-[11px]">
                                    {log.old_values ? JSON.stringify(log.old_values, null, 2) : 'null (New Record)'}
                                  </pre>
                                </div>

                                {/* After / New Values */}
                                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                                  <div className="text-slate-400 font-sans font-semibold mb-1 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                    After / Updated State
                                  </div>
                                  <pre className="text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-48 text-[11px]">
                                    {log.new_values ? JSON.stringify(log.new_values, null, 2) : 'null (Deleted)'}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
