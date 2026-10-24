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
