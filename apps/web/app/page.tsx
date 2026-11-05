'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scissors, Star, MapPin, Clock, Phone, ChevronRight, ShieldCheck } from 'lucide-react';
import CustomerNavbar from '@/components/customer/Navbar';
import CustomerBottomNav from '@/components/customer/BottomNav';
import { apiRequest, formatINR } from '@/lib/api';
import { ServiceItem } from '@barbershop/shared';

export default function HomePage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ services: ServiceItem[] }>('/services/public/classic-barber')
      .then((data: { services: ServiceItem[] }) => setServices(data.services.slice(0, 4)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-12">
      <CustomerNavbar slug="classic-barber" />

      {/* Hero Section */}
      <section className="relative bg-dark-900 text-white overflow-hidden py-16 px-4">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#d1a54c_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="max-w-4xl mx-auto relative z-10 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Premium Grooming Studio
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Crafting Confidence, <br />
            <span className="text-amber-500">One Cut at a Time.</span>
          </h1>

          <p className="text-slate-300 text-sm md:text-base max-w-lg mx-auto font-normal">
            Experience master barbering with precision cuts, beard sculpting, and hot towel treatments. Book in seconds.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/classic-barber/book"
              className="w-full sm:w-auto px-8 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 text-center transition active:scale-95"
            >
              Book an Appointment
            </Link>
            <Link
              href="/classic-barber/services"
              className="w-full sm:w-auto px-6 py-3.5 bg-dark-700 hover:bg-dark-600 text-slate-200 font-semibold rounded-xl text-center transition"
            >
              Explore Services
            </Link>
          </div>

          {/* Quick shop metadata badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span>Indiranagar, Bengaluru</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Open Daily: 10:00 AM - 9:00 PM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-amber-500" />
              <span>+91 98765 43210</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Services */}
      <section className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Popular Services</h2>
            <p className="text-xs md:text-sm text-slate-500">Handcrafted grooming experiences tailored for you</p>
          </div>
          <Link
            href="/classic-barber/services"
            className="text-xs md:text-sm font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            <span>View All</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{svc.name}</h3>
                    <span className="font-extrabold text-amber-700 text-base whitespace-nowrap">
                      {formatINR(svc.pricePaise)}
                    </span>
                  </div>
                  {svc.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{svc.description}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {svc.durationMinutes} mins
                  </span>
                  <Link
                    href={`/classic-barber/book?serviceId=${svc.id}`}
                    className="font-semibold text-amber-700 hover:text-amber-800"
                  >
                    Select & Book →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quality Guarantees */}
      <section className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-2 shadow-sm">
              <Scissors className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Master Stylists</h4>
            <p className="text-xs text-slate-600 mt-1">Experienced and dedicated professionals</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-2 shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Hygienic & Sanitized</h4>
            <p className="text-xs text-slate-600 mt-1">Single-use blades & sterilized equipment</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-2 shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Zero Wait Guarantee</h4>
            <p className="text-xs text-slate-600 mt-1">Pre-booked slots start on time</p>
          </div>
        </div>
      </section>

      {/* Staff & Customer Portals link footer */}
      <footer className="max-w-4xl mx-auto px-4 pt-10 pb-4 text-center text-xs text-slate-400 space-y-3 border-t border-slate-200 mt-10">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-slate-600 font-medium">
          <Link href="/classic-barber/services" className="hover:text-amber-700">Services Menu</Link>
          <span>•</span>
          <Link href="/classic-barber/barbers" className="hover:text-amber-700">Our Barbers</Link>
          <span>•</span>
          <Link href="/classic-barber/memberships" className="hover:text-amber-700">VIP Memberships</Link>
          <span>•</span>
          <Link href="/classic-barber/reviews" className="hover:text-amber-700">Reviews & Ratings</Link>
          <span>•</span>
          <Link href="/classic-barber/products" className="hover:text-amber-700">In-Shop Products</Link>
        </div>
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 font-medium">
          <Link href="/admin/dashboard" className="hover:text-amber-700">Shop Admin Panel</Link>
          <span>•</span>
          <Link href="/worker" className="hover:text-amber-700">Barber Station</Link>
          <span>•</span>
          <Link href="/my-account" className="hover:text-amber-700">Customer Account</Link>
        </div>
        <p>© 2026 Classic Barber Shop. Powered by Barber Shop Management Software.</p>
      </footer>

      <CustomerBottomNav slug="classic-barber" />
    </div>
  );
}
