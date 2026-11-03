'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSession, clearSession, UserSession } from '@/lib/api';
import {
  Scissors,
  LayoutDashboard,
  Calendar,
  CreditCard,
  Users,
  Briefcase,
  Package,
  TrendingUp,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  Award,
  Ticket,
  UserCheck,
  Star,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import BranchSwitcher from './BranchSwitcher';

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

export default function AdminLayout({ children, title, actions }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<UserSession | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.push('/auth/login?returnTo=' + encodeURIComponent(pathname));
      return;
    }
    if (s.type === 'customer') {
      router.push('/my-account');
      return;
    }
    setSession(s);
  }, [router, pathname]);

  function handleLogout() {
    clearSession();
    router.push('/auth/login');
  }

  const navItems = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Appointments', href: '/admin/appointments', icon: Calendar },
    { label: 'Billing / POS', href: '/admin/billing', icon: CreditCard },
    { label: 'Customers', href: '/admin/customers', icon: Users },
    { label: 'Services', href: '/admin/services', icon: Scissors },
    { label: 'Workers / Staff', href: '/admin/workers', icon: Briefcase },
    { label: 'Staff Attendance', href: '/admin/attendance', icon: UserCheck },
    { label: 'Products & Stock', href: '/admin/inventory', icon: Package },
    { label: 'Finance & Expenses', href: '/admin/finance', icon: TrendingUp },
    { label: 'Reports & Analytics', href: '/admin/reports', icon: BarChart3 },
    { label: 'Loyalty & Plans', href: '/admin/memberships', icon: Award },
    { label: 'Offers & Coupons', href: '/admin/coupons', icon: Ticket },
    { label: 'Reviews & Ratings', href: '/admin/reviews', icon: Star },
    { label: 'Shop Settings', href: '/admin/settings', icon: Settings },
  ];

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-black tracking-tight text-white uppercase">
                {session.shop?.name || 'BarberPro Admin'}
              </div>
              <div className="text-[10px] text-amber-400 font-semibold">Management Console</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link
            href="/worker"
            className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1"
          >
            <Smartphone className="w-3.5 h-3.5" /> Worker
          </Link>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transform transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo & Shop Details */}
          <div className="p-4 border-b border-slate-800/80 space-y-3">
            <Link href="/admin/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-md shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Scissors className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              <div className="truncate">
                <h1 className="font-black text-sm tracking-tight text-white leading-tight truncate">
                  {session.shop?.name || 'Classic Barber'}
                </h1>
                <div className="text-[10px] text-amber-400 font-semibold tracking-wider uppercase mt-0.5">
                  {session.isOwner ? 'Shop Owner' : 'Staff Admin'}
                </div>
              </div>
            </Link>
            <BranchSwitcher currentShop={session.shop ?? null} />
          </div>

          {/* Nav List */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-slate-950' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions & Session Info */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {/* View Switchers */}
          <div className="grid grid-cols-2 gap-1.5">
            <Link
              href="/worker"
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700/60 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              Worker View
            </Link>
            <Link
              href={`/${session.shop?.slug || 'classic-barber'}`}
              target="_blank"
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700/60 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              Live Site
            </Link>
          </div>

          {/* User Profile & Logout */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div className="truncate pr-2">
              <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1">
                {session.name}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {session.email || session.phone}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="px-6 py-4 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
