'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Package,
  Plus,
  AlertTriangle,
  ArrowDownRight,
  SlidersHorizontal,
  History,
  CheckCircle2,
  X,
  Search,
  RefreshCw,
  TrendingDown,
  DollarSign,
  Download,
} from 'lucide-react';

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  categoryName?: string;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQuantity: number;
  lowStockThreshold: number;
  supplierName: string | null;
  status: string;
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [stockInProduct, setStockInProduct] = useState<ProductItem | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<ProductItem | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductItem | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Add Product Form
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdSelling, setNewProdSelling] = useState('');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdStock, setNewProdStock] = useState('0');
  const [newProdThreshold, setNewProdThreshold] = useState('5');
  const [submittingProd, setSubmittingProd] = useState(false);

  // Stock In Form (Rule 51)
  const [stockInQty, setStockInQty] = useState('');
  const [stockInUnitCost, setStockInUnitCost] = useState('');
  const [stockInSupplier, setStockInSupplier] = useState('');
  const [stockInInvoiceRef, setStockInInvoiceRef] = useState('');
  const [createLinkedExpense, setCreateLinkedExpense] = useState(true);
  const [submittingStockIn, setSubmittingStockIn] = useState(false);

  // Adjust Form
  const [adjustType, setAdjustType] = useState<'damage' | 'wastage' | 'adjustment'>('adjustment');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const res = await apiRequest<{ categories: any[] }>('/products/categories');
      setCategories(res.categories || []);
    } catch {}
  }

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ items: any[] }>('/products?limit=100');
      const normalized = (res.items || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        categoryId: p.categoryId ?? p.category_id,
        categoryName: p.categoryName ?? p.category_name,
        sellingPricePaise: p.sellingPricePaise ?? p.selling_price_paise,
        costPricePaise: p.costPricePaise ?? p.cost_price_paise,
        stockQuantity: p.stockQuantity ?? p.stock_quantity,
        lowStockThreshold: p.lowStockThreshold ?? p.low_stock_threshold,
        supplierName: p.supplierName ?? p.supplier_name,
        status: p.status,
      }));
      setProducts(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim()) return;

    try {
      setSubmittingProd(true);
      await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: newProdName.trim(),
          sku: newProdSku.trim().toUpperCase(),
          sellingPricePaise: Math.round((parseFloat(newProdSelling) || 0) * 100),
          costPricePaise: Math.round((parseFloat(newProdCost) || 0) * 100),
          initialStock: parseInt(newProdStock) || 0,
          lowStockThreshold: parseInt(newProdThreshold) || 5,
        }),
      });

      setShowAddProductModal(false);
      setNewProdName('');
      setNewProdSku('');
      setNewProdSelling('');
      setNewProdCost('');
      setNewProdStock('0');
      setNewProdThreshold('5');
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to add product');
    } finally {
      setSubmittingProd(false);
    }
  }

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault();
    if (!stockInProduct) return;
    const qty = parseInt(stockInQty);
    if (!qty || qty <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }

    try {
      setSubmittingStockIn(true);
      await apiRequest('/inventory/stock-in', {
        method: 'POST',
        body: JSON.stringify({
          productId: stockInProduct.id,
          quantity: qty,
          unitCostPaise: stockInUnitCost
            ? Math.round(parseFloat(stockInUnitCost) * 100)
            : stockInProduct.costPricePaise,
          supplierName: stockInSupplier.trim() || undefined,
          invoiceReference: stockInInvoiceRef.trim() || undefined,
          createExpense: createLinkedExpense,
        }),
      });

      setStockInProduct(null);
      setStockInQty('');
      setStockInUnitCost('');
      setStockInSupplier('');
      setStockInInvoiceRef('');
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to record stock-in');
    } finally {
      setSubmittingStockIn(false);
    }
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustProduct) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty)) {
      alert('Please enter a valid adjustment quantity.');
      return;
    }

    try {
      setSubmittingAdjust(true);
      await apiRequest('/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: adjustProduct.id,
          type: adjustType,
          quantityChange: qty,
          notes: adjustNotes.trim() || undefined,
        }),
      });

      setAdjustProduct(null);
      setAdjustQty('');
      setAdjustNotes('');
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust stock');
    } finally {
      setSubmittingAdjust(false);
    }
  }

  async function openHistory(p: ProductItem) {
    setHistoryProduct(p);
    setHistoryLoading(true);
    try {
      const res = await apiRequest<{ transactions: any[] }>(
        `/inventory/transactions/${p.id}`
      );
      setTransactions(res.transactions || []);
    } catch {
      setTransactions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const filteredProducts = products.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  function handleExportCsv() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Units in Stock',
      'Selling Price (INR)',
      'Cost Price (INR)',
      'Total Valuation (INR)',
      'Low Stock Threshold',
      'Supplier',
      'Status',
    ];
    const rows = products.map((p) => [
      p.name,
      p.sku,
      p.categoryName || '-',
      p.stockQuantity,
      (p.sellingPricePaise / 100).toFixed(2),
      (p.costPricePaise / 100).toFixed(2),
      (((p.stockQuantity || 0) * (p.costPricePaise || 0)) / 100).toFixed(2),
      p.lowStockThreshold,
      p.supplierName || '-',
      p.status,
    ]);
    downloadCsv(`inventory_catalog_${dateStr}`, headers, rows);
  }

  return (
    <AdminLayout
      title="Products & Inventory Control"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={products.length === 0}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Export Inventory as CSV"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Export CSV
          </button>
          <button
            onClick={loadProducts}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Refresh Stock Levels"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddProductModal(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-bold">{filteredProducts.length}</span> items
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading stock levels...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Package className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            No products in catalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Product & SKU</th>
                  <th className="px-5 py-3.5">Selling Price</th>
                  <th className="px-5 py-3.5">Cost Price</th>
                  <th className="px-5 py-3.5">Current Stock</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredProducts.map((p) => {
                  const isLow = p.stockQuantity <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-sm">{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          SKU: {p.sku} {p.categoryName ? `• ${p.categoryName}` : ''}
                        </div>
                      </td>

                      <td className="px-5 py-4 font-bold text-amber-400">
                        {formatINR(p.sellingPricePaise)}
                      </td>

                      <td className="px-5 py-4 text-slate-400">
                        {formatINR(p.costPricePaise)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-black text-sm ${
                              p.stockQuantity === 0
                                ? 'text-rose-400'
                                : isLow
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {p.stockQuantity}
                          </span>
                          {isLow && (
                            <span className="p-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] flex items-center gap-1 font-bold">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Threshold: {p.lowStockThreshold}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {p.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setStockInProduct(p);
                            setStockInQty('');
                            setStockInUnitCost((p.costPricePaise / 100).toString());
                            setStockInSupplier(p.supplierName || '');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold"
                        >
                          + Stock In
                        </button>
                        <button
                          onClick={() => {
                            setAdjustProduct(p);
                            setAdjustQty('');
                            setAdjustNotes('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700"
                        >
                          Adjust
                        </button>
                        <button
                          onClick={() => openHistory(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                          title="View Movement History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Add New Product */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" /> Add Product to Catalog
              </h3>
              <button
                onClick={() => setShowAddProductModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Premium Beard Balm"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  SKU (Stock Keeping Unit) *
                </label>
                <input
                  type="text"
                  value={newProdSku}
                  onChange={(e) => setNewProdSku(e.target.value)}
                  placeholder="e.g. BB-004"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdSelling}
                    onChange={(e) => setNewProdSelling(e.target.value)}
                    placeholder="450.00"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Cost Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    placeholder="250.00"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    value={newProdStock}
                    onChange={(e) => setNewProdStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={newProdThreshold}
                    onChange={(e) => setNewProdThreshold(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProd}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingProd ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Stock In (Rule 51: Purchase Stock-In to Expense Linkage) */}
      {stockInProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-emerald-400" />
                Stock In: {stockInProduct.name}
              </h3>
              <button
                onClick={() => setStockInProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStockIn} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Units Received *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={stockInQty}
                    onChange={(e) => setStockInQty(e.target.value)}
                    placeholder="e.g. 10"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Unit Cost Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={stockInUnitCost}
                    onChange={(e) => setStockInUnitCost(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={stockInSupplier}
                  onChange={(e) => setStockInSupplier(e.target.value)}
                  placeholder="e.g. Urban Grooming Distro"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Supplier Invoice Reference
                </label>
                <input
                  type="text"
                  value={stockInInvoiceRef}
                  onChange={(e) => setStockInInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-9042"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Automatic Expense Linkage (Rule 51) */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={createLinkedExpense}
                    onChange={(e) => setCreateLinkedExpense(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>
                    Auto-record in Shop Expenses ({formatINR(
                      (parseInt(stockInQty) || 0) * (parseFloat(stockInUnitCost) || 0) * 100
                    )})
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 mt-1 pl-5">
                  Seamlessly updates your Income & Expense Net Result without manual double-entry.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStockInProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStockIn}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  {submittingStockIn ? 'Recording...' : 'Confirm Stock-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Stock Adjustment (Damage / Wastage) */}
      {adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                Adjust Stock: {adjustProduct.name}
              </h3>
              <button
                onClick={() => setAdjustProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Adjustment Reason
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="damage">Damage (Accidental broken bottle, spill)</option>
                  <option value="wastage">Wastage (Expired stock, salon use)</option>
                  <option value="adjustment">Physical Audit Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Quantity Change (e.g. -2 for damage, +3 for found stock)
                </label>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="-1"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Reason for discrepancy..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingAdjust ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Transaction Movement History */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                Stock Log: {historyProduct.name}
              </h3>
              <button
                onClick={() => setHistoryProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
              {historyLoading ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Loading movements...
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No stock movements recorded.
                </div>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold uppercase text-[10px] text-amber-400 mr-2">
                        {tx.type}
                      </span>
                      <span className="text-slate-300">
                        {new Date(tx.created_at || tx.createdAt).toLocaleString()}
                      </span>
                      {tx.notes && (
                        <p className="text-[10px] text-slate-500 mt-0.5">{tx.notes}</p>
                      )}
                    </div>
                    <div
                      className={`font-black text-sm ${
                        tx.quantity_change > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.quantity_change > 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
