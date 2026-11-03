'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { MapPin, ChevronDown, Check, Building2, ExternalLink } from 'lucide-react';

interface BranchItem {
  slug: string;
  name: string;
  city?: string;
  state?: string;
  logoUrl?: string | null;
}

interface BranchSwitcherProps {
  currentShop: { id: string; name: string; slug: string } | null;
}

export default function BranchSwitcher({ currentShop }: BranchSwitcherProps) {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string>(currentShop?.slug || 'classic-barber');

  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await apiRequest<{ items: BranchItem[] }>('/shops/public?limit=10');
        if (res.items && res.items.length > 0) {
          setBranches(res.items);
        } else if (currentShop) {
          setBranches([{ slug: currentShop.slug, name: currentShop.name }]);
        }
      } catch {
        if (currentShop) {
          setBranches([{ slug: currentShop.slug, name: currentShop.name }]);
        }
      }
    }
    loadBranches();
  }, [currentShop]);

  const activeBranch = branches.find((b) => b.slug === selectedSlug) || {
    slug: currentShop?.slug || 'classic-barber',
    name: currentShop?.name || 'Classic Barber',
    city: 'Bengaluru',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-left hover:border-slate-700 transition-colors"
        title="Switch Branch Location"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="truncate">
            <div className="text-[11px] font-bold text-white truncate">
              {activeBranch.name}
            </div>
            {activeBranch.city && (
              <div className="text-[9px] text-slate-400 truncate">
                {activeBranch.city} Branch
              </div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Branch Locations
            </div>
            {branches.map((b) => {
              const isCurrent = b.slug === activeBranch.slug;
              return (
                <div
                  key={b.slug}
                  onClick={() => {
                    setSelectedSlug(b.slug);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-amber-500/10 text-amber-300 font-bold border border-amber-500/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="truncate">
                    <div className="truncate">{b.name}</div>
                    {b.city && <div className="text-[10px] text-slate-400 font-normal">{b.city}</div>}
                  </div>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-2" />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
