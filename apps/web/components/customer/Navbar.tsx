'use client';

import Link from 'next/link';
import { Scissors, Calendar, User, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSession, UserSession } from '@/lib/api';

export default function CustomerNavbar({ slug, shopSlug }: { slug?: string; shopSlug?: string }) {
  const activeSlug = shopSlug || slug || 'classic-barber';
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    setUser(getSession());
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={`/${activeSlug}`} className="flex items-center gap-2.5 font-bold text-lg text-slate-900 group">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20 group-hover:bg-amber-700 transition">
            <Scissors className="w-5 h-5 -rotate-45" />
          </div>
          <span className="tracking-tight">Classic Barber</span>
        </Link>

        {/* Desktop / Tablet links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href={`/${activeSlug}/services`} className="hover:text-amber-700 transition">Services</Link>
          <Link href={`/${activeSlug}/barbers`} className="hover:text-amber-700 transition">Barbers</Link>
          <Link href={`/${activeSlug}/products`} className="hover:text-amber-700 transition">Products</Link>
          {user ? (
            <Link href="/my-account" className="flex items-center gap-1.5 text-slate-900 hover:text-amber-700 font-semibold">
              <User className="w-4 h-4 text-amber-600" />
              <span>{user.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link href="/auth/login" className="hover:text-slate-900">Sign In</Link>
          )}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/${activeSlug}/book`}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            <Calendar className="w-4 h-4" />
            <span>Book Now</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
