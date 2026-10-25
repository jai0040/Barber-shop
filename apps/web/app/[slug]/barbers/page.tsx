'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import Navbar from '@/components/customer/Navbar';
import BottomNav from '@/components/customer/BottomNav';
import { Users, Calendar, CheckCircle2, Scissors, ArrowRight, ShieldCheck, Clock } from 'lucide-react';

interface PublicBarber {
  id: string;
  displayName: string;
  photoUrl: string | null;
  serviceIds: string[];
}

interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
}

export default function BarbersPage() {
  const params = useParams();
  const slug = (params?.slug as string) || 'classic-barber';

  const [barbers, setBarbers] = useState<PublicBarber[]>([]);
  const [services, setServices] = useState<Record<string, PublicService>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // Load services to show barber capabilities
        const srvRes = await apiRequest<{ categories: any[]; services: PublicService[] }>(
          `/shops/public/${slug}/services`
        );
        const map: Record<string, PublicService> = {};
        for (const s of srvRes.services) {
          map[s.id] = s;
        }
        setServices(map);

        // Load barbers
        const barbRes = await apiRequest<PublicBarber[]>(
          `/shops/public/${slug}/barbers`
        );
        setBarbers(barbRes);
      } catch (err: any) {
        setError(err.message || 'Failed to load barbers.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 md:pb-12">
      <Navbar shopSlug={slug} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 md:py-10">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase mb-3">
            <Users className="w-3.5 h-3.5" /> Expert Stylists & Grooming Artisans
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Meet Our Master Barbers
          </h1>
          <p className="mt-3 text-slate-400 text-sm sm:text-base">
            Every craftsman at Classic Barber is certified, meticulous, and dedicated to delivering your sharpest look.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 animate-pulse">
                <div className="w-20 h-20 bg-slate-800 rounded-full mx-auto mb-4" />
                <div className="h-5 bg-slate-800 rounded w-1/2 mx-auto mb-2" />
                <div className="h-4 bg-slate-800 rounded w-3/4 mx-auto mb-4" />
                <div className="h-10 bg-slate-800 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 bg-red-950/40 border border-red-800 text-red-200 rounded-2xl text-center max-w-md mx-auto">
            <p className="text-sm">{error}</p>
          </div>
        ) : barbers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 max-w-md mx-auto">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-200">No barbers listed</p>
            <p className="text-sm mt-1">Please check back later or contact the shop directly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {barbers.map((b) => (
              <div
                key={b.id}
                className="bg-slate-900/90 border border-slate-800/80 hover:border-amber-500/40 rounded-2xl p-6 transition-all shadow-xl hover:shadow-amber-500/5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    {b.photoUrl ? (
                      <img
                        src={b.photoUrl}
                        alt={b.displayName}
                        className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/40"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xl flex items-center justify-center shadow-md">
                        {b.displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                        {b.displayName}
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                      </h2>
                      <span className="text-xs text-amber-300/80 font-medium bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Senior Barber
                      </span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-amber-400" /> Services Offered
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {b.serviceIds.map((sid) => {
                        const s = services[sid];
                        return (
                          <span
                            key={sid}
                            className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/60"
                          >
                            {s ? s.name : 'Specialty Service'}
                          </span>
                        );
                      })}
                      {b.serviceIds.length === 0 && (
                        <span className="text-xs text-slate-500">All standard grooming services</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/80">
                  <Link
                    href={`/${slug}/book?workerId=${b.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-md active:scale-[0.98]"
                  >
                    <Calendar className="w-4 h-4" />
                    Book with {b.displayName}
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
