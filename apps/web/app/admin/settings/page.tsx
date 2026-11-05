'use client';

import React, { useEffect, useState, useRef } from 'react';
import { apiRequest } from '@/lib/api';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Settings,
  Store,
  Clock,
  QrCode,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
  Trash2,
  Image as ImageIcon,
  Check,
  Calendar,
  ShieldAlert,
  CreditCard,
  Key,
  Copy,
  Download,
  Database,
} from 'lucide-react';

const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  optional: boolean;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Setup Checklist State
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);

  // Profile Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [gstNo, setGstNo] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hasUpiQr, setHasUpiQr] = useState(false);

  // Business Hours State
  const [hours, setHours] = useState<
    Array<{ weekday: number; isClosed: boolean; openTime: string; closeTime: string }>
  >([]);

  // Booking Settings State
  const [cooldownHours, setCooldownHours] = useState('24');
  const [advanceDays, setAdvanceDays] = useState('30');

  // Payment Gateway State
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [maskedKeyId, setMaskedKeyId] = useState<string | null>(null);
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  // Backup & Archival State
  const [shopSlug, setShopSlug] = useState('');
  const [exportingBackup, setExportingBackup] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  function notify(text: string, type: 'success' | 'error' = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  async function loadSettings() {
    try {
      setLoading(true);
      const [shopData, setupData, gatewayData] = await Promise.all([
        apiRequest<any>('/shops/current'),
        apiRequest<{ complete: boolean; steps: SetupStep[] }>('/shops/current/setup').catch(() => null),
        apiRequest<{ configured: boolean; keyIdMasked: string | null }>('/payments/credentials').catch(() => null),
      ]);

      if (setupData) {
        setSetupComplete(setupData.complete);
        setSetupSteps(setupData.steps || []);
      }

      if (gatewayData) {
        setRazorpayConfigured(gatewayData.configured);
        setMaskedKeyId(gatewayData.keyIdMasked || null);
      }

      setName(shopData.name || '');
      setShopSlug(shopData.slug || '');
      setPhone(shopData.phone || '');
      setEmail(shopData.email || '');
      setAddress(shopData.address || '');
      setCity(shopData.city || '');
      setState(shopData.state || '');
      setCountry(shopData.country || 'India');
      setGstNo(shopData.gstNo || shopData.gst_no || '');
      setTimezone(shopData.timezone || 'Asia/Kolkata');
      setLogoUrl(shopData.logoUrl || null);
      setHasUpiQr(!!shopData.hasUpiQr);

      if (shopData.settings) {
        setCooldownHours(String(shopData.settings.cancellationCooldownHours ?? 24));
        setAdvanceDays(String(shopData.settings.advanceBookingDays ?? 30));
      }

      // Normalize hours across all 7 ISO days
      const hMap = new Map();
      for (const h of shopData.hours || []) {
        hMap.set(h.weekday, h);
      }
      const fullHours = WEEKDAYS.map((w) => {
        const found = hMap.get(w.id);
        return {
          weekday: w.id,
          isClosed: found ? !!found.isClosed || !!found.is_closed : false,
          openTime: found && !found.isClosed ? (found.openTime || found.open_time || '10:00').slice(0, 5) : '10:00',
          closeTime: found && !found.isClosed ? (found.closeTime || found.close_time || '21:00').slice(0, 5) : '21:00',
        };
      });
      setHours(fullHours);
    } catch (err: any) {
      notify(err.message || 'Failed to load shop settings.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const payload: Record<string, any> = {
        name: name.trim(),
        country: country.trim() || 'India',
        timezone: timezone.trim() || 'Asia/Kolkata',
      };
      if (phone.trim()) payload.phone = phone.trim();
      if (email.trim()) payload.email = email.trim();
      if (address.trim()) payload.address = address.trim();
      if (city.trim()) payload.city = city.trim();
      if (state.trim()) payload.state = state.trim();
      if (gstNo.trim()) payload.gstNo = gstNo.trim().toUpperCase();

      await apiRequest('/shops/current', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      notify('Shop profile details updated successfully.');
      loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveHours(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingHours(true);
      const cleanedHours = hours.map((h) => ({
        weekday: h.weekday,
        isClosed: h.isClosed,
        openTime: h.isClosed ? null : h.openTime,
        closeTime: h.isClosed ? null : h.closeTime,
      }));

      await apiRequest('/shops/current/hours', {
        method: 'PUT',
        body: JSON.stringify({ hours: cleanedHours }),
      });
      notify('Business operating hours saved successfully.');
      loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to update business hours.', 'error');
    } finally {
      setSavingHours(false);
    }
  }

  async function handleSaveBookingSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingSettings(true);
      await apiRequest('/shops/current/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          cancellationCooldownHours: parseInt(cooldownHours) || 24,
          advanceBookingDays: parseInt(advanceDays) || 30,
        }),
      });
      notify('Booking policies and cancellation rules saved.');
    } catch (err: any) {
      notify(err.message || 'Failed to save booking policies.', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveGateway(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingGateway(true);
      const res = await apiRequest<{ configured: boolean; keyId: string | null }>('/payments/credentials', {
        method: 'PATCH',
        body: JSON.stringify({
          razorpayKeyId: razorpayKeyId.trim() || null,
          razorpayKeySecret: razorpayKeySecret.trim() || null,
        }),
      });
      setRazorpayConfigured(res.configured);
      if (razorpayKeyId.trim()) {
        setMaskedKeyId(`${razorpayKeyId.trim().slice(0, 8)}••••••••`);
      } else {
        setMaskedKeyId(null);
      }
      setRazorpayKeySecret('');
      notify('Razorpay credentials updated successfully!');
    } catch (err: any) {
      notify(err.message || 'Failed to update payment gateway credentials.', 'error');
    } finally {
      setSavingGateway(false);
    }
  }

  async function handleDownloadBackup() {
    try {
      setExportingBackup(true);
      const res = await apiRequest<{ data: any }>('/shops/current/backup');
      const backupData = (res as any)?.data || res;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${shopSlug || 'shop'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Shop backup snapshot downloaded successfully!');
    } catch (err: any) {
      notify(err.message || 'Failed to export backup.', 'error');
    } finally {
      setExportingBackup(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('file', file);

      await apiRequest('/shops/current/logo', {
        method: 'POST',
        body: formData,
      });
      notify('Shop logo uploaded and re-encoded successfully.');
      await loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to upload logo image.', 'error');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    if (!confirm('Are you sure you want to remove the shop logo?')) return;
    try {
      setUploadingLogo(true);
      await apiRequest('/shops/current/logo', { method: 'DELETE' });
      notify('Shop logo removed.');
      await loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to remove logo.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingQr(true);
      const formData = new FormData();
      formData.append('file', file);

      await apiRequest('/shops/current/upi-qr', {
        method: 'POST',
        body: formData,
      });
      notify('Shop UPI QR payment code uploaded successfully.');
      await loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to upload UPI QR image.', 'error');
    } finally {
      setUploadingQr(false);
      if (qrInputRef.current) qrInputRef.current.value = '';
    }
  }

  async function handleRemoveQr() {
    if (!confirm('Are you sure you want to remove the shop UPI QR code?')) return;
    try {
      setUploadingQr(true);
      await apiRequest('/shops/current/upi-qr', { method: 'DELETE' });
      notify('Shop UPI QR payment code removed.');
      await loadSettings();
    } catch (err: any) {
      notify(err.message || 'Failed to remove UPI QR code.', 'error');
    } finally {
      setUploadingQr(false);
    }
  }

  const completedStepsCount = setupSteps.filter((s) => s.done).length;
  const progressPercent = setupSteps.length > 0 ? Math.round((completedStepsCount / setupSteps.length) * 100) : 100;

  return (
    <AdminLayout title="Shop Settings & Operations">
      {msg && (
        <div
          className={`mb-6 p-4 rounded-2xl text-xs flex items-center gap-2 shadow-md transition-all ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Setup Progress Checklist (Section 6) */}
          {setupSteps.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-amber-400" /> Shop Setup & Readiness Checklist
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Essential operational requirements to launch online customer booking.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {completedStepsCount} of {setupSteps.length} complete ({progressPercent}%)
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden mb-4 border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Step Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {setupSteps.map((step) => (
                  <div
                    key={step.key}
                    className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                      step.done
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        step.done ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span className="font-semibold truncate">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 1: Shop Profile Details (Section 6) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Store className="w-5 h-5 text-amber-400" /> Shop Details & Contact Info
            </h3>

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Shop Phone Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919876543210"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Public Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@shop.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={gstNo}
                  onChange={(e) => setGstNo(e.target.value)}
                  placeholder="29AAAAA0000A1Z5"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 100ft Road, Indiranagar"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bengaluru"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Karnataka"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Media, Logo & UPI QR Upload (Section 6, 28, 71) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Shop Logo Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-amber-400" /> Shop Logo (WebP)
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Public customer website logo. Strips EXIF metadata and re-encodes to WebP automatically.
                </p>

                <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800 mb-4">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Shop Logo"
                      className="w-20 h-20 rounded-2xl object-cover border border-slate-800"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}

                  <div className="text-xs">
                    <p className="font-bold text-white">
                      {logoUrl ? 'Logo Configured' : 'No Logo Uploaded'}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Recommended: square image, at least 256x256px
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={handleLogoUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={handleRemoveLogo}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                    title="Remove Logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* UPI QR Payment Code Card (Section 28) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-400" /> Shop UPI QR Code
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Private QR code displayed at the POS checkout terminal for customer scan-and-pay.
                </p>

                <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800 mb-4">
                  <div
                    className={`w-20 h-20 rounded-2xl border flex items-center justify-center ${
                      hasUpiQr
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-600'
                    }`}
                  >
                    <QrCode className="w-10 h-10" />
                  </div>

                  <div className="text-xs">
                    <p className="font-bold text-white">
                      {hasUpiQr ? 'Active POS QR Code' : 'No QR Code Configured'}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {hasUpiQr ? 'Ready for POS billing terminal' : 'Upload your GPay / PhonePe / Paytm QR'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <input
                  type="file"
                  ref={qrInputRef}
                  onChange={handleQrUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingQr}
                  onClick={() => qrInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingQr ? 'Uploading...' : 'Upload UPI QR'}
                </button>
                {hasUpiQr && (
                  <button
                    type="button"
                    disabled={uploadingQr}
                    onClick={handleRemoveQr}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                    title="Remove QR Code"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Business Hours (Section 6) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" /> Shop Working Hours & Days
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Online slot calculations strictly respect these working hours. Closed days are excluded from appointment booking.
            </p>

            <form onSubmit={handleSaveHours} className="space-y-3">
              {hours.map((h, idx) => {
                const day = WEEKDAYS.find((w) => w.id === h.weekday);
                return (
                  <div
                    key={h.weekday}
                    className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 w-36">
                      <input
                        type="checkbox"
                        checked={!h.isClosed}
                        onChange={(e) => {
                          const updated = [...hours];
                          updated[idx] = { ...h, isClosed: !e.target.checked };
                          setHours(updated);
                        }}
                        className="accent-amber-500"
                      />
                      <span className={`font-bold ${h.isClosed ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {day?.name}
                      </span>
                    </div>

                    {!h.isClosed ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">Open:</span>
                        <input
                          type="time"
                          value={h.openTime}
                          onChange={(e) => {
                            const updated = [...hours];
                            updated[idx] = { ...h, openTime: e.target.value };
                            setHours(updated);
                          }}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs"
                        />
                        <span className="text-slate-400 text-[11px]">Close:</span>
                        <input
                          type="time"
                          value={h.closeTime}
                          onChange={(e) => {
                            const updated = [...hours];
                            updated[idx] = { ...h, closeTime: e.target.value };
                            setHours(updated);
                          }}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-rose-400 font-bold uppercase text-[10px]">
                        Closed
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingHours}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  {savingHours ? 'Saving...' : 'Save Hours'}
                </button>
              </div>
            </form>
          </div>

          {/* Section 4: Booking & Cancellation Policies (Section 47) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" /> Booking & Cancellation Policies
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure online client booking horizon and cancellation cooldown bounds.
            </p>

            <form onSubmit={handleSaveBookingSettings} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Cancellation Cooldown Window (Hours)
                </label>
                <input
                  type="number"
                  min="0"
                  max="720"
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Customers cannot self-cancel appointments within this many hours of start time.
                </p>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                  Advance Booking Window (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={advanceDays}
                  onChange={(e) => setAdvanceDays(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Maximum number of days in the future customers can book slots.
                </p>
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? 'Saving...' : 'Save Booking Policies'}
                </button>
              </div>
            </form>
          </div>

          {/* Card 5: Online Payment Gateway (Razorpay) */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Online Payment Gateway (Razorpay)</h3>
                    {razorpayConfigured ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                        Default Dev Sandbox
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Accept UPI, credit/debit cards, and netbanking directly into your merchant account.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveGateway} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Razorpay Key ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={maskedKeyId || 'rzp_live_... or rzp_test_...'}
                      value={razorpayKeyId}
                      onChange={(e) => setRazorpayKeyId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <Key className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500" />
                  </div>
                  {maskedKeyId && (
                    <p className="text-[10px] text-emerald-400/80 mt-1">
                      Currently configured: {maskedKeyId}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                    Razorpay Key Secret
                  </label>
                  <input
                    type="password"
                    placeholder="Enter new secret key to update..."
                    value={razorpayKeySecret}
                    onChange={(e) => setRazorpayKeySecret(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Encrypted and stored with PostgreSQL RLS security.
                  </p>
                </div>
              </div>

              {/* Webhook Callback Info */}
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Webhook Notification URL:</span>{' '}
                  <code className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded text-[10px]">
                    /api/v1/payments/razorpay/webhook
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/v1/payments/razorpay/webhook`);
                    notify('Webhook URL copied to clipboard!');
                  }}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <Copy className="w-3 h-3" /> Copy URL
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingGateway}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  {savingGateway ? 'Saving...' : 'Save Payment Gateway'}
                </button>
              </div>
            </form>
          </div>

          {/* Database Backup & Disaster Recovery */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Shop Database Backup & Offline Archival
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      RLS Isolated
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Export an encrypted, tenant-isolated snapshot of your entire shop data (appointments, clients, sales, commissions, inventory) for off-site disaster recovery and archival.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Full 35-Table Tenant Snapshot</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Includes customer profiles, appointments, queue logs, POS invoices, inventory movements, commissions, and staff attendance strictly bounded to your shop.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={exportingBackup}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all self-start md:self-auto cursor-pointer disabled:opacity-50"
              >
                {exportingBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Exporting Snapshot...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Shop Backup (.json)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
