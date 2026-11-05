'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { apiRequest } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  Star,
  MessageSquare,
  EyeOff,
  Eye,
  Flag,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  User,
  Scissors,
  Check,
  X,
  Reply,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { ReviewItem, ReviewStatus, ReviewSummary } from '@barbershop/shared';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMinRating, setFilterMinRating] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reply Modal
  const [replyingReview, setReplyingReview] = useState<ReviewItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [filterStatus, filterMinRating]);

  async function loadReviews() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterMinRating) params.append('minRating', filterMinRating);
      params.append('limit', '50');

      const res = await apiRequest<{
        items: ReviewItem[];
        total: number;
        summary: ReviewSummary;
      }>(`/reviews?${params.toString()}`);

      setReviews(res.items || []);
      setTotal(res.total || 0);
      setSummary(res.summary || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer reviews');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(id: string, nextStatus: ReviewStatus) {
    try {
      await apiRequest(`/reviews/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadReviews();
    } catch (err: any) {
      alert(err.message || 'Failed to update review status');
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyingReview || !replyText.trim()) return;

    try {
      setSubmittingReply(true);
      await apiRequest(`/reviews/${replyingReview.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ ownerReply: replyText.trim() }),
      });
      setReplyingReview(null);
      setReplyText('');
      await loadReviews();
    } catch (err: any) {
      alert(err.message || 'Failed to submit reply');
    } finally {
      setSubmittingReply(false);
    }
  }

  function handleExportCsv() {
    downloadCsv(
      `customer-reviews-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Review ID', 'Date', 'Customer Name', 'Barber Name', 'Overall Rating', 'Barber Rating', 'Status', 'Customer Comment', 'Owner Reply'],
      reviews.map((r) => [
        r.id,
        new Date(r.createdAt).toLocaleDateString(),
        r.customerName || 'Anonymous Client',
        r.workerName || 'Shop Stylist',
        r.rating,
        r.barberRating || '',
        r.status,
        r.comment || '',
        r.ownerReply || '',
      ])
    );
  }

  const fiveStarCount = summary?.ratingDistribution?.[5] || 0;
  const totalReviewsCount = summary?.totalReviews || 0;
  const satisfactionRate = totalReviewsCount > 0 ? Math.round((fiveStarCount / totalReviewsCount) * 100) : 100;
  const pendingReplies = reviews.filter((r) => !r.ownerReply && r.status === 'published').length;

  return (
    <AdminLayout
      title="Customer Reviews & Ratings"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadReviews}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            title="Refresh Reviews"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCsv}
            disabled={reviews.length === 0}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs inline-flex items-center gap-1.5 transition disabled:opacity-50"
            title="Export Reviews CSV"
          >
            <Download className="w-4 h-4 text-amber-500" /> Export CSV
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Overall Rating</span>
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-white font-mono">
                {summary?.averageRating ? summary.averageRating.toFixed(1) : '5.0'}
              </span>
              <span className="text-xs text-amber-400 font-bold">/ 5.0</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Based on {totalReviewsCount} verified reviews
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Total Reviews</span>
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-black text-white mt-1 font-mono">{totalReviewsCount}</p>
            <span className="text-[10px] text-slate-500">Customer Testimonials</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>5-Star Ratio</span>
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-black text-emerald-400 mt-1 font-mono">{satisfactionRate}%</p>
            <span className="text-[10px] text-slate-500">{fiveStarCount} top-tier ratings</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
              <span>Pending Replies</span>
              <Reply className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-3xl font-black text-blue-400 mt-1 font-mono">{pendingReplies}</p>
            <span className="text-[10px] text-slate-500">Awaiting Manager Note</span>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            {['all', 'published', 'flagged', 'hidden'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                  filterStatus === st
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={filterMinRating}
              onChange={(e) => setFilterMinRating(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="">All Star Ratings</option>
              <option value="5">⭐⭐⭐⭐⭐ (5 Stars only)</option>
              <option value="4">⭐⭐⭐⭐ & above (4+ Stars)</option>
              <option value="3">⭐⭐⭐ & above (3+ Stars)</option>
            </select>
          </div>
        </div>

        {/* Reviews List */}
        <div className="space-y-4">
          {loading && reviews.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading customer reviews...
            </div>
          ) : reviews.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs">
              <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              No customer reviews matching current filter.
            </div>
          ) : (
            reviews.map((r) => (
              <div
                key={r.id}
                className={`bg-slate-900 border rounded-3xl p-5 shadow-xl transition-all space-y-3 ${
                  r.status === 'hidden'
                    ? 'border-slate-800/40 opacity-60'
                    : r.status === 'flagged'
                    ? 'border-rose-500/40'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400">
                      {r.customerName?.[0] || 'C'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {r.customerName || 'Anonymous Client'}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Verified Client
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5 font-mono">
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.workerName && (
                          <span className="text-amber-400/90 font-semibold flex items-center gap-1">
                            <User className="w-3 h-3" /> Barber: {r.workerName}
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

                  <div className="flex items-center gap-2">
                    {/* Star Rating Badge */}
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
                      <span className="text-xs font-bold text-white ml-1 font-mono">
                        {r.rating}.0
                      </span>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        r.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : r.status === 'flagged'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>

                {/* Comment Text */}
                {r.comment && (
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
                    "{r.comment}"
                  </p>
                )}

                {/* Owner Reply if present */}
                {r.ownerReply ? (
                  <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-2xl space-y-1">
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
                ) : null}

                {/* Moderation & Reply Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-2">
                    {!r.ownerReply && (
                      <button
                        onClick={() => {
                          setReplyingReview(r);
                          setReplyText('');
                        }}
                        className="px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-bold flex items-center gap-1.5 transition-all"
                      >
                        <Reply className="w-3.5 h-3.5" /> Reply to Review
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {r.status !== 'published' ? (
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'published')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1"
                        title="Publish Review"
                      >
                        <Eye className="w-3 h-3" /> Publish
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'hidden')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center gap-1"
                        title="Hide Review from public website"
                      >
                        <EyeOff className="w-3 h-3" /> Hide
                      </button>
                    )}

                    {r.status !== 'flagged' && (
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'flagged')}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold flex items-center gap-1"
                        title="Flag as inappropriate"
                      >
                        <Flag className="w-3 h-3" /> Flag
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Reply to Review Modal */}
      {replyingReview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Reply className="w-4 h-4 text-amber-400" /> Public Response to {replyingReview.customerName}
              </h3>
              <button
                onClick={() => setReplyingReview(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span>Rating: {replyingReview.rating} Stars</span>
                <span>{new Date(replyingReview.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-slate-200 italic">
                "{replyingReview.comment || 'No comment text'}"
              </p>
            </div>

            <form onSubmit={handleSendReply} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Your Response (Displayed publicly on customer website)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Thank you for the kind words! We look forward to your next visit..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplyingReview(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {submittingReply ? 'Posting...' : 'Post Public Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
