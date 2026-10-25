'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, Scissors, ArrowRight } from 'lucide-react';
import CustomerNavbar from '@/components/customer/Navbar';
import CustomerBottomNav from '@/components/customer/BottomNav';
import { apiRequest, formatINR } from '@/lib/api';
import { ServiceCategory, ServiceItem } from '@barbershop/shared';

export default function ServicesPage() {
  const params = useParams();
  const slug = (params.slug as string) || 'classic-barber';

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ categories: ServiceCategory[]; services: ServiceItem[] }>(`/services/public/${slug}`)
      .then((data: { categories: ServiceCategory[]; services: ServiceItem[] }) => {
        setCategories(data.categories);
        setServices(data.services);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const filteredServices = activeCategory === 'all'
    ? services
    : services.filter((s) => s.categoryId === activeCategory);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <CustomerNavbar slug={slug} />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">Services Menu</h1>
          <p className="text-xs text-slate-500 mt-1">Select any service to begin booking</p>
        </div>

        {/* Categories Pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                activeCategory === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              All Services ({services.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  activeCategory === c.id
                    ? 'bg-amber-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Services List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredServices.map((svc) => (
              <div
                key={svc.id}
                className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{svc.name}</h3>
                    {svc.categoryName && (
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
                        {svc.categoryName}
                      </span>
                    )}
                  </div>
                  {svc.description && (
                    <p className="text-xs text-slate-500 max-w-md">{svc.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-400 pt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{svc.durationMinutes} mins</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  <span className="font-extrabold text-base text-slate-900">
                    {formatINR(svc.pricePaise)}
                  </span>
                  <Link
                    href={`/${slug}/book?serviceId=${svc.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition"
                  >
                    <span>Book</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CustomerBottomNav slug={slug} />
    </div>
  );
}
