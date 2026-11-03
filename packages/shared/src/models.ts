export interface ServiceCategory {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  categoryId: string | null;
  categoryName?: string | null;
  name: string;
  description: string | null;
  pricePaise: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerItem {
  id: string;
  userId: string;
  displayName: string;
  phone: string | null;
  email?: string | null;
  isActive: boolean;
  commissionRatePercent: number;
  productCommissionRatePercent?: number;
  baseSalaryPaise?: number;
  services?: string[]; // array of service IDs
  createdAt: string;
  updatedAt: string;
}

export interface WorkerScheduleItem {
  weekday: number; // 1 = Monday .. 7 = Sunday
  isWorking: boolean;
  startTime: string | null; // HH:mm
  endTime: string | null;   // HH:mm
}

export interface WorkerBreakItem {
  id?: string;
  weekday: number;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  label?: string | null;
}

export interface TimeSlot {
  time: string; // HH:mm
  availableWorkers: { id: string; displayName: string }[];
}

export interface CustomerItem {
  id: string;
  userId: string | null;
  name: string;
  phone: string;
  email: string | null;
  preferredWorkerId: string | null;
  preferredWorkerName?: string | null;
  notes: string | null;
  totalVisits?: number;
  totalSpentPaise?: number;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'checked_in'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface AppointmentServiceItem {
  id: string;
  serviceId: string;
  serviceName: string;
  unitPricePaise: number;
  durationMinutes: number;
  addedAt: string;
}

export interface AppointmentItem {
  id: string;
  appointmentNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  workerId: string | null;
  workerName: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  notes: string | null;
  isWalkIn: boolean;
  totalAmountPaise: number;
  services: AppointmentServiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ProductItem {
  id: string;
  categoryId: string | null;
  categoryName?: string | null;
  name: string;
  sku: string;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isLowStock?: boolean;
  supplierName: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransactionItem {
  id: string;
  productId: string;
  productName?: string;
  type: 'purchase' | 'sale' | 'damage' | 'wastage' | 'adjustment';
  quantityDelta: number;
  balanceAfter: number;
  unitCostPaise: number;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface InvoiceLineItem {
  id?: string;
  type: 'service' | 'product';
  itemId?: string | null;
  itemName: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  appointmentId: string | null;
  customerId: string | null;
  customerName?: string | null;
  workerId: string | null;
  workerName?: string | null;
  subtotalPaise: number;
  discountPaise: number;
  couponId?: string | null;
  couponDiscountPaise?: number;
  tipPaise?: number;
  finalTotalPaise: number;
  paymentStatus: 'pending' | 'paid' | 'void';
  items: InvoiceLineItem[];
  payments: PaymentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentItem {
  id: string;
  invoiceId: string;
  method: 'cash' | 'upi_qr';
  amountPaise: number;
  status: 'completed' | 'failed';
  transactionReference: string | null;
  recordedByName?: string | null;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  categoryName?: string;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  description: string;
  paymentMethod: 'cash' | 'online' | 'bank_transfer';
  inventoryTransactionId?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  startDate: string;
  endDate: string;
  totalRevenuePaise: number;
  serviceRevenuePaise: number;
  productRevenuePaise: number;
  totalExpensesPaise: number;
  netResultPaise: number;
}

// Phase 2: Loyalty & Memberships
export interface LoyaltySettings {
  id: string;
  shopId: string;
  isEnabled: boolean;
  earnPerRupeePaise: number; // e.g. 10000 = 1 point per Rs 100 spent
  pointValuePaise: number;   // e.g. 100 = 1 point is worth Rs 1
  minRedeemPoints: number;   // minimum points required to redeem
  maxDiscountPercentage: number; // max % of bill that can be covered by points
  createdAt: string;
  updatedAt: string;
}

export type LoyaltyTransactionType =
  | 'earn_invoice'
  | 'redeem_invoice'
  | 'manual_adjustment'
  | 'membership_bonus'
  | 'welcome_bonus'
  | 'reversal';

export interface LoyaltyTransaction {
  id: string;
  shopId: string;
  customerId: string;
  pointsDelta: number;
  balanceAfter: number;
  type: LoyaltyTransactionType;
  invoiceId?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface CustomerLoyaltySummary {
  customerId: string;
  customerName: string;
  phone: string;
  pointsBalance: number;
  monetaryValuePaise: number;
  recentTransactions?: LoyaltyTransaction[];
}

export interface MembershipPlanIncludedService {
  serviceId: string;
  serviceName?: string;
  quantity: number;
}

export interface MembershipPlan {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  durationDays: number;
  discountPercentServices: number;
  discountPercentProducts: number;
  pointsMultiplier: number;
  status: 'active' | 'archived';
  includedServices: MembershipPlanIncludedService[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMembership {
  id: string;
  shopId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'cancelled';
  discountPercentServices: number;
  discountPercentProducts: number;
  pointsMultiplier: number;
  invoiceId?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  includedServicesUsage?: Array<{
    serviceId: string;
    serviceName: string;
    totalAllowed: number;
    usedCount: number;
    remainingCount: number;
  }>;
}

// Phase 3: Staff Commission & Tip Payouts
export type CommissionLedgerType =
  | 'service_commission'
  | 'product_commission'
  | 'tip'
  | 'manual_adjustment'
  | 'payout'
  | 'reversal';

export interface WorkerCommissionEntry {
  id: string;
  shopId: string;
  workerId: string;
  workerName?: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  type: CommissionLedgerType;
  amountPaise: number;
  commissionRatePercent?: number | null;
  baseAmountPaise?: number | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface WorkerPayout {
  id: string;
  shopId: string;
  workerId: string;
  workerName?: string;
  amountPaise: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'upi';
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  notes?: string | null;
  expenseId?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface WorkerEarningsSummary {
  workerId: string;
  workerName: string;
  commissionRatePercent: number;
  productCommissionRatePercent: number;
  totalServiceCommissionPaise: number;
  totalProductCommissionPaise: number;
  totalTipsPaise: number;
  totalBonusesPaise: number;
  totalEarnedPaise: number;
  totalPaidOutPaise: number;
  balancePendingPaise: number;
  recentEntries?: WorkerCommissionEntry[];
}

// Phase 4: Promotional Offers & Discount Coupons
export interface CouponItem {
  id: string;
  shopId: string;
  code: string;
  description?: string | null;
  discountType: 'percentage' | 'flat';
  discountValue: number; // percentage (1-100) or flat paise
  maxDiscountPaise?: number | null;
  minOrderPaise: number;
  applicableTo: 'all' | 'services' | 'products';
  maxRedemptionsTotal?: number | null;
  maxRedemptionsPerCustomer: number;
  timesRedeemed: number;
  validFrom: string;
  validUntil?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CouponRedemptionItem {
  id: string;
  shopId: string;
  couponId: string;
  invoiceId: string;
  customerId?: string | null;
  discountPaise: number;
  createdAt: string;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon?: CouponItem;
  discountPaise: number;
  message?: string;
}

// Phase 5: Staff Attendance & Salary / Advance Management
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave';

export interface WorkerAttendanceItem {
  id: string;
  shopId: string;
  workerId: string;
  workerName?: string;
  attendanceDate: string; // YYYY-MM-DD
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status: AttendanceStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'deducted';

export interface WorkerSalaryAdvanceItem {
  id: string;
  shopId: string;
  workerId: string;
  workerName?: string;
  amountPaise: number;
  reason: string;
  status: AdvanceStatus;
  requestedAt: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SettlementStatus = 'draft' | 'approved' | 'paid';

export interface WorkerSalarySettlementItem {
  id: string;
  shopId: string;
  workerId: string;
  workerName?: string;
  periodMonth: number; // 1-12
  periodYear: number;
  baseSalaryPaise: number;
  attendanceDaysPresent: number;
  attendanceDaysHalf: number;
  attendanceDaysAbsent: number;
  attendanceDaysLeave: number;
  proRatedBasePaise: number;
  commissionEarnedPaise: number;
  tipEarnedPaise: number;
  advancesDeductedPaise: number;
  bonusesPaise: number;
  netPayablePaise: number;
  payoutStatus: SettlementStatus;
  paidAt?: string | null;
  expenseId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 6: Customer Reviews & Ratings Engine
export type ReviewStatus = 'published' | 'hidden' | 'flagged';

export interface ReviewItem {
  id: string;
  shopId: string;
  appointmentId?: string | null;
  customerId: string;
  customerName?: string;
  workerId?: string | null;
  workerName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  rating: number; // 1-5
  barberRating?: number | null; // 1-5
  comment?: string | null;
  status: ReviewStatus;
  ownerReply?: string | null;
  ownerRepliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}



