'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Scissors,
  User,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import CustomerNavbar from '@/components/customer/Navbar';
import CustomerBottomNav from '@/components/customer/BottomNav';
import { apiRequest, formatINR, getSession } from '@/lib/api';
import { AppointmentItem, ServiceItem, TimeSlot, WorkerItem } from '@barbershop/shared';

function BookingWizardContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = (params.slug as string) || 'classic-barber';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Data loaded from API
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [workers, setWorkers] = useState<Array<{ id: string; displayName: string; serviceIds: string[] }>>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);

  // User selections
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('any'); // 'any' or worker UUID
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Tomorrow by default or today
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Customer Contact Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');

  // State
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<AppointmentItem | null>(null);

  // Prefill preselected service or worker if passed in query param
  useEffect(() => {
    const preselectedService = searchParams.get('serviceId');
    if (preselectedService) {
      setSelectedServiceIds([preselectedService]);
    }

    const preselectedWorker = searchParams.get('workerId');
    if (preselectedWorker) {
      setSelectedWorkerId(preselectedWorker);
    }

    const session = getSession();
    if (session) {
      setCustomerName(session.name);
      if (session.phone) setCustomerPhone(session.phone);
      if (session.email) setCustomerEmail(session.email);
    }
  }, [searchParams]);

  // Load services and workers on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest<{ services: ServiceItem[] }>(`/services/public/${slug}`),
      apiRequest<Array<{ id: string; displayName: string; serviceIds: string[] }>>(`/workers/public/${slug}`),
    ])
      .then(([svcData, workerData]) => {
        setServices(svcData.services);
        setWorkers(workerData);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load shop details.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch slots whenever date, services, or worker selection changes
  useEffect(() => {
    if (selectedServiceIds.length === 0 || !selectedDate) {
      setSlots([]);
      return;
    }

    setSlotsLoading(true);
    setError(null);
    const workerQuery = selectedWorkerId !== 'any' ? `&workerId=${selectedWorkerId}` : '';
    const svcQuery = selectedServiceIds.join(',');

    apiRequest<{ slots: TimeSlot[]; totalDurationMinutes: number }>(
      `/appointments/public/${slug}/slots?date=${selectedDate}&serviceIds=${svcQuery}${workerQuery}`
    )
      .then((data: { slots: TimeSlot[]; totalDurationMinutes: number }) => {
        setSlots(data.slots);
        if (!data.slots.some((s: TimeSlot) => s.time === selectedTime)) {
          setSelectedTime('');
        }
      })
      .catch((err: any) => {
        setSlots([]);
        setError(err.message || 'No available slots for this selection.');
      })
      .finally(() => setSlotsLoading(false));
  }, [slug, selectedDate, selectedServiceIds, selectedWorkerId]);

  // Calculations
  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const totalAmountPaise = selectedServices.reduce((acc, s) => acc + s.pricePaise, 0);
  const totalDurationMinutes = selectedServices.reduce((acc, s) => acc + s.durationMinutes, 0);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !selectedTime) {
      setError('Please provide your name, phone, and pick a time slot.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const apt = await apiRequest<AppointmentItem>(`/appointments/public/${slug}/book`, {
        method: 'POST',
        body: JSON.stringify({
          name: customerName,
          phone: customerPhone,
          email: customerEmail || undefined,
          date: selectedDate,
          startTime: selectedTime,
          serviceIds: selectedServiceIds,
          workerId: selectedWorkerId !== 'any' ? selectedWorkerId : undefined,
          notes: notes || undefined,
        }),
      });
      setConfirmedAppointment(apt);
    } catch (err: any) {
      setError(err.message || 'Booking failed. Please try a different slot.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedAppointment) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <CustomerNavbar slug={slug} />
        <main className="max-w-lg mx-auto p-4 pt-8">
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-emerald-100 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="w-9 h-9" />
            </div>

            <div>
              <span className="text-xs font-bold tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase">
                Appointment Confirmed
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2">
                Booking #{confirmedAppointment.appointmentNumber}
              </h2>
              <p className="text-xs text-slate-500 mt-1">We look forward to welcoming you!</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-3 border border-slate-100 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Date & Time</span>
                <span className="font-bold text-slate-800">
                  {confirmedAppointment.date} at {confirmedAppointment.startTime}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Stylist</span>
                <span className="font-bold text-amber-700">
                  {confirmedAppointment.workerName || 'Assigned on arrival'}
                </span>
              </div>
              <div className="flex justify-between items-start pb-2 border-b border-slate-200">
                <span className="text-slate-500">Services</span>
                <div className="text-right">
                  {confirmedAppointment.services.map((s) => (
                    <div key={s.id} className="font-semibold text-slate-800">
                      {s.serviceName} ({formatINR(s.unitPricePaise)})
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-1 text-base">
                <span className="font-bold text-slate-900">Total Payable at Shop</span>
                <span className="font-extrabold text-amber-700">
                  {formatINR(confirmedAppointment.totalAmountPaise)}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Payment is made physically at the shop via Cash or UPI QR scan upon completion.
            </p>

            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                href="/my-account"
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-center shadow-md shadow-amber-600/20 active:scale-95 transition"
              >
                View in My Appointments
              </Link>
              <button
                onClick={() => {
                  setConfirmedAppointment(null);
                  setSelectedServiceIds([]);
                  setSelectedTime('');
                  setStep(1);
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Book Another Appointment
              </button>
            </div>
          </div>
        </main>
        <CustomerBottomNav slug={slug} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <CustomerNavbar slug={slug} />

      <main className="max-w-xl mx-auto px-4 py-6">
        {/* Progress Tracker */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span className={step >= 1 ? 'text-amber-700' : ''}>1. Services</span>
            <span className={step >= 2 ? 'text-amber-700' : ''}>2. Barber</span>
            <span className={step >= 3 ? 'text-amber-700' : ''}>3. Time Slot</span>
            <span className={step >= 4 ? 'text-amber-700' : ''}>4. Confirm</span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-amber-600 transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: SERVICES SELECTION */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Choose Services</h2>
              <p className="text-xs text-slate-500">You can select multiple services for your visit</p>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {services.map((svc) => {
                  const isSelected = selectedServiceIds.includes(svc.id);
                  return (
                    <div
                      key={svc.id}
                      onClick={() => toggleService(svc.id)}
                      className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between select-none ${
                        isSelected
                          ? 'bg-amber-50/60 border-amber-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border transition ${
                            isSelected
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{svc.name}</h3>
                          {svc.description && (
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{svc.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                            <span>{svc.durationMinutes} mins</span>
                          </div>
                        </div>
                      </div>

                      <span className="font-extrabold text-sm text-amber-800">
                        {formatINR(svc.pricePaise)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: BARBER SELECTION */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Select Barber</h2>
              <p className="text-xs text-slate-500">Choose a preferred stylist or any available barber</p>
            </div>

            <div className="space-y-2.5">
              {/* Any Available Barber Option */}
              <div
                onClick={() => setSelectedWorkerId('any')}
                className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between select-none ${
                  selectedWorkerId === 'any'
                    ? 'bg-amber-50/60 border-amber-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Any Available Barber</h3>
                    <p className="text-xs text-slate-500">Fastest booking with any eligible stylist</p>
                  </div>
                </div>
                {selectedWorkerId === 'any' && (
                  <CheckCircle className="w-5 h-5 text-amber-600" />
                )}
              </div>

              {/* Specific Workers */}
              {workers.map((worker) => {
                const isSelected = selectedWorkerId === worker.id;
                // Check if worker can perform all selected services
                const canPerform = selectedServiceIds.every((sid) =>
                  worker.serviceIds.includes(sid)
                );

                return (
                  <div
                    key={worker.id}
                    onClick={() => {
                      if (canPerform) setSelectedWorkerId(worker.id);
                    }}
                    className={`p-4 rounded-2xl border transition flex items-center justify-between select-none ${
                      !canPerform
                        ? 'opacity-50 bg-slate-100 cursor-not-allowed border-slate-200'
                        : isSelected
                        ? 'bg-amber-50/60 border-amber-500 shadow-sm cursor-pointer'
                        : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                        {worker.displayName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{worker.displayName}</h3>
                        <p className="text-[11px] text-slate-500">
                          {canPerform ? 'Available for selected services' : 'Cannot perform one of your selected services'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle className="w-5 h-5 text-amber-600" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: DATE & TIME SLOT SELECTION */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Pick Date & Time</h2>
              <p className="text-xs text-slate-500">
                Duration: {totalDurationMinutes} mins total
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                Select Date
              </label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">
                Available Time Slots
              </label>

              {slotsLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-11 bg-white rounded-xl border border-slate-200 animate-pulse" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                  <Clock className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                  <p className="font-semibold text-slate-700">No open slots on this date</p>
                  <p>The shop is closed or fully booked. Please choose another date or barber.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => {
                    const isSelected = selectedTime === s.time;
                    return (
                      <button
                        key={s.time}
                        type="button"
                        onClick={() => setSelectedTime(s.time)}
                        className={`py-2.5 px-3 rounded-xl border text-center text-xs font-bold transition active:scale-95 ${
                          isSelected
                            ? 'bg-amber-600 border-amber-600 text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400'
                        }`}
                      >
                        {s.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: CONTACT & CONFIRMATION */}
        {step === 4 && (
          <form onSubmit={handleBook} className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Review & Confirm</h2>
              <p className="text-xs text-slate-500">Enter your details to finalize your appointment</p>
            </div>

            {/* Booking Summary Box */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Slot:</span>
                <span className="font-bold text-slate-900">{selectedDate} at {selectedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Stylist:</span>
                <span className="font-bold text-amber-800">
                  {selectedWorkerId === 'any'
                    ? 'Any Available Barber'
                    : workers.find((w) => w.id === selectedWorkerId)?.displayName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Services ({selectedServices.length}):</span>
                <span className="font-semibold text-slate-800 text-right">
                  {selectedServices.map((s) => s.name).join(', ')}
                </span>
              </div>
              <div className="pt-2 border-t border-amber-200/80 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Amount:</span>
                <span className="text-amber-800 font-extrabold">{formatINR(totalAmountPaise)}</span>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Grooming Preferences / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Prefer short crop, fade on sides"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 text-center transition active:scale-95"
            >
              {submitting ? 'Confirming Booking...' : `Confirm & Book (${formatINR(totalAmountPaise)})`}
            </button>
          </form>
        )}

        {/* BOTTOM FIXED ACTION BAR */}
        {step < 4 && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3.5 shadow-lg">
            <div className="max-w-xl mx-auto flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Selected Total</span>
                <span className="font-extrabold text-base text-slate-900">
                  {formatINR(totalAmountPaise)}
                </span>
                <span className="text-[11px] text-slate-500 ml-1.5">({totalDurationMinutes} mins)</span>
              </div>

              <div className="flex items-center gap-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s - 1) as any)}
                    className="p-2.5 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-100 transition"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                <button
                  type="button"
                  disabled={
                    (step === 1 && selectedServiceIds.length === 0) ||
                    (step === 3 && !selectedTime)
                  }
                  onClick={() => setStep((s) => (s + 1) as any)}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition active:scale-95 flex items-center gap-1"
                >
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <CustomerBottomNav slug={slug} />
    </div>
  );
}

export default function BookingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BookingWizardContent />
    </Suspense>
  );
}
