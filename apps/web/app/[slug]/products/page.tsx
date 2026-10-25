'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiRequest, formatINR } from '@/lib/api';
import Navbar from '@/components/customer/Navbar';
import BottomNav from '@/components/customer/BottomNav';
import { Package, Sparkles, Store, ShieldCheck, Info, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';

interface PublicProduct {
  id: string;
  name: string;
  sku: string;
  selling_price_paise: number;
  stock_quantity: number;
  low_stock_threshold: number;
  category_name: string | null;
  status: string;
}

export default function ProductsPage() {
  const params = useParams();
  const slug = (params?.slug as string) || 'classic-barber';

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await apiRequest<{ products: PublicProduct[] }>(
          `/products/public/${slug}`
        );
        setProducts(res.products || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load products.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category_name).filter(Boolean)))];

  const filtered = selectedCategory === 'all'
    ? products
    : products.filter((p) => p.category_name === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 md:pb-12">
      <Navbar shopSlug={slug} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 md:py-10">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Premium Grooming Essentials
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Curated In-Shop Products
          </h1>
          <p className="mt-3 text-slate-400 text-sm sm:text-base">
            Professional beard oils, matte clays, and nourishing shampoos handpicked by our master barbers.
          </p>
        </div>

        {/* Phase 1 In-Shop Notice Banner */}
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3.5 text-amber-200">
          <Store className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-bold text-amber-300">In-Shop Purchase Only: </span>
            Browse our selection here, and pick up your products during your next appointment. Our barbers will gladly demonstrate how to apply and style with them.
          </div>
        </div>

        {/* Category Pills */}
        {categories.length > 2 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat as string}
                onClick={() => setSelectedCategory(cat as string)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? 'All Products' : cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 animate-pulse">
                <div className="w-full h-36 bg-slate-800 rounded-xl mb-4" />
                <div className="h-5 bg-slate-800 rounded w-2/3 mb-2" />
                <div className="h-4 bg-slate-800 rounded w-1/3 mb-4" />
                <div className="h-10 bg-slate-800 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 bg-red-950/40 border border-red-800 text-red-200 rounded-2xl text-center max-w-md mx-auto">
            <p className="text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 max-w-md mx-auto">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-200">No products available</p>
            <p className="text-sm mt-1">Check back soon for new inventory.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((p) => {
              const inStock = p.stock_quantity > 0;
              const isLow = inStock && p.stock_quantity <= p.low_stock_threshold;

              return (
                <div
                  key={p.id}
                  className="bg-slate-900/90 border border-slate-800/80 hover:border-amber-500/40 rounded-2xl p-6 transition-all shadow-xl hover:shadow-amber-500/5 flex flex-col justify-between"
                >
                  <div>
                    <div className="h-36 rounded-xl bg-gradient-to-tr from-slate-950 to-slate-800 border border-slate-800/60 flex items-center justify-center mb-4 relative overflow-hidden">
                      <Package className="w-14 h-14 text-amber-500/40" />
                      {p.category_name && (
                        <span className="absolute top-3 left-3 text-[11px] font-semibold bg-slate-900/80 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          {p.category_name}
                        </span>
                      )}
                      <span className="absolute bottom-3 right-3 text-[10px] text-slate-500 font-mono">
                        SKU: {p.sku}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-white mb-1.5">{p.name}</h2>

                    <div className="flex items-center gap-2 mb-4">
                      {inStock ? (
                        isLow ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            <AlertCircle className="w-3 h-3" /> Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> In Stock
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Retail Price</p>
                      <p className="text-xl font-black text-amber-400">
                        {formatINR(p.selling_price_paise)}
                      </p>
                    </div>

                    <Link
                      href={`/${slug}/book`}
                      className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                    >
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      Book & Buy
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav shopSlug={slug} />
    </div>
  );
}
