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
  Tag,
  X,
  Download,
  CalendarPlus,
} from 'lucide-react';
import CustomerNavbar from '@/components/customer/Navbar';
import CustomerBottomNav from '@/components/customer/BottomNav';
import { apiRequest, formatINR, getSession } from '@/lib/api';
import { AppointmentItem, ServiceItem, TimeSlot, WorkerItem } from '@barbershop/shared';

type Lang = 'en' | 'hi';

const TRANSLATIONS = {
  en: {
    pageTitle: 'Book Appointment',
    pageSubtitle: 'Select services, preferred barber, and appointment time',
    step1: 'Services',
    step2: 'Barber',
    step3: 'Time Slot',
    step4: 'Confirm',
    chooseServices: 'Choose Services',
    chooseServicesDesc: 'You can select multiple services for your visit',
    mins: 'mins',
    selectBarber: 'Select Barber',
    selectBarberDesc: 'Choose a preferred stylist or any available barber',
    anyBarber: 'Any Available Barber',
    anyBarberDesc: 'Fastest booking with any eligible stylist',
    availableForSelected: 'Available for selected services',
    cannotPerform: 'Cannot perform one of your selected services',
    pickDateTime: 'Pick Date & Time',
    durationLabel: 'Duration',
    selectDate: 'Select Date',
    availableSlots: 'Available Time Slots',
    noOpenSlots: 'No open slots on this date',
    noSlotsDesc: 'The shop is closed or fully booked. Please choose another date or barber.',
    reviewConfirm: 'Review & Confirm',
    reviewConfirmDesc: 'Enter your details to finalize your appointment',
    dateAndSlot: 'Date & Slot',
    stylist: 'Stylist',
    servicesLabel: 'Services',
    servicesSubtotal: 'Services Subtotal',
    promoApplied: 'Promo Applied',
    save: 'Save',
    estimatedTotalPayable: 'Estimated Total Payable',
    totalPayableAtShop: 'Total Payable at Shop',
    havePromo: 'Have a Promo Code?',
    removePromo: 'Remove',
    enterPromoPlaceholder: 'Enter promo code (e.g. WELCOME10)',
    apply: 'Apply',
    checking: 'Checking...',
    activePromos: 'Active Promotional Offers (Tap to apply)',
    off: 'OFF',
    yourFullName: 'Your Full Name *',
    namePlaceholder: 'e.g. Rahul Sharma',
    mobileNumber: 'Mobile Phone Number *',
    phonePlaceholder: 'e.g. 9876543210',
    emailAddress: 'Email Address (Optional)',
    emailPlaceholder: 'e.g. rahul@example.com',
    groomingNotes: 'Grooming Preferences / Notes',
    notesPlaceholder: 'e.g. Prefer short crop, fade on sides',
    confirmAndBook: 'Confirm & Book',
    confirmingBooking: 'Confirming Booking...',
    selectedTotal: 'Selected Total',
    continue: 'Continue',
    apptConfirmed: 'Appointment Confirmed',
    bookingNum: 'Booking #',
    welcomeMsg: 'We look forward to welcoming you!',
    payNotice: 'Payment is made physically at the shop via Cash or UPI QR scan upon completion.',
    viewInAccount: 'View in My Appointments',
    bookAnother: 'Book Another Appointment',
    at: 'at',
    assignedOnArrival: 'Assigned on arrival',
    addToGoogleCalendar: 'Add to Google Calendar',
    downloadIcs: 'Download Calendar (.ics)',
  },
  hi: {
    pageTitle: 'अपॉइंटमेंट बुक करें',
    pageSubtitle: 'सेवाएं, पसंदीदा स्टाइलिस्ट और समय स्लॉट चुनें',
    step1: 'सेवाएं',
    step2: 'स्टाइलिस्ट',
    step3: 'समय',
    step4: 'पुष्टि',
    chooseServices: 'सेवाएं चुनें',
    chooseServicesDesc: 'अपनी पसंद की एक या अधिक सेवाएं चुन सकते हैं',
    mins: 'मिनट',
    selectBarber: 'स्टाइलिस्ट चुनें',
    selectBarberDesc: 'पसंदीदा स्टाइलिस्ट या कोई भी उपलब्ध नाई चुनें',
    anyBarber: 'कोई भी उपलब्ध स्टाइलिस्ट',
    anyBarberDesc: 'पहली उपलब्ध कुर्सी • सबसे तेज़ बुकिंग',
    availableForSelected: 'चयनित सेवाओं के लिए उपलब्ध',
    cannotPerform: 'चयनित सेवा उपलब्ध नहीं है',
    pickDateTime: 'तारीख और समय चुनें',
    durationLabel: 'समय',
    selectDate: 'तारीख चुनें',
    availableSlots: 'उपलब्ध समय स्लॉट',
    noOpenSlots: 'इस तारीख पर कोई स्लॉट उपलब्ध नहीं है',
    noSlotsDesc: 'सैलून बंद है या पूरी तरह बुक है। कृपया दूसरी तारीख चुनें।',
    reviewConfirm: 'समीक्षा और पुष्टि',
    reviewConfirmDesc: 'अपॉइंटमेंट पूरा करने के लिए अपना विवरण दर्ज करें',
    dateAndSlot: 'तारीख और समय',
    stylist: 'स्टाइलिस्ट',
    servicesLabel: 'सेवाएं',
    servicesSubtotal: 'सेवाओं का उप-कुल',
    promoApplied: 'प्रोमो कोड लागू',
    save: 'बचत',
    estimatedTotalPayable: 'अनुमानित कुल देय',
    totalPayableAtShop: 'सैलून पर कुल देय',
    havePromo: 'क्या आपके पास प्रोमो कोड है?',
    removePromo: 'हटाएं',
    enterPromoPlaceholder: 'प्रोमो कोड दर्ज करें (उदा. WELCOME10)',
    apply: 'लागू करें',
    checking: 'जांच रहे हैं...',
    activePromos: 'सक्रिय प्रमोशनल ऑफ़र (लागू करने के लिए टैप करें)',
    off: 'छूट',
    yourFullName: 'आपका पूरा नाम *',
    namePlaceholder: 'उदा. राहुल शर्मा',
    mobileNumber: 'मोबाइल फोन नंबर *',
    phonePlaceholder: 'उदा. 9876543210',
    emailAddress: 'ईमेल पता (वैकल्पिक)',
    emailPlaceholder: 'उदा. rahul@example.com',
    groomingNotes: 'विशेष निर्देश / पसंद',
    notesPlaceholder: 'उदा. फेड कट, दाढ़ी ट्रिम',
    confirmAndBook: 'पुष्टि करें और बुक करें',
    confirmingBooking: 'बुकिंग की पुष्टि हो रही है...',
    selectedTotal: 'चुना हुआ कुल',
    continue: 'आगे बढ़ें',
    apptConfirmed: 'अपॉइंटमेंट कन्फ़र्म हो गया',
    bookingNum: 'बुकिंग सं.',
    welcomeMsg: 'हम आपका स्वागत करने के लिए उत्सुक हैं!',
    payNotice: 'भुगतान सेवा पूरी होने पर सैलून में नकद या UPI QR द्वारा किया जाता है।',
    viewInAccount: 'मेरी अपॉइंटमेंट्स देखें',
    bookAnother: 'एक और अपॉइंटमेंट बुक करें',
    at: 'को',
    assignedOnArrival: 'पहुंचने पर निर्धारित',
    addToGoogleCalendar: 'गूगल कैलेंडर में जोड़ें',
    downloadIcs: 'कैलेंडर फाइल (.ics) डाउनलोड करें',
  },
};

function BookingWizardContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = (params.slug as string) || 'classic-barber';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('barber_booking_lang') as Lang;
      if (savedLang === 'en' || savedLang === 'hi') {
        setLang(savedLang);
      }
    }
  }, []);

  const handleLanguageChange = (newLang: Lang) => {
    setLang(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('barber_booking_lang', newLang);
    }
  };

  const t = TRANSLATIONS[lang];

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

  // Public Coupons & Promos
  const [availableOffers, setAvailableOffers] = useState<
    Array<{
      id: string;
      code: string;
      description?: string;
      discountType: string;
      discountValue: number;
      maxDiscountPaise?: number | null;
      minOrderPaise: number;
      applicableTo: string;
    }>
  >([]);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPaise: number;
    message: string;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

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
      apiRequest<Array<{ id: string; displayName: string; serviceIds: string[] }>>(`/shops/public/${slug}/barbers`),
      apiRequest<Array<any>>(`/coupons/public/${slug}`).catch(() => []),
    ])
      .then(([svcData, workerData, couponData]) => {
        setServices(svcData.services);
        setWorkers(workerData);
        if (Array.isArray(couponData)) {
          setAvailableOffers(couponData);
        }
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
  const discountPaise = appliedCoupon ? appliedCoupon.discountPaise : 0;
  const estimatedPayablePaise = Math.max(0, totalAmountPaise - discountPaise);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponCodeInput).trim().toUpperCase();
    if (!code) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    setValidatingCoupon(true);
    setCouponError(null);
    setCouponSuccess(null);

    try {
      const res = await apiRequest<{
        valid: boolean;
        discountPaise: number;
        message: string;
      }>(`/coupons/public/${slug}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          code,
          customerPhone: customerPhone || undefined,
          subtotalPaise: totalAmountPaise,
          servicesTotalPaise: totalAmountPaise,
          productsTotalPaise: 0,
        }),
      });

      if (res.valid) {
        setAppliedCoupon({
          code,
          discountPaise: res.discountPaise,
          message: res.message,
        });
        setCouponSuccess(res.message);
        setCouponCodeInput(code);
      } else {
        setAppliedCoupon(null);
        setCouponError(res.message || 'Invalid coupon code');
      }
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponError(err.message || 'Failed to validate coupon code.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponSuccess(null);
    setCouponCodeInput('');
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
          couponCode: appliedCoupon ? appliedCoupon.code : undefined,
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
                {t.apptConfirmed}
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2">
                {t.bookingNum}{confirmedAppointment.appointmentNumber}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{t.welcomeMsg}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-3 border border-slate-100 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">{t.dateAndSlot}</span>
                <span className="font-bold text-slate-800">
                  {confirmedAppointment.date} {t.at} {confirmedAppointment.startTime}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">{t.stylist}</span>
                <span className="font-bold text-amber-700">
                  {confirmedAppointment.workerName || t.assignedOnArrival}
                </span>
              </div>
              <div className="flex justify-between items-start pb-2 border-b border-slate-200">
                <span className="text-slate-500">{t.servicesLabel}</span>
                <div className="text-right">
                  {confirmedAppointment.services.map((s) => (
                    <div key={s.id} className="font-semibold text-slate-800">
                      {s.serviceName} ({formatINR(s.unitPricePaise)})
                    </div>
                  ))}
                </div>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 text-emerald-700">
                  <span className="flex items-center gap-1 font-medium">
                    <Tag className="w-3.5 h-3.5" />
                    {t.promoApplied} ({appliedCoupon.code})
                  </span>
                  <span className="font-bold">{t.save} {formatINR(appliedCoupon.discountPaise)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 text-base">
                <span className="font-bold text-slate-900">{t.totalPayableAtShop}</span>
                <div className="text-right">
                  {appliedCoupon && (
                    <span className="text-xs text-slate-400 line-through mr-1.5">
                      {formatINR(confirmedAppointment.totalAmountPaise)}
                    </span>
                  )}
                  <span className="font-extrabold text-amber-700">
                    {formatINR(Math.max(0, confirmedAppointment.totalAmountPaise - discountPaise))}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              {t.payNotice}
            </p>

            {/* Calendar Integration */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                  `Haircut & Grooming (${confirmedAppointment.workerName || 'Barber'})`
                )}&dates=${confirmedAppointment.date.replace(/-/g, '')}T${confirmedAppointment.startTime.replace(
                  /:/g,
                  ''
                )}00/${confirmedAppointment.date.replace(/-/g, '')}T${(
                  confirmedAppointment.endTime || confirmedAppointment.startTime
                ).replace(/:/g, '')}00&details=${encodeURIComponent(
                  `Appointment #${confirmedAppointment.appointmentNumber}\nStylist: ${
                    confirmedAppointment.workerName || t.assignedOnArrival
                  }\nServices: ${confirmedAppointment.services.map((s) => s.serviceName).join(', ')}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm hover:bg-slate-50"
              >
                <CalendarPlus className="w-3.5 h-3.5 text-amber-600" />
                <span className="truncate">{t.addToGoogleCalendar}</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  const startStr = `${confirmedAppointment.date.replace(/-/g, '')}T${confirmedAppointment.startTime.replace(/:/g, '')}00`;
                  const endStr = `${confirmedAppointment.date.replace(/-/g, '')}T${(confirmedAppointment.endTime || confirmedAppointment.startTime).replace(/:/g, '')}00`;
                  const icsData = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//BarberPro//Booking//EN',
                    'CALSCALE:GREGORIAN',
                    'METHOD:PUBLISH',
                    'BEGIN:VEVENT',
                    `SUMMARY:Haircut Appointment #${confirmedAppointment.appointmentNumber}`,
                    `DESCRIPTION:Services: ${confirmedAppointment.services.map((s) => s.serviceName).join(', ')} | Stylist: ${confirmedAppointment.workerName || t.assignedOnArrival}`,
                    `DTSTART:${startStr}`,
                    `DTEND:${endStr}`,
                    'STATUS:CONFIRMED',
                    'END:VEVENT',
                    'END:VCALENDAR',
                  ].join('\r\n');

                  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `barber-appointment-${confirmedAppointment.appointmentNumber}.ics`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
                className="py-2 px-3 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{t.downloadIcs}</span>
              </button>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                href="/my-account"
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-center shadow-md shadow-amber-600/20 active:scale-95 transition"
              >
                {t.viewInAccount}
              </Link>
              <button
                onClick={() => {
                  setConfirmedAppointment(null);
                  setSelectedServiceIds([]);
                  setSelectedTime('');
                  handleRemoveCoupon();
                  setStep(1);
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                {t.bookAnother}
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
        {/* Top Header with Language Switcher */}
        <div className="flex items-center justify-between mb-5 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <h1 className="text-base font-black text-slate-900 leading-tight">{t.pageTitle}</h1>
            <p className="text-[11px] text-slate-500">{t.pageSubtitle}</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full border border-slate-200">
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all ${
                lang === 'en' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('hi')}
              className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all ${
                lang === 'hi' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span className={step >= 1 ? 'text-amber-700' : ''}>1. {t.step1}</span>
            <span className={step >= 2 ? 'text-amber-700' : ''}>2. {t.step2}</span>
            <span className={step >= 3 ? 'text-amber-700' : ''}>3. {t.step3}</span>
            <span className={step >= 4 ? 'text-amber-700' : ''}>4. {t.step4}</span>
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
              <h2 className="text-xl font-bold text-slate-900">{t.chooseServices}</h2>
              <p className="text-xs text-slate-500">{t.chooseServicesDesc}</p>
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
                            <span>{svc.durationMinutes} {t.mins}</span>
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
              <h2 className="text-xl font-bold text-slate-900">{t.selectBarber}</h2>
              <p className="text-xs text-slate-500">{t.selectBarberDesc}</p>
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
                    <h3 className="font-bold text-sm text-slate-900">{t.anyBarber}</h3>
                    <p className="text-xs text-slate-500">{t.anyBarberDesc}</p>
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
                          {canPerform ? t.availableForSelected : t.cannotPerform}
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
              <h2 className="text-xl font-bold text-slate-900">{t.pickDateTime}</h2>
              <p className="text-xs text-slate-500">
                {t.durationLabel}: {totalDurationMinutes} {t.mins}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                {t.selectDate}
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
                {t.availableSlots}
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
                  <p className="font-semibold text-slate-700">{t.noOpenSlots}</p>
                  <p>{t.noSlotsDesc}</p>
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
              <h2 className="text-xl font-bold text-slate-900">{t.reviewConfirm}</h2>
              <p className="text-xs text-slate-500">{t.reviewConfirmDesc}</p>
            </div>

            {/* Booking Summary Box */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.dateAndSlot}:</span>
                <span className="font-bold text-slate-900">{selectedDate} {t.at} {selectedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.stylist}:</span>
                <span className="font-bold text-amber-800">
                  {selectedWorkerId === 'any'
                    ? t.anyBarber
                    : workers.find((w) => w.id === selectedWorkerId)?.displayName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.servicesLabel} ({selectedServices.length}):</span>
                <span className="font-semibold text-slate-800 text-right">
                  {selectedServices.map((s) => s.name).join(', ')}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t.servicesSubtotal}:</span>
                <span className="font-bold">{formatINR(totalAmountPaise)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-700 font-semibold items-center">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>{t.promoApplied} ({appliedCoupon.code})</span>
                  </span>
                  <span>-{formatINR(discountPaise)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-amber-200/80 flex justify-between text-sm font-bold text-slate-900">
                <span>{t.estimatedTotalPayable}:</span>
                <div className="text-right">
                  {appliedCoupon && (
                    <span className="text-xs text-slate-400 line-through mr-1.5 font-normal">
                      {formatINR(totalAmountPaise)}
                    </span>
                  )}
                  <span className="text-amber-800 font-extrabold">{formatINR(estimatedPayablePaise)}</span>
                </div>
              </div>
            </div>

            {/* Promo Code / Coupon Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-amber-600" />
                  {t.havePromo}
                </span>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t.removePromo}
                  </button>
                )}
              </div>

              {!appliedCoupon ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t.enterPromoPlaceholder}
                    value={couponCodeInput}
                    onChange={(e) => {
                      setCouponCodeInput(e.target.value.toUpperCase());
                      if (couponError) setCouponError(null);
                    }}
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    disabled={validatingCoupon || !couponCodeInput.trim()}
                    onClick={() => handleApplyCoupon()}
                    className="px-4 py-2 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition active:scale-95 shadow-sm"
                  >
                    {validatingCoupon ? t.checking : t.apply}
                  </button>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold">{appliedCoupon.message}</span>
                  </div>
                  <span className="font-bold text-emerald-700">{t.save} {formatINR(discountPaise)}</span>
                </div>
              )}

              {couponError && (
                <p className="text-xs text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {couponError}
                </p>
              )}

              {/* Quick-apply pills from active public offers */}
              {!appliedCoupon && availableOffers.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">
                    {t.activePromos}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableOffers.map((offer) => (
                      <button
                        key={offer.id}
                        type="button"
                        onClick={() => {
                          setCouponCodeInput(offer.code);
                          handleApplyCoupon(offer.code);
                        }}
                        className="text-xs px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-medium rounded-lg transition active:scale-95 flex items-center gap-1"
                      >
                        <span className="font-bold font-mono text-[11px]">{offer.code}</span>
                        <span className="text-amber-700 text-[10px]">
                          ({offer.discountType === 'percentage' ? `${offer.discountValue}% ${t.off}` : `₹${(offer.discountValue / 100).toFixed(0)} ${t.off}`})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.yourFullName}</label>
                <input
                  type="text"
                  required
                  placeholder={t.namePlaceholder}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.mobileNumber}</label>
                <input
                  type="tel"
                  required
                  placeholder={t.phonePlaceholder}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.emailAddress}</label>
                <input
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.groomingNotes}</label>
                <textarea
                  rows={2}
                  placeholder={t.notesPlaceholder}
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
              {submitting ? t.confirmingBooking : `${t.confirmAndBook} (${formatINR(estimatedPayablePaise)})`}
            </button>
          </form>
        )}

        {/* BOTTOM FIXED ACTION BAR */}
        {step < 4 && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3.5 shadow-lg">
            <div className="max-w-xl mx-auto flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">{t.selectedTotal}</span>
                <span className="font-extrabold text-base text-slate-900">
                  {formatINR(totalAmountPaise)}
                </span>
                <span className="text-[11px] text-slate-500 ml-1.5">({totalDurationMinutes} {t.mins})</span>
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
                  <span>{t.continue}</span>
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
