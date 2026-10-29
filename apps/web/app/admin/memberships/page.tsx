'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import {
  Award,
  Crown,
  Plus,
  Settings,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Percent,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { MembershipPlan, CustomerMembership, LoyaltySettings, CustomerLoyaltySummary } from '@barbershop/shared';

export default function MembershipsAndLoyaltyPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'subscriptions' | 'loyalty'>('plans');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Plans State
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string; pricePaise: number }>>([]);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    priceRupees: 999,
    durationDays: 30,
    discountPercentServices: 20,
    discountPercentProducts: 10,
    pointsMultiplier: 2.0,
    includedServices: [] as Array<{ serviceId: string; quantity: number }>,
  });

  // Subscriptions State
  const [subscriptions, setSubscriptions] = useState<CustomerMembership[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    customerId: '',
    planId: '',
    notes: '',
  });

  // Loyalty Settings & Adjustment State
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loyaltyForm, setLoyaltyForm] = useState({
    isEnabled: true,
    earnPerRupee: 100, // Rs 100 spent = 1 pt
    pointValueRupees: 1, // 1 pt = Rs 1
    minRedeemPoints: 50,
    maxDiscountPercentage: 50,
  });

  // Customer Loyalty Lookup State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerLoyalty, setCustomerLoyalty] = useState<CustomerLoyaltySummary | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    pointsDelta: 50,
    type: 'welcome_bonus' as 'welcome_bonus' | 'manual_adjustment' | 'membership_bonus',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, settingsRes, srvRes, custRes] = await Promise.all([
        apiGet<MembershipPlan[]>('/memberships/plans?includeArchived=true'),
        apiGet<LoyaltySettings>('/loyalty/settings'),
        apiGet<any>('/services'),
        apiGet<any>('/customers'),
      ]);

      if (plansRes) setPlans(Array.isArray(plansRes) ? plansRes : (plansRes as any).items || []);
      if (settingsRes) {
        setLoyaltySettings(settingsRes);
        setLoyaltyForm({
          isEnabled: settingsRes.isEnabled,
          earnPerRupee: Math.round(settingsRes.earnPerRupeePaise / 100),
          pointValueRupees: Math.round(settingsRes.pointValuePaise / 100),
          minRedeemPoints: settingsRes.minRedeemPoints,
          maxDiscountPercentage: settingsRes.maxDiscountPercentage,
        });
      }
      if (srvRes) {
        const sList = Array.isArray(srvRes) ? srvRes : srvRes.items || [];
        setServices(sList);
      }
      if (custRes) {
        const cList = Array.isArray(custRes) ? custRes : custRes.items || [];
        setCustomers(cList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load membership and loyalty data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiPost('/memberships/plans', {
        name: planForm.name,
        description: planForm.description || null,
        pricePaise: Math.round(planForm.priceRupees * 100),
        durationDays: Number(planForm.durationDays),
        discountPercentServices: Number(planForm.discountPercentServices),
        discountPercentProducts: Number(planForm.discountPercentProducts),
        pointsMultiplier: Number(planForm.pointsMultiplier),
        includedServices: planForm.includedServices,
      });

      setSuccess(`Membership Plan "${planForm.name}" created successfully!`);
      setShowCreatePlanModal(false);
      setPlanForm({
        name: '',
        description: '',
        priceRupees: 999,
        durationDays: 30,
        discountPercentServices: 20,
        discountPercentProducts: 10,
        pointsMultiplier: 2.0,
        includedServices: [],
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create plan.');
    }
  }

  async function handleSaveLoyaltySettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiPut('/loyalty/settings', {
        isEnabled: loyaltyForm.isEnabled,
        earnPerRupeePaise: Math.round(loyaltyForm.earnPerRupee * 100),
        pointValuePaise: Math.round(loyaltyForm.pointValueRupees * 100),
        minRedeemPoints: Number(loyaltyForm.minRedeemPoints),
        maxDiscountPercentage: Number(loyaltyForm.maxDiscountPercentage),
      });

      setSuccess('Loyalty settings updated successfully!');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update loyalty settings.');
    }
  }

  async function handleCustomerSelect(cid: string) {
    setSelectedCustomerId(cid);
    if (!cid) {
      setCustomerLoyalty(null);
      return;
    }
    try {
      const res = await apiGet<CustomerLoyaltySummary>(`/loyalty/customer/${cid}`);
      if (res) setCustomerLoyalty(res);
    } catch {
      setCustomerLoyalty(null);
    }
  }

  async function handleAdjustPoints(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setError(null);
    try {
      await apiPost('/loyalty/adjust', {
        customerId: selectedCustomerId,
        pointsDelta: Number(adjustForm.pointsDelta),
        type: adjustForm.type,
        notes: adjustForm.notes || undefined,
      });

      setSuccess('Points adjusted successfully!');
      handleCustomerSelect(selectedCustomerId);
    } catch (err: any) {
      setError(err.message || 'Failed to adjust points.');
    }
  }

  return (
    <AdminLayout
      title="Memberships & Customer Loyalty"
      actions={
        activeTab === 'plans' ? (
          <button
            onClick={() => setShowCreatePlanModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-4 py-2 rounded-xl shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Plan</span>
          </button>
        ) : null
      }
    >
      {/* Alert Banners */}
      {error && (
        <div className="mb-6 bg-red-950/60 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-5 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'plans'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>Membership Plans ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 px-5 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'loyalty'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Loyalty Points Program</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'plans' ? (
        /* Tab 1: Membership Plans */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((p) => (
              <div
                key={p.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Crown className="w-3.5 h-3.5" />
                      {p.durationDays} Days Validity
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full ${
                        p.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-100">{p.name}</h3>
                  <p className="text-slate-400 text-sm mt-1 mb-4">{p.description || 'VIP grooming membership'}</p>

                  <div className="text-3xl font-extrabold text-amber-400 mb-6">
                    ₹{(p.pricePaise / 100).toLocaleString('en-IN')}
                    <span className="text-xs text-slate-400 font-normal"> / cycle</span>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-800/80 text-sm">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-amber-400" />
                        Service Discount
                      </span>
                      <span className="font-semibold text-emerald-400">{p.discountPercentServices}% OFF</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Product Retail Discount
                      </span>
                      <span className="font-semibold text-emerald-400">{p.discountPercentProducts}% OFF</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        Loyalty Points Multiplier
                      </span>
                      <span className="font-semibold text-amber-300">{p.pointsMultiplier}x Points</span>
                    </div>

                    {p.includedServices && p.includedServices.length > 0 && (
                      <div className="pt-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                          Included Free Services:
                        </span>
                        <ul className="space-y-1">
                          {p.includedServices.map((inc, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-xs text-amber-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>
                                {inc.quantity}x {inc.serviceName || 'Service'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Tab 2: Loyalty Program */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Form */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <Award className="w-6 h-6 text-amber-400" />
              <div>
                <h2 className="text-lg font-bold text-slate-100">Loyalty Program Rules</h2>
                <p className="text-slate-400 text-sm">Configure how customers earn and redeem points in your shop</p>
              </div>
            </div>

            <form onSubmit={handleSaveLoyaltySettings} className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                <div>
                  <div className="font-semibold text-slate-200">Enable Customer Loyalty Program</div>
                  <div className="text-xs text-slate-400">Allow customers to accumulate and redeem points on visits</div>
                </div>
                <input
                  type="checkbox"
                  checked={loyaltyForm.isEnabled}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, isEnabled: e.target.checked })}
                  className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Points Earn Rate</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={loyaltyForm.earnPerRupee}
                      onChange={(e) => setLoyaltyForm({ ...loyaltyForm, earnPerRupee: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-amber-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">₹ spent = 1 pt</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Point Redemption Value</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={loyaltyForm.pointValueRupees}
                      onChange={(e) => setLoyaltyForm({ ...loyaltyForm, pointValueRupees: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-amber-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">1 pt = ₹ discount</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Minimum Points to Redeem</label>
                  <input
                    type="number"
                    min="0"
                    value={loyaltyForm.minRedeemPoints}
                    onChange={(e) => setLoyaltyForm({ ...loyaltyForm, minRedeemPoints: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Bill Coverage %</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={loyaltyForm.maxDiscountPercentage}
                    onChange={(e) => setLoyaltyForm({ ...loyaltyForm, maxDiscountPercentage: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all"
                >
                  Save Loyalty Settings
                </button>
              </div>
            </form>
          </div>

          {/* Customer Points Lookup & Adjustments */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-100 mb-1">Customer Points Balance</h2>
            <p className="text-slate-400 text-xs mb-4">View and manually adjust a customer's loyalty balance</p>

            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Select Customer</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Choose a customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            {customerLoyalty ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400">Current Balance</div>
                  <div className="text-3xl font-extrabold text-amber-400 mt-1">
                    {customerLoyalty.pointsBalance}{' '}
                    <span className="text-xs text-slate-400 font-normal">points</span>
                  </div>
                  <div className="text-xs text-emerald-400 mt-1 font-medium">
                    Worth ₹{(customerLoyalty.monetaryValuePaise / 100).toFixed(2)} in discounts
                  </div>
                </div>

                <form onSubmit={handleAdjustPoints} className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="font-semibold text-xs text-slate-300">Manual Point Adjustment</div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Points Delta (+/-)</label>
                      <input
                        type="number"
                        value={adjustForm.pointsDelta}
                        onChange={(e) => setAdjustForm({ ...adjustForm, pointsDelta: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Reason</label>
                      <select
                        value={adjustForm.type}
                        onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="welcome_bonus">Welcome Bonus</option>
                        <option value="manual_adjustment">Manual Adjustment</option>
                        <option value="membership_bonus">Membership Bonus</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. In-shop special reward"
                      value={adjustForm.notes}
                      onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold py-2 rounded-xl text-xs transition-all border border-amber-500/30"
                  >
                    Apply Adjustment
                  </button>
                </form>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                Select a customer above to view loyalty points and transactions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Create Membership Plan
              </h3>
              <button
                onClick={() => setShowCreatePlanModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Gold Club"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Unlimited style & grooming privileges"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={planForm.priceRupees}
                    onChange={(e) => setPlanForm({ ...planForm, priceRupees: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Validity (Days) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={planForm.durationDays}
                    onChange={(e) => setPlanForm({ ...planForm, durationDays: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Service Disc %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={planForm.discountPercentServices}
                    onChange={(e) => setPlanForm({ ...planForm, discountPercentServices: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Product Disc %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={planForm.discountPercentProducts}
                    onChange={(e) => setPlanForm({ ...planForm, discountPercentProducts: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Points Multiplier</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={planForm.pointsMultiplier}
                    onChange={(e) => setPlanForm({ ...planForm, pointsMultiplier: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreatePlanModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2 rounded-xl"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
