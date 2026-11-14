'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, saveSession, UserSession } from '@/lib/api';
import { Scissors, ShieldCheck, UserCheck, ArrowRight, Lock, Phone, Mail, Sparkles, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(idVal?: string, pwdVal?: string) {
    const activeId = idVal ?? identifier;
    const activePwd = pwdVal ?? password;

    if (!activeId || !activePwd) {
      setError('Please enter your mobile/email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await apiRequest<{
        user: { id: string; type: 'platform' | 'staff' | 'customer'; name: string; phone: string | null; email: string | null; roles?: any[] };
        shop: { id: string; name: string; slug: string } | null;
        isOwner: boolean;
        permissions: Record<string, string>;
        csrfToken: string;
        accessToken?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: activeId, password: activePwd }),
      });

      const sessionUser: UserSession = {
        id: res.user.id,
        type: res.user.type,
        name: res.user.name,
        phone: res.user.phone,
        email: res.user.email,
        shop: res.shop,
        isOwner: res.isOwner,
        permissions: res.permissions,
      };

      saveSession(res.accessToken || '', res.csrfToken, sessionUser);

      // Routing logic
      if (returnTo) {
        router.push(returnTo);
      } else if (res.user.type === 'staff') {
        const isWorkerOnly = res.user.roles?.some((r: any) => r.name?.toLowerCase().includes('worker')) && !res.isOwner;
        if (isWorkerOnly && !res.permissions?.['dashboard.view']) {
          router.push('/worker');
        } else {
          router.push('/admin/dashboard');
        }
      } else if (res.user.type === 'platform') {
        router.push('/admin/dashboard');
      } else {
        router.push('/my-account');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(type: 'owner' | 'worker' | 'customer') {
    if (type === 'owner') {
      setIdentifier('owner@classicbarber.com');
      setPassword('ClassicOwner#123');
      handleLogin('owner@classicbarber.com', 'ClassicOwner#123');
    } else if (type === 'worker') {
      setIdentifier('rahul@classicbarber.com');
      setPassword('WorkerPass#123');
      handleLogin('rahul@classicbarber.com', 'WorkerPass#123');
    } else {
      setIdentifier('+919876599001');
      setPassword('CustomerPass#123');
      handleLogin('+919876599001', 'CustomerPass#123');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-lg shadow-amber-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Scissors className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <div className="text-left">
              <div className="font-black text-xl tracking-tight text-white flex items-center gap-1.5">
                BARBER <span className="text-amber-400 font-light">PRO</span>
              </div>
              <div className="text-[10px] tracking-widest text-slate-400 font-medium uppercase">
                Enterprise Studio Suite
              </div>
            </div>
          </Link>
          <h1 className="text-2xl font-black text-white mt-6">Welcome Back</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Demo Fast Login Pills */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl">
          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-2.5">
            <Sparkles className="w-3.5 h-3.5" /> One-Click Demo Access
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('owner')}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/20 border border-slate-700/60 hover:border-amber-500/40 text-left transition-all text-xs"
            >
              <div className="font-bold text-slate-200">Shop Owner</div>
              <div className="text-[10px] text-slate-400 truncate">Vikram Malhotra</div>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('worker')}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/20 border border-slate-700/60 hover:border-amber-500/40 text-left transition-all text-xs"
            >
              <div className="font-bold text-slate-200">Barber Staff</div>
              <div className="text-[10px] text-slate-400 truncate">Rahul (Master Barber)</div>
            </button>
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-2">
                Mobile Number or Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. +919876500001 or owner@classicbarber.com"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-400">
              Don't have an account yet?{' '}
              <Link href="/auth/register" className="text-amber-400 hover:underline font-semibold">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          BarberPro Management Software &bull; Multi-Tenant Enterprise
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
