'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Scissors, ShoppingBag, User } from 'lucide-react';

export default function CustomerBottomNav({ slug, shopSlug }: { slug?: string; shopSlug?: string }) {
  const activeSlug = shopSlug || slug || 'classic-barber';
  const pathname = usePathname();

  const links = [
    { href: `/${activeSlug}`, label: 'Home', icon: Home },
    { href: `/${activeSlug}/services`, label: 'Services', icon: Scissors },
    { href: `/${activeSlug}/book`, label: 'Book', icon: Calendar, highlight: true },
    { href: `/${activeSlug}/products`, label: 'Products', icon: ShoppingBag },
    { href: `/my-account`, label: 'Account', icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-3 py-1.5 flex items-center justify-around shadow-lg">
      {links.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        if (item.highlight) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-600/30 active:scale-95 transition">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-semibold text-amber-700 mt-1">Book</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center py-1 px-2.5 rounded-lg transition ${
              isActive ? 'text-amber-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
