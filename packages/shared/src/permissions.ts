export type PermissionScope = 'all' | 'own';
export interface PermissionDef { key: string; module: string; description: string; supportsOwn: boolean }

const d = (key: string, description: string, supportsOwn = false): PermissionDef =>
  ({ key, module: key.split('.')[0], description, supportsOwn });

/** Global permission catalog. Roles are data; this list is only the vocabulary (synced to DB). */
export const PERMISSIONS: PermissionDef[] = [
  d('dashboard.view', 'View dashboard', true),
  d('appointments.view', 'View appointments', true),
  d('appointments.create', 'Create appointments / walk-ins', true),
  d('appointments.update', 'Update appointments and status', true),
  d('appointments.cancel', 'Cancel appointments'),
  d('appointments.assign', 'Assign a worker to an appointment'),
  d('appointments.add_service', 'Add services to an existing appointment', true),
  d('customers.view', 'View customers', true),
  d('customers.create', 'Create customers', true),
  d('customers.update', 'Edit customers', true),
  d('customers.delete', 'Archive/delete customers'),
  d('services.view', 'View services'),
  d('services.create', 'Create services'),
  d('services.update', 'Edit services and prices'),
  d('services.delete', 'Archive/delete services'),
  d('workers.view', 'View workers', true),
  d('workers.create', 'Create workers'),
  d('workers.update', 'Edit workers, availability, service mapping', true),
  d('workers.delete', 'Archive/delete workers'),
  d('workers.performance.view', 'View worker performance', true),
  d('products.view', 'View products'),
  d('products.create', 'Create products'),
  d('products.update', 'Edit products'),
  d('products.delete', 'Archive/delete products'),
  d('inventory.view', 'View inventory'),
  d('inventory.manage', 'Stock in, adjustments, damage/wastage'),
  d('billing.view', 'View invoices'),
  d('billing.create', 'Create and edit invoices'),
  d('billing.void', 'Void invoices'),
  d('payments.view', 'View payments'),
  d('payments.record', 'Record/mark payments received'),
  d('income.view', 'View income'),
  d('expenses.view', 'View expenses'),
  d('expenses.create', 'Create expenses'),
  d('expenses.update', 'Edit expenses'),
  d('expenses.delete', 'Delete expenses'),
  d('reports.view', 'View reports'),
  d('settings.manage', 'Manage shop settings'),
  d('users.view', 'View staff accounts'),
  d('users.manage', 'Create/disable staff accounts'),
  d('roles.manage', 'Manage roles'),
  d('permissions.manage', 'Assign permissions to roles'),
  d('audit.view', 'View audit log'),
  d('loyalty.view', 'View loyalty points and settings', true),
  d('loyalty.manage', 'Configure loyalty program and manual point adjustments'),
  d('memberships.view', 'View membership plans and customer subscriptions', true),
  d('memberships.manage', 'Create/edit membership plans and subscriptions'),
  d('commission.view', 'View worker commissions, tips, and payouts', true),
  d('commission.manage', 'Record worker commission payouts and adjustments'),
  d('coupons.view', 'View promotional offers and coupons'),
  d('coupons.manage', 'Create, edit, and deactivate promotional coupons'),
  d('attendance.view', 'View worker attendance', true),
  d('attendance.manage', 'Record and edit worker attendance'),
  d('salary.view', 'View worker base salary, advances, and payroll', true),
  d('salary.manage', 'Configure base salary, approve advances, and settle payroll'),
  d('reviews.view', 'View customer reviews and ratings', true),
  d('reviews.manage', 'Moderate and reply to customer reviews'),
  d('notifications.view', 'View in-system notifications and alerts', true),
  d('notifications.manage', 'Manage notification settings, dispatch, and templates'),
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export type SystemRoleKey = 'owner' | 'manager' | 'worker' | 'cashier' | 'inventory_manager';
export interface RoleTemplate { systemKey: SystemRoleKey; name: string; permissions: Record<string, PermissionScope> }

const all = (...k: string[]) => Object.fromEntries(k.map((x) => [x, 'all' as PermissionScope]));
const own = (...k: string[]) => Object.fromEntries(k.map((x) => [x, 'own' as PermissionScope]));

/** Default role templates copied into every new shop. Editable per shop afterwards (except Owner). */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  { systemKey: 'owner', name: 'Owner', permissions: {} /* owner is implicitly granted everything */ },
  {
    systemKey: 'manager', name: 'Manager',
    permissions: all(
      'dashboard.view', 'appointments.view', 'appointments.create', 'appointments.update', 'appointments.cancel',
      'appointments.assign', 'appointments.add_service', 'customers.view', 'customers.create', 'customers.update',
      'services.view', 'workers.view', 'workers.create', 'workers.update', 'workers.performance.view',
      'products.view', 'products.create', 'products.update', 'inventory.view', 'inventory.manage',
      'billing.view', 'billing.create', 'billing.void', 'payments.view', 'payments.record', 'reports.view',
      'loyalty.view', 'loyalty.manage', 'memberships.view', 'memberships.manage',
      'commission.view', 'commission.manage', 'coupons.view', 'coupons.manage',
      'attendance.view', 'attendance.manage', 'salary.view', 'salary.manage',
      'reviews.view', 'reviews.manage',
      'notifications.view', 'notifications.manage',
    ),
  },
  {
    systemKey: 'worker', name: 'Worker',
    permissions: {
      ...own('dashboard.view', 'appointments.view', 'appointments.create', 'appointments.update',
        'appointments.add_service', 'customers.view', 'customers.create', 'customers.update', 'workers.performance.view', 'workers.view', 'commission.view', 'attendance.view', 'salary.view', 'reviews.view', 'notifications.view'),
      ...all('services.view', 'products.view'),
    },
  },
  {
    systemKey: 'cashier', name: 'Cashier',
    permissions: all(
      'dashboard.view', 'appointments.view', 'appointments.create', 'appointments.update', 'appointments.add_service',
      'customers.view', 'customers.create', 'customers.update', 'services.view', 'products.view',
      'billing.view', 'billing.create', 'payments.view', 'payments.record',
      'loyalty.view', 'memberships.view', 'commission.view', 'coupons.view',
      'notifications.view',
    ),
  },
  {
    systemKey: 'inventory_manager', name: 'Inventory Manager',
    permissions: all('products.view', 'products.create', 'products.update', 'inventory.view', 'inventory.manage'),
  },
];
