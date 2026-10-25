'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest, formatINR } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  CreditCard,
  Plus,
  Trash2,
  QrCode,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Package,
  User,
  Clock,
  Printer,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';

interface InvoiceLineItem {
  type: 'service' | 'product';
  itemId?: string;
  itemName: string;
  quantity: number;
  unitPricePaise: number;
}

interface CompletedInvoice {
  id: string;
  invoiceNumber: string;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  paymentStatus: string;
  createdAt: string;
  items: Array<{
    itemName: string;
    itemType: string;
    quantity: number;
    unitPricePaise: number;
    totalPricePaise: number;
  }>;
}

export default function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // POS State
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);

  // Line items
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [discountPaise, setDiscountPaise] = useState<number>(0);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr'>('cash');
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [upiRef, setUpiRef] = useState<string>('');

  // Available catalog
  const [services, setServices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);

  // Submitting
  const [loading, setLoading] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<CompletedInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invoice History State
  const [invoices, setInvoices] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadCatalog();
    loadUnbilledAppointments();
  }, []);

  async function loadCatalog() {
    try {
      const [sRes, pRes, wRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/services?limit=100'),
        apiRequest<{ items: any[] }>('/products?activeOnly=true&limit=100'),
        apiRequest<{ items: any[] }>('/workers?limit=100'),
      ]);
      setServices(sRes.items || []);
      setProducts(pRes.items || []);
      setWorkers(wRes.items || []);
    } catch {
      // Catalogs load gracefully
    }
  }

  async function loadUnbilledAppointments() {
    try {
      const res = await apiRequest<{ items: any[] }>(
        '/appointments?status=in_service&limit=50'
      );
      setAppointments(res.items || []);
    } catch {
      // Appointments load gracefully
    }
  }

  async function loadInvoiceHistory() {
    try {
      setHistoryLoading(true);
      const res = await apiRequest<{ items: any[] }>('/billing/invoices?limit=50');
      setInvoices(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleSelectAppointment(aptId: string) {
    setSelectedAppointmentId(aptId);
    const apt = appointments.find((a) => a.id === aptId);
    if (!apt) return;

    setCustomerName(apt.customerName);
    setCustomerPhone(apt.customerPhone);
    setCustomerId(apt.customerId);
    setWorkerId(apt.workerId);

    // populate line items from appointment services
    const aptItems: InvoiceLineItem[] = apt.services.map((s: any) => ({
      type: 'service',
      itemId: s.serviceId,
      itemName: s.serviceName,
      quantity: 1,
      unitPricePaise: s.unitPricePaise,
    }));
    setItems(aptItems);
  }

  function addServiceItem(serviceId: string) {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    setItems([
      ...items,
      {
        type: 'service',
        itemId: s.id,
        itemName: s.name,
        quantity: 1,
        unitPricePaise: s.pricePaise,
      },
    ]);
  }

  function addProductItem(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const existing = items.find((i) => i.itemId === p.id && i.type === 'product');
    if (existing) {
      setItems(
        items.map((i) =>
          i.itemId === p.id && i.type === 'product'
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          type: 'product',
          itemId: p.id,
          itemName: p.name,
          quantity: 1,
          unitPricePaise: p.sellingPricePaise ?? p.selling_price_paise,
        },
      ]);
    }
  }

  function removeItem(index: number) {
    setItems(items.filter((_, idx) => idx !== index));
  }

  const subtotalPaise = items.reduce(
    (acc, it) => acc + it.quantity * it.unitPricePaise,
    0
  );
  const totalPaise = Math.max(0, subtotalPaise - discountPaise);
  const changeDuePaise = Math.max(0, cashTendered * 100 - totalPaise);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      alert('Please add at least one line item (service or product).');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Create Invoice
      const invoice = await apiRequest<any>('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: selectedAppointmentId || undefined,
          customerId: customerId || undefined,
          workerId: workerId || undefined,
          discountPaise,
          items,
        }),
      });

      // 2. Record Payment
      if (totalPaise > 0) {
        await apiRequest(`/billing/invoices/${invoice.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            method: paymentMethod,
            amountPaise: totalPaise,
            transactionReference: upiRef.trim() || undefined,
          }),
        });
      }

      // 3. Mark appointment completed if linked
      if (selectedAppointmentId) {
        await apiRequest(`/appointments/${selectedAppointmentId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'completed' }),
        }).catch(() => {});
      }

      setSuccessInvoice({
        ...invoice,
        paymentStatus: 'paid',
      });

      // Reset
      setItems([]);
      setSelectedAppointmentId('');
      setCustomerName('');
      setCustomerPhone('');
      setDiscountPaise(0);
      setCashTendered(0);
      setUpiRef('');
      loadUnbilledAppointments();
    } catch (err: any) {
      setError(err.message || 'Payment processing failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout
      title="Point of Sale & Billing"
      actions={
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'pos'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            New Checkout
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              loadInvoiceHistory();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Invoice History
          </button>
        </div>
      }
    >
      {activeTab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLS: Selection & Itemization */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Link from Chair Appointment */}
            {appointments.length > 0 && !selectedAppointmentId && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase text-amber-400 mb-2.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Ready for Checkout from Salon Chair
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {appointments.slice(0, 4).map((apt) => (
                    <button
                      key={apt.id}
                      onClick={() => handleSelectAppointment(apt.id)}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-left transition-all text-xs"
                    >
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>{apt.customerName}</span>
                        <span className="text-amber-400 font-bold">
                          {formatINR(apt.totalAmountPaise)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {apt.workerName || 'Staff'} &bull;{' '}
                        {apt.services.map((s: any) => s.serviceName).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer & Staff Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" /> Customer & Stylist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Client"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+91..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Barber / Stylist</label>
                  <select
                    value={workerId || ''}
                    onChange={(e) => setWorkerId(e.target.value || null)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select Barber...</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Catalog Adder */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-amber-400" /> Services & In-Shop Retail Products
                </h3>
              </div>

              {/* Service Buttons */}
              <div>
                <p className="text-[11px] text-slate-400 mb-2 font-semibold">Services</p>
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addServiceItem(s.id)}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-xs text-left transition-all"
                    >
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-[10px] text-amber-400 font-bold">
                        {formatINR(s.pricePaise)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Buttons */}
              <div>
                <p className="text-[11px] text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-400" /> Retail Products (Auto-deducts stock)
                </p>
                <div className="flex flex-wrap gap-2">
                  {products.map((p) => {
                    const price = p.sellingPricePaise ?? p.selling_price_paise;
                    const stock = p.stockQuantity ?? p.stock_quantity;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProductItem(p.id)}
                        disabled={stock <= 0}
                        className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-xs text-left transition-all"
                      >
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                          <span className="text-amber-400 font-bold">{formatINR(price)}</span>
                          <span className="text-slate-500">({stock} in stock)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-4">
                Invoice Line Items ({items.length})
              </h3>

              {items.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No line items added yet. Click on any service or product above to add.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            it.type === 'service'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {it.type}
                        </span>
                        <span className="font-bold text-white">{it.itemName}</span>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-slate-400">
                          <span>Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setItems(
                                items.map((x, i) => (i === idx ? { ...x, quantity: val } : x))
                              );
                            }}
                            className="w-12 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center text-white"
                          />
                        </div>

                        <span className="font-bold text-amber-400 w-20 text-right">
                          {formatINR(it.quantity * it.unitPricePaise)}
                        </span>

                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 1 COL: Checkout Summary & Payment */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" /> Payment & Receipt
              </h3>

              {/* Price Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-slate-200">{formatINR(subtotalPaise)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Discount (₹):</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountPaise / 100 || ''}
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setDiscountPaise(Math.round(val * 100));
                    }}
                    className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-right text-xs text-white"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between text-base font-black text-white">
                  <span>Grand Total:</span>
                  <span className="text-amber-400">{formatINR(totalPaise)}</span>
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" /> Cash Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi_qr')}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'upi_qr'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <QrCode className="w-5 h-5" /> UPI QR Code
                  </button>
                </div>
              </div>

              {/* Cash Calculation */}
              {paymentMethod === 'cash' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Cash Tendered (₹):</span>
                    <input
                      type="number"
                      value={cashTendered || ''}
                      onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-right text-white font-bold"
                    />
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Change Due:</span>
                    <span className="font-bold text-emerald-400">
                      {formatINR(changeDuePaise)}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI QR Display (Rule 28) */}
              {paymentMethod === 'upi_qr' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-3">
                  <p className="text-xs font-semibold text-slate-300">
                    Scan using Google Pay, PhonePe, Paytm, or BHIM
                  </p>
                  <div className="w-44 h-44 bg-white rounded-2xl p-2 mx-auto flex items-center justify-center shadow-lg">
                    {/* Live Shop UPI QR or placeholder fallback */}
                    <img
                      src="/api/v1/shops/upi-qr"
                      alt="Shop UPI QR"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=classicbarber@upi&pn=Classic%20Barber&am=${totalPaise / 100}&cu=INR`;
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-amber-400 font-bold">
                    Amount to Pay: {formatINR(totalPaise)}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                      placeholder="Optional UPI UTR / Txn Ref"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                disabled={loading || items.length === 0}
                onClick={handleCheckout}
                className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 text-slate-950 font-black text-sm uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Complete & Print Invoice
                  </>
                )}
              </button>
            </div>

            {/* Success Receipt Modal / Card */}
            {successInvoice && (
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-3xl p-5 shadow-2xl text-emerald-200 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Invoice Paid!
                  </span>
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1 text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                </div>
                <p>
                  Invoice #{successInvoice.invoiceNumber} recorded successfully. Product inventory updated.
                </p>
                <div className="text-right font-black text-base text-white">
                  Total: {formatINR(successInvoice.totalPaise)}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* INVOICE HISTORY TAB */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
          {historyLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
              Loading invoice history...
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No invoices generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Invoice #</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Items</th>
                    <th className="px-5 py-3.5">Total Amount</th>
                    <th className="px-5 py-3.5">Payment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40">
                      <td className="px-5 py-4 font-mono font-bold text-amber-400">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-400">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 font-semibold text-white">
                        {inv.customerName || 'Walk-In'}
                      </td>
                      <td className="px-5 py-4">
                        {inv.items?.length || 0} items
                      </td>
                      <td className="px-5 py-4 font-bold text-white">
                        {formatINR(inv.totalPaise)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            inv.paymentStatus === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : inv.paymentStatus === 'void'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
