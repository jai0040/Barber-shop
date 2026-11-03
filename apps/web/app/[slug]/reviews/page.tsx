'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/customer/Navbar';
import BottomNav from '@/components/customer/BottomNav';
import { apiGet } from '@/lib/api';
import {
  Star,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Reply,
  Scissors,
  User,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ReviewItem, ReviewSummary } from '@barbershop/shared';

export default function PublicReviewsPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [slug]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [listRes, sumRes] = await Promise.all([
        apiGet<{ items: ReviewItem[]; total: number }>(`/reviews/public/${slug}?limit=50`),
        apiGet<ReviewSummary>(`/reviews/public/${slug}/summary`),
      ]);
      setReviews(listRes?.items || []);
      setSummary(sumRes || null);
    } catch (err: any) {
      setError(err.message || 'Could not load customer reviews.');
    } finally {
      setLoading(false);
    }
  }

  const avgRating = summary?.averageRating || 5.0;
  const totalCount = summary?.totalReviews || reviews.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 md:pb-12">
      <Navbar shopSlug={slug} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Verified Customer Feedback
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Client <span className="text-amber-400">Reviews & Ratings</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed">
            Authentic reviews from clients who visited our chairs. Quality, precision styling, and master craft in every service.
          </p>
        </div>

        {/* Rating Breakdown Card */}
        {summary && totalCount > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-10 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Left Score */}
              <div className="text-center md:border-r md:border-slate-800 md:pr-6">
                <span className="text-5xl sm:text-6xl font-black text-white font-mono block">
                  {avgRating.toFixed(1)}
                </span>
                <div className="flex justify-center gap-1 my-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-5 h-5 ${
                        s <= Math.round(avgRating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Based on {totalCount} verified visits
                </p>
              </div>

              {/* Star Distribution Bars */}
              <div className="md:col-span-2 space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const cnt = (summary.ratingDistribution as any)?.[stars] || 0;
                  const pct = totalCount > 0 ? Math.round((cnt / totalCount) * 100) : 0;
                  return (
                    <div key={stars} className="flex items-center gap-3 text-xs">
                      <span className="w-12 text-slate-400 font-bold flex items-center gap-1 shrink-0">
                        {stars} <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      </span>
                      <div className="flex-1 h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-slate-500 font-mono text-[11px]">
                        {cnt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Reviews Feed */}
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-3xl" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs">
            <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            No reviews yet. Be the first to share your grooming experience!
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400">
                      {r.customerName?.[0] || 'C'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {r.customerName || 'Verified Client'}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Verified Client
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-0.5 font-mono">
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.workerName && (
                          <span className="text-amber-400/90 font-semibold flex items-center gap-1">
                            <User className="w-3 h-3" /> Stylist: {r.workerName}
                          </span>
                        )}
                        {r.serviceName && (
                          <span className="text-slate-300 flex items-center gap-1">
                            <Scissors className="w-3 h-3" /> {r.serviceName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= r.rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {r.comment && (
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
                    "{r.comment}"
                  </p>
                )}

                {r.ownerReply && (
                  <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-2xl space-y-1 ml-4 sm:ml-6">
                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
                      <span className="flex items-center gap-1.5">
                        <Reply className="w-3.5 h-3.5" /> Response from Shop Owner:
                      </span>
                      {r.ownerRepliedAt && (
                        <span className="text-[10px] text-slate-500 font-mono font-normal">
                          {new Date(r.ownerRepliedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 italic pl-5">
                      "{r.ownerReply}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA Bar */}
        <div className="mt-12 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white">Experience Modern Barbering</h3>
            <p className="text-xs text-slate-400 mt-1">Book your precision styling session today.</p>
          </div>
          <Link
            href={`/${slug}/book`}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-slate-950 font-bold text-sm shadow-xl flex items-center gap-2 active:scale-95 transition-all"
          >
            <Calendar className="w-4 h-4" /> Book Appointment
          </Link>
        </div>
      </main>

      <BottomNav slug={slug} />
    </div>
  );
}
