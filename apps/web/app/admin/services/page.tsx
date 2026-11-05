'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Scissors,
  Plus,
  Clock,
  Tag,
  CheckCircle2,
  X,
  RefreshCw,
  Edit2,
  Archive,
  RotateCcw,
  Download,
  Users,
  Search,
  FolderPlus,
  Trash2,
  Check,
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
  archived?: boolean;
  workerIds: string[];
}

interface CategoryItem {
  id: string;
  name: string;
  sortOrder: number;
  serviceCount: number;
}

interface WorkerItem {
  id: string;
  displayName: string;
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Modal: Add Service
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal: Edit Service
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editPriceRupees, setEditPriceRupees] = useState('');
  const [editDurationMinutes, setEditDurationMinutes] = useState('30');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal: Stylist Assignment
  const [assigningService, setAssigningService] = useState<ServiceItem | null>(null);
  const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[]>([]);
  const [savingWorkers, setSavingWorkers] = useState(false);

  // Modal: Category Manager
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSortOrder, setNewCatSortOrder] = useState('0');
  const [savingCat, setSavingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatSort, setEditingCatSort] = useState('0');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadServices(), loadCategories(), loadWorkers()]);
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await apiRequest<any>('/services/categories');
      const list = Array.isArray(res) ? res : res.categories || [];
      setCategories(
        list.map((c: any) => ({
          id: c.id,
          name: c.name,
          sortOrder: Number(c.sortOrder ?? c.sort_order ?? 0),
          serviceCount: Number(c.serviceCount ?? 0),
        }))
      );
    } catch {}
  }

  async function loadWorkers() {
    try {
      const res = await apiRequest<{ items: any[] }>('/workers?limit=100');
      setWorkers(
        (res.items || []).map((w: any) => ({
          id: w.id,
          displayName: w.displayName ?? w.display_name,
        }))
      );
    } catch {}
  }

  async function loadServices() {
    try {
      // Include archived so we can toggle in UI
      const res = await apiRequest<{ items: any[] }>('/services?limit=100&includeArchived=true');
      setServices(
        (res.items || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          categoryId: s.categoryId ?? s.category_id,
          categoryName: s.categoryName ?? s.category_name,
          description: s.description,
          durationMinutes: s.durationMin ?? s.durationMinutes ?? s.duration_min ?? 30,
          pricePaise: s.pricePaise ?? s.price_paise,
          status: s.status,
          archived: s.archived ?? !!s.archived_at,
          workerIds: s.workerIds || s.worker_ids || [],
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load services.');
    }
  }

  // Filtered Services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      // Status filter
      if (statusFilter === 'active' && s.archived) return false;
      if (statusFilter === 'archived' && !s.archived) return false;

      // Category filter
      if (selectedCategory !== 'all' && s.categoryId !== selectedCategory) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesc = s.description?.toLowerCase().includes(q);
        const matchesCat = s.categoryName?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      return true;
    });
  }, [services, statusFilter, selectedCategory, search]);

  // Handle Add Service
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
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to create service');
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Open Edit Modal
  function openEditModal(s: ServiceItem) {
    setEditingService(s);
    setEditName(s.name);
    setEditCategoryId(s.categoryId || '');
    setEditPriceRupees((s.pricePaise / 100).toFixed(2));
    setEditDurationMinutes(String(s.durationMinutes));
    setEditDescription(s.description || '');
    setEditStatus((s.status as any) === 'inactive' ? 'inactive' : 'active');
  }

  // Handle Save Edit
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingService || !editName.trim() || !editPriceRupees) return;

    try {
      setSavingEdit(true);
      await apiRequest(`/services/${editingService.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          categoryId: editCategoryId || null,
          durationMinutes: parseInt(editDurationMinutes) || 30,
          pricePaise: Math.round(parseFloat(editPriceRupees) * 100),
          description: editDescription.trim() || null,
          status: editStatus,
        }),
      });

      setEditingService(null);
      await loadServices();
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to update service');
    } finally {
      setSavingEdit(false);
    }
  }

  // Handle Archive Service
  async function handleArchiveService(id: string, serviceName: string) {
    if (!confirm(`Are you sure you want to archive "${serviceName}"? It will no longer be visible for booking.`)) return;

    try {
      await apiRequest(`/services/${id}`, { method: 'DELETE' });
      await loadServices();
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to archive service');
    }
  }

  // Handle Restore Service
  async function handleRestoreService(id: string) {
    try {
      await apiRequest(`/services/${id}/restore`, { method: 'POST' });
      await loadServices();
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to restore service');
    }
  }

  // Handle Open Assign Stylists Modal
  function openAssignModal(s: ServiceItem) {
    setAssigningService(s);
    setAssignedWorkerIds(s.workerIds || []);
  }

  // Handle Save Stylist Assignments
  async function handleSaveWorkers(e: React.FormEvent) {
    e.preventDefault();
    if (!assigningService) return;

    try {
      setSavingWorkers(true);
      await apiRequest(`/services/${assigningService.id}/workers`, {
        method: 'PUT',
        body: JSON.stringify({ ids: assignedWorkerIds }),
      });

      setAssigningService(null);
      await loadServices();
    } catch (err: any) {
      alert(err.message || 'Failed to update assigned stylists');
    } finally {
      setSavingWorkers(false);
    }
  }

  // Handle Create Category
  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setSavingCat(true);
      await apiRequest('/services/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          sortOrder: parseInt(newCatSortOrder) || 0,
        }),
      });
      setNewCatName('');
      setNewCatSortOrder('0');
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to create category');
    } finally {
      setSavingCat(false);
    }
  }

  // Handle Update Category
  async function handleUpdateCategory(id: string) {
    if (!editingCatName.trim()) return;
    try {
      await apiRequest(`/services/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingCatName.trim(),
          sortOrder: parseInt(editingCatSort) || 0,
        }),
      });
      setEditingCatId(null);
      await loadCategories();
      await loadServices();
    } catch (err: any) {
      alert(err.message || 'Failed to update category');
    }
  }

  // Handle Delete Category
  async function handleDeleteCategory(id: string, count: number) {
    if (count > 0) {
      alert(`Cannot delete this category because it holds ${count} service(s). Reassign them first.`);
      return;
    }
    if (!confirm('Are you sure you want to delete this empty category?')) return;

    try {
      await apiRequest(`/services/categories/${id}`, { method: 'DELETE' });
      await loadCategories();
      if (selectedCategory === id) setSelectedCategory('all');
    } catch (err: any) {
      alert(err.message || 'Failed to delete category');
    }
  }

  // Export to CSV
  function handleExportCsv() {
    downloadCsv(
      `services-catalog-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Service Name', 'Category', 'Duration (Mins)', 'Price (INR)', 'Status', 'Archived', 'Assigned Stylists Count', 'Description'],
      filteredServices.map((s) => [
        s.name,
        s.categoryName || 'General Grooming',
        s.durationMinutes,
        (s.pricePaise / 100).toFixed(2),
        s.status,
        s.archived ? 'Yes' : 'No',
        s.workerIds.length,
        s.description || '',
      ])
    );
  }

  return (
    <AdminLayout
      title="Salon Services & Pricing"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            title="Refresh Services"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredServices.length === 0}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs inline-flex items-center gap-1.5 transition disabled:opacity-50"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-amber-500" /> Export CSV
          </button>

          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs inline-flex items-center gap-1.5 transition"
            title="Manage Categories"
          >
            <Tag className="w-4 h-4 text-amber-400" /> Categories
          </button>

          <button
            onClick={() => {
              if (categories.length > 0 && !categoryId) setCategoryId(categories[0].id);
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Add Service
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
              placeholder="Search services by name or description..."
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Categories ({services.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.serviceCount})
              </option>
            ))}
          </select>

          {/* Status Toggle Filter */}
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
      </div>

      {/* SERVICES TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading catalog services...
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Scissors className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No services match your filters.
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
                  <th className="px-5 py-3.5">Assigned Stylists</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredServices.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>{s.name}</span>
                        {s.archived && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Archived
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 max-w-sm">
                          {s.description}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px] font-medium">
                        {s.categoryName || 'General Grooming'}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-mono text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {s.durationMinutes} mins
                      </span>
                    </td>

                    <td className="px-5 py-4 font-black text-amber-400 text-sm">
                      {formatINR(s.pricePaise)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => openAssignModal(s)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition text-[11px]"
                        title="Configure eligible stylists for this service"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {s.workerIds.length === 0
                            ? 'All Barbers'
                            : `${s.workerIds.length} Barber${s.workerIds.length > 1 ? 's' : ''}`}
                        </span>
                      </button>
                    </td>

                    <td className="px-5 py-4">
                      {s.archived ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                          Archived
                        </span>
                      ) : s.status === 'active' ? (
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
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Edit Service"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {s.archived ? (
                          <button
                            onClick={() => handleRestoreService(s.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition"
                            title="Restore Service"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchiveService(s.id, s.name)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                            title="Archive Service"
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

      {/* MODAL 1: Add Service */}
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
                  <option value="">General Grooming</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={priceRupees}
                    onChange={(e) => setPriceRupees(e.target.value)}
                    placeholder="350"
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
                    max="480"
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

      {/* MODAL 2: Edit Service */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-400" /> Edit Service
              </h3>
              <button
                onClick={() => setEditingService(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">General Grooming</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={editPriceRupees}
                    onChange={(e) => setEditPriceRupees(e.target.value)}
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
                    max="480"
                    value={editDurationMinutes}
                    onChange={(e) => setEditDurationMinutes(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
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
                  <option value="active">Active (Available for booking)</option>
                  <option value="inactive">Inactive (Hidden from booking)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Stylist Assignment (PUT /services/:id/workers) */}
      {assigningService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                Assign Stylists: {assigningService.name}
              </h3>
              <button
                onClick={() => setAssigningService(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWorkers} className="mt-4 space-y-4">
              <p className="text-xs text-slate-400">
                Select the barbers qualified to perform this service. Only selected barbers will be offered during booking.
              </p>

              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>{assignedWorkerIds.length} of {workers.length} Barbers Selected</span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setAssignedWorkerIds(workers.map((w) => w.id))}
                    className="text-amber-400 hover:underline text-[11px]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignedWorkerIds([])}
                    className="text-slate-400 hover:underline text-[11px]"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                {workers.map((w) => {
                  const isChecked = assignedWorkerIds.includes(w.id);
                  return (
                    <label
                      key={w.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-500 text-white font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-[10px] text-amber-400 font-black">
                          {w.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{w.displayName}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setAssignedWorkerIds(assignedWorkerIds.filter((id) => id !== w.id));
                          } else {
                            setAssignedWorkerIds([...assignedWorkerIds, w.id]);
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
                  onClick={() => setAssigningService(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWorkers}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {savingWorkers ? 'Saving...' : 'Save Stylists'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Category Management */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" /> Manage Service Categories
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create Category Form */}
            <form onSubmit={handleCreateCategory} className="mt-4 pb-4 border-b border-slate-800">
              <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1.5">
                Add New Category
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Hair Treatments, Beard Care..."
                  required
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <input
                  type="number"
                  value={newCatSortOrder}
                  onChange={(e) => setNewCatSortOrder(e.target.value)}
                  placeholder="Order"
                  className="w-20 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white text-center focus:outline-none focus:border-amber-500"
                  title="Display Sort Order"
                />
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </form>

            {/* Existing Categories List */}
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No custom categories. Services default to General Grooming.
                </div>
              ) : (
                categories.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs"
                  >
                    {editingCatId === c.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                        <input
                          type="number"
                          value={editingCatSort}
                          onChange={(e) => setEditingCatSort(e.target.value)}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateCategory(c.id)}
                          className="p-1 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{c.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            {c.serviceCount} service{c.serviceCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            sort: {c.sortOrder}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditingCatName(c.name);
                              setEditingCatSort(String(c.sortOrder));
                            }}
                            className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                            title="Rename Category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c.id, c.serviceCount)}
                            className="p-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            title="Delete Category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
