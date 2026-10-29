'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/customer/Navbar';
import BottomNav from '@/components/customer/BottomNav';
import { apiGet } from '@/lib/api';
import {
  Crown,
  CheckCircle2,
  Percent,
  Sparkles,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Phone,
} from 'lucide-react';
import { MembershipPlan } from '@barbershop/shared';

export default function PublicMembershipsPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [slug]);

  async function loadPlans() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<MembershipPlan[]>(`/memberships/public/${slug}/plans`);
      setPlans(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err.message || 'Could not load membership plans.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 md:pb-12">
      <Navbar shopSlug={slug} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
            <Crown className="w-3.5 h-3.5" /> VIP Grooming Club
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Elevate Your Style with a <span className="text-amber-400">Membership</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed">
            Enjoy priority appointments, guaranteed discounts on all hair & beard services, retail savings, and exclusive complimentary sessions.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-950/40 border border-red-500/30 text-red-300 rounded-2xl text-xs text-center">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <Crown className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300">No active plans at this moment</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Please check back soon or inquire at our front desk during your next visit.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((p) => (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800/90 rounded-3xl p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden group hover:border-amber-500/40 transition-all duration-300"
              >
                <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {p.durationDays} Days Plan
                    </span>
                    <Crown className="w-5 h-5 text-amber-400" />
                  </div>

                  <h3 className="text-2xl font-black text-white">{p.name}</h3>
                  <p className="text-slate-400 text-xs mt-1.5 min-h-[36px]">
                    {p.description || 'Exclusive VIP membership benefits'}
                  </p>

                  <div className="my-6 pt-4 border-t border-slate-800/80">
                    <div className="text-4xl font-black text-amber-400 tracking-tight">
                      ₹{(p.pricePaise / 100).toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Billed every {p.durationDays} days</div>
                  </div>

                  {/* Benefit Points */}
                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-emerald-400" />
                        Service Discounts
                      </span>
                      <span className="font-bold text-emerald-400">{p.discountPercentServices}% OFF</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Retail Products
                      </span>
                      <span className="font-bold text-emerald-400">{p.discountPercentProducts}% OFF</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        Loyalty Multiplier
                      </span>
                      <span className="font-bold text-amber-300">{p.pointsMultiplier}x Points</span>
                    </div>

                    {p.includedServices && p.includedServices.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/60">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Included Complimentaries:
                        </span>
                        <ul className="space-y-1.5">
                          {p.includedServices.map((inc, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-xs text-amber-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>
                                {inc.quantity}x {inc.serviceName || 'Free Service'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-800/80">
                  <Link
                    href={`/${slug}/book`}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-lg transition-all"
                  >
                    <span>Subscribe in Shop / Book</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav shopSlug={slug} />
    </div>
  );
}
