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
  Crown,
  Award,
  Sparkles,
  Tag,
  Ticket,
  X,
  Check,
} from 'lucide-react';
import {
  CustomerMembership,
  CustomerLoyaltySummary,
  LoyaltySettings,
} from '@barbershop/shared';

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

  // Customer Catalog & Search
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Phase 2: Loyalty & Memberships State
  const [customerLoyalty, setCustomerLoyalty] = useState<CustomerLoyaltySummary | null>(null);
  const [activeMembership, setActiveMembership] = useState<CustomerMembership | null>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);

  // Line items & Manual/VIP discount
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [discountPaise, setDiscountPaise] = useState<number>(0);
  const [tipPaise, setTipPaise] = useState<number>(0);

  // Phase 4: Coupon / Promo State
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponDiscountPaise, setCouponDiscountPaise] = useState<number>(0);
  const [couponLoading, setCouponLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'razorpay'>('cash');
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

  // When customerId changes, load loyalty and membership details
  useEffect(() => {
    if (customerId) {
      loadCustomerPerks(customerId);
    } else {
      setCustomerLoyalty(null);
      setActiveMembership(null);
      setRedeemPoints(0);
    }
  }, [customerId]);

  async function loadCustomerPerks(cId: string) {
    try {
      const [loyaltyRes, memRes] = await Promise.all([
        apiRequest<CustomerLoyaltySummary>(`/loyalty/customer/${cId}`).catch(() => null),
        apiRequest<CustomerMembership | null>(`/memberships/customer/${cId}/active`).catch(() => null),
      ]);
      setCustomerLoyalty(loyaltyRes);
      setActiveMembership(memRes);
      setRedeemPoints(0);
    } catch {
      // Perks load gracefully
    }
  }

  async function loadCatalog() {
    try {
      const [sRes, pRes, wRes, cRes, setRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/services?limit=100').catch(() => ({ items: [] })),
        apiRequest<{ items: any[] }>('/products?activeOnly=true&limit=100').catch(() => ({ items: [] })),
        apiRequest<{ items: any[] }>('/workers?limit=100').catch(() => ({ items: [] })),
        apiRequest<{ items: any[] }>('/customers?limit=100').catch(() => ({ items: [] })),
        apiRequest<LoyaltySettings>('/loyalty/settings').catch(() => null),
      ]);
      setServices(sRes.items || []);
      setProducts(pRes.items || []);
      setWorkers(wRes.items || []);
      setAllCustomers(cRes.items || []);
      if (setRes) setLoyaltySettings(setRes);
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
    setCustomerPhone(apt.customerPhone || '');
    setCustomerId(apt.customerId || null);
    setWorkerId(apt.workerId || null);

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

  function handleSelectCustomer(c: any) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || '');
    if (c.preferredWorkerId) {
      setWorkerId(c.preferredWorkerId);
    }
    setShowCustomerDropdown(false);
    setCustomerSearchQuery('');
  }

  function handleClearCustomer() {
    setCustomerId(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerLoyalty(null);
    setActiveMembership(null);
    setRedeemPoints(0);
    setAppliedCoupon(null);
    setCouponDiscountPaise(0);
    setCouponError(null);
  }

  async function handleApplyCoupon() {
    if (!couponCodeInput.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      let sPaise = 0;
      let pPaise = 0;
      for (const it of items) {
        if (it.type === 'service') sPaise += it.unitPricePaise * it.quantity;
        if (it.type === 'product') pPaise += it.unitPricePaise * it.quantity;
      }
      const res = await apiRequest<any>('/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({
          code: couponCodeInput.trim().toUpperCase(),
          subtotalPaise,
          servicesTotalPaise: sPaise,
          productsTotalPaise: pPaise,
          customerId: customerId || undefined,
        }),
      });
      if (!res.valid) {
        setCouponError(res.message || 'Invalid coupon code');
        setAppliedCoupon(null);
        setCouponDiscountPaise(0);
      } else {
        setAppliedCoupon(res.coupon);
        setCouponDiscountPaise(res.discountPaise);
        setCouponCodeInput('');
      }
    } catch (err: any) {
      setCouponError(err.message || 'Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponDiscountPaise(0);
    setCouponError(null);
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

  function claimComplimentaryService(serviceId: string, serviceName: string) {
    setItems([
      ...items,
      {
        type: 'service',
        itemId: serviceId,
        itemName: `${serviceName} (VIP Complimentary)`,
        quantity: 1,
        unitPricePaise: 0,
      },
    ]);
  }

  function applyMembershipDiscounts() {
    if (!activeMembership) return;
    let sDiscount = 0;
    let pDiscount = 0;
    for (const it of items) {
      if (it.type === 'service' && it.unitPricePaise > 0) {
        sDiscount += Math.round(
          (it.quantity * it.unitPricePaise * (activeMembership.discountPercentServices || 0)) / 100
        );
      } else if (it.type === 'product' && it.unitPricePaise > 0) {
        pDiscount += Math.round(
          (it.quantity * it.unitPricePaise * (activeMembership.discountPercentProducts || 0)) / 100
        );
      }
    }
    setDiscountPaise(sDiscount + pDiscount);
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

  // Financial calculations
  const subtotalPaise = items.reduce(
    (acc, it) => acc + it.quantity * it.unitPricePaise,
    0
  );

  const pointValuePaise = loyaltySettings?.pointValuePaise ?? 100;
  const minRedeemPoints = loyaltySettings?.minRedeemPoints ?? 50;
  const maxDiscountPercentage = loyaltySettings?.maxDiscountPercentage ?? 50;

  const pointsDiscountPaise = redeemPoints > 0 ? redeemPoints * pointValuePaise : 0;
  const totalDiscountPaise = discountPaise + pointsDiscountPaise + couponDiscountPaise;
  const totalPaise = Math.max(0, subtotalPaise - totalDiscountPaise) + tipPaise;
  const changeDuePaise = Math.max(0, cashTendered * 100 - totalPaise);

  // Maximum points applicable for this bill
  const maxAllowedPointsByBill = Math.floor(
    (subtotalPaise * (maxDiscountPercentage / 100)) / pointValuePaise
  );
  const maxApplicablePoints = Math.min(
    customerLoyalty?.pointsBalance ?? 0,
    maxAllowedPointsByBill
  );

  const filteredCustomers = customerSearchQuery.trim()
    ? allCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
          (c.phone && c.phone.includes(customerSearchQuery))
      )
    : allCustomers.slice(0, 8);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      alert('Please add at least one line item (service or product).');
      return;
    }

    if (redeemPoints > 0) {
      if (redeemPoints < minRedeemPoints) {
        alert(`Minimum ${minRedeemPoints} points required to redeem.`);
        return;
      }
      if (redeemPoints > (customerLoyalty?.pointsBalance ?? 0)) {
        alert('Cannot redeem more points than customer balance.');
        return;
      }
      if (pointsDiscountPaise > Math.floor(subtotalPaise * (maxDiscountPercentage / 100))) {
        alert(`Points redemption cannot exceed ${maxDiscountPercentage}% of total bill.`);
        return;
      }
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
          couponCode: appliedCoupon ? appliedCoupon.code : undefined,
          tipPaise: tipPaise > 0 ? tipPaise : undefined,
          redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
          customerMembershipId: activeMembership ? activeMembership.id : undefined,
          items,
        }),
      });

      // 2. Record Payment if total is positive
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
      setCustomerId(null);
      setDiscountPaise(0);
      setTipPaise(0);
      setRedeemPoints(0);
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
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-400" /> Customer & Stylist
                </h3>
                {customerId && (
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Clear / Walk-in
                  </button>
                )}
              </div>

              {/* Customer Search / Autocomplete bar */}
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder="Search existing customer by name or phone..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  {showCustomerDropdown && (
                    <button
                      type="button"
                      onClick={() => setShowCustomerDropdown(false)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1"
                    >
                      Close
                    </button>
                  )}
                </div>

                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 top-full mt-1.5 left-0 right-0 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full p-2.5 text-left text-xs hover:bg-slate-900 flex items-center justify-between border-b border-slate-800/40 last:border-0"
                      >
                        <div>
                          <div className="font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-400">{c.phone || 'No phone'}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Name, Phone & Barber Inputs */}
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

              {/* PHASE 2: Customer Loyalty & Membership Badges */}
              {(customerLoyalty || activeMembership) && (
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  {/* VIP Membership Banner */}
                  {activeMembership && (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-xs text-amber-300">
                            {activeMembership.planName}
                          </span>
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Valid till {new Date(activeMembership.endDate).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Membership Perks */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        {activeMembership.discountPercentServices > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-950/80 border border-amber-500/20 text-amber-200">
                            ✂️ {activeMembership.discountPercentServices}% Off Services
                          </span>
                        )}
                        {activeMembership.discountPercentProducts > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-950/80 border border-amber-500/20 text-amber-200">
                            📦 {activeMembership.discountPercentProducts}% Off Products
                          </span>
                        )}
                        {activeMembership.pointsMultiplier > 1 && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-950/80 border border-amber-500/20 text-amber-200">
                            ⚡ {activeMembership.pointsMultiplier}x Points
                          </span>
                        )}

                        {/* Quick 1-click VIP Discount button */}
                        {(activeMembership.discountPercentServices > 0 || activeMembership.discountPercentProducts > 0) && (
                          <button
                            type="button"
                            onClick={applyMembershipDiscounts}
                            className="ml-auto px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1 transition-all"
                          >
                            <Sparkles className="w-3 h-3" /> Apply VIP Discounts
                          </button>
                        )}
                      </div>

                      {/* Included Complimentary Services Quota */}
                      {activeMembership.includedServicesUsage && activeMembership.includedServicesUsage.length > 0 && (
                        <div className="pt-2 border-t border-amber-500/20 space-y-1.5">
                          <div className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider">
                            Included Complimentary Services:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {activeMembership.includedServicesUsage.map((inc) => (
                              <div
                                key={inc.serviceId}
                                className="flex items-center justify-between p-2 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px]"
                              >
                                <div>
                                  <div className="font-semibold text-white">{inc.serviceName}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {inc.remainingCount} / {inc.totalAllowed} remaining
                                  </div>
                                </div>
                                {inc.remainingCount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => claimComplimentaryService(inc.serviceId, inc.serviceName)}
                                    className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                                  >
                                    + Claim Free
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-semibold">Exhausted</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loyalty Points Pill */}
                  {customerLoyalty && (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-400" />
                        <div>
                          <span className="text-slate-400">Customer Loyalty Balance: </span>
                          <span className="font-bold text-amber-400">
                            {customerLoyalty.pointsBalance} pts
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1">
                            (Worth {formatINR(customerLoyalty.monetaryValuePaise)})
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-slate-200">{formatINR(subtotalPaise)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Direct / VIP Discount (₹):</span>
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

                {/* PHASE 2: Loyalty Points Redemption Box */}
                {customerId && customerLoyalty && (loyaltySettings?.isEnabled ?? true) && (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                        <Award className="w-3.5 h-3.5" /> Redeem Points
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {customerLoyalty.pointsBalance} pts available
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={customerLoyalty.pointsBalance}
                        value={redeemPoints || ''}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setRedeemPoints(val);
                        }}
                        placeholder="0 pts"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setRedeemPoints(maxApplicablePoints)}
                        disabled={maxApplicablePoints < minRedeemPoints}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-30 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
                      >
                        Max ({maxApplicablePoints})
                      </button>
                      {redeemPoints > 0 && (
                        <button
                          type="button"
                          onClick={() => setRedeemPoints(0)}
                          className="px-2 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-[10px]"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {redeemPoints > 0 && (
                      <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                        <span>Points Discount:</span>
                        <span>-{formatINR(pointsDiscountPaise)}</span>
                      </div>
                    )}

                    {redeemPoints > 0 && redeemPoints < minRedeemPoints && (
                      <p className="text-[10px] text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Min {minRedeemPoints} points required
                      </p>
                    )}
                    {redeemPoints > customerLoyalty.pointsBalance && (
                      <p className="text-[10px] text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Exceeds available balance
                      </p>
                    )}
                    {pointsDiscountPaise > Math.floor(subtotalPaise * (maxDiscountPercentage / 100)) && (
                      <p className="text-[10px] text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Max {maxDiscountPercentage}% bill coverage
                      </p>
                    )}
                  </div>
                )}

                {/* PHASE 3: Barber Tip Box */}
                {workerId && (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                        <Sparkles className="w-3.5 h-3.5" /> Tip for Stylist
                      </div>
                      <span className="text-[10px] text-slate-400">
                        100% goes to barber
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[0, 20, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTipPaise(amt * 100)}
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                            tipPaise === amt * 100
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {amt === 0 ? 'None' : `+₹${amt}`}
                        </button>
                      ))}
                      <div className="flex-1 flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                        <span className="text-[10px] text-slate-500 mr-1">₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Custom"
                          value={tipPaise > 0 && ![2000, 5000, 10000].includes(tipPaise) ? tipPaise / 100 : ''}
                          onChange={(e) => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setTipPaise(Math.round(val * 100));
                          }}
                          className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none text-right font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PHASE 4: Promotional Coupon Code Box */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                      <Ticket className="w-3.5 h-3.5" /> Promo / Coupon Code
                    </div>
                    {appliedCoupon && (
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Applied
                      </span>
                    )}
                  </div>

                  {!appliedCoupon ? (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          placeholder="e.g. WELCOME10"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white uppercase font-mono tracking-wider"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponCodeInput.trim()}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10"
                      >
                        {couponLoading ? '...' : 'Apply'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-mono font-bold">
                        <Tag className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{appliedCoupon.code}</span>
                        <span className="text-[10px] text-emerald-400/80 font-normal">
                          (-{formatINR(couponDiscountPaise)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400"
                        title="Remove coupon"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {couponError && (
                    <p className="text-[10px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {couponError}
                    </p>
                  )}
                </div>

                {couponDiscountPaise > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Coupon ({appliedCoupon?.code}):</span>
                    <span className="font-mono">-{formatINR(couponDiscountPaise)}</span>
                  </div>
                )}

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
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-3 px-2 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi_qr')}
                    className={`py-3 px-2 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'upi_qr'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <QrCode className="w-5 h-5" /> UPI QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`py-3 px-2 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'razorpay'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" /> Razorpay
                  </button>
                </div>
              </div>

              {/* Razorpay Gateway Option */}
              {paymentMethod === 'razorpay' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-2 text-xs">
                  <CreditCard className="w-8 h-8 text-amber-400 mx-auto mb-1" />
                  <p className="font-bold text-white">Online Payment Gateway (Razorpay)</p>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Accept Cards, NetBanking, Wallets & UPI directly with automated receipt generation.
                  </p>
                  <div className="mt-2 text-xs font-mono text-emerald-400 font-bold">
                    Amount Due: {formatINR(totalPaise)}
                  </div>
                </div>
              )}

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

              {/* UPI QR Display */}
              {paymentMethod === 'upi_qr' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-3">
                  <p className="text-xs font-semibold text-slate-300">
                    Scan using Google Pay, PhonePe, Paytm, or BHIM
                  </p>
                  <div className="w-44 h-44 bg-white rounded-2xl p-2 mx-auto flex items-center justify-center shadow-lg">
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
                  Invoice #{successInvoice.invoiceNumber} recorded successfully. Loyalty points & product inventory updated.
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
