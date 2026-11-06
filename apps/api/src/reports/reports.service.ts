import { Injectable } from '@nestjs/common';
import { AuthContext, Effective } from '../common/types';
import { Db } from '../db/db.service';

@Injectable()
export class ReportsService {
  constructor(private db: Db) {}

  // ==================== ADMIN DASHBOARD (RULE 37) ====================

  async getAdminDashboard(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Appointments counts today
      const aptSummary = (await c.query(
        `SELECT
           count(*)::int AS total_appointments,
           count(*) FILTER (WHERE status = 'completed')::int AS completed_appointments,
           count(*) FILTER (WHERE status IN ('booked', 'confirmed', 'checked_in', 'in_service'))::int AS pending_appointments,
           count(DISTINCT customer_id)::int AS total_customers
         FROM appointments
         WHERE shop_id = $1 AND date = $2::date`,
        [ctx.shopId, today]
      )).rows[0];

      // 2. Revenue today from paid invoices
      const revSummary = (await c.query(
        `SELECT
           COALESCE(sum(CASE WHEN ii.type = 'service' THEN ii.total_paise ELSE 0 END), 0)::bigint AS service_revenue,
           COALESCE(sum(CASE WHEN ii.type = 'product' THEN ii.total_paise ELSE 0 END), 0)::bigint AS product_revenue,
           COALESCE(sum(inv.final_total_paise), 0)::bigint AS total_revenue
         FROM invoices inv
         LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
         WHERE inv.shop_id = $1
           AND inv.payment_status = 'paid'
           AND inv.created_at >= $2::date
           AND inv.created_at < ($2::date + interval '1 day')`,
        [ctx.shopId, today]
      )).rows[0];

      // 3. Expenses today
      const expSummary = (await c.query(
        `SELECT COALESCE(sum(amount_paise), 0)::bigint AS total_expenses
         FROM expenses
         WHERE shop_id = $1 AND date = $2::date`,
        [ctx.shopId, today]
      )).rows[0];

      const totalRevenue = Number(revSummary.total_revenue);
      const totalExpenses = Number(expSummary.total_expenses);
      const netResult = totalRevenue - totalExpenses;

      // 4. Low stock products alert list
      const lowStockProducts = (await c.query(
        `SELECT id, name, sku, stock_quantity, low_stock_threshold
         FROM products
         WHERE shop_id = $1 AND status = 'active' AND stock_quantity <= low_stock_threshold
         ORDER BY stock_quantity ASC`,
        [ctx.shopId]
      )).rows.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQuantity: Number(p.stock_quantity),
        lowStockThreshold: Number(p.low_stock_threshold),
      }));

      // 5. Today's appointments list
      const todayAppointments = (await c.query(
        `SELECT a.id, a.appointment_number, a.start_time::text, a.end_time::text, a.status,
                c.name AS customer_name, c.phone AS customer_phone,
                w.display_name AS worker_name, a.total_amount_paise,
                COALESCE(string_agg(aps.service_name, ', '), 'No service') AS service_names
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN workers w ON w.id = a.worker_id
         LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
         WHERE a.shop_id = $1 AND a.date = $2::date
         GROUP BY a.id, c.name, c.phone, w.display_name
         ORDER BY a.start_time ASC`,
        [ctx.shopId, today]
      )).rows.map((a) => ({
        id: a.id,
        appointmentNumber: a.appointment_number,
        startTime: a.start_time.slice(0, 5),
        endTime: a.end_time.slice(0, 5),
        status: a.status,
        customerName: a.customer_name,
        customerPhone: a.customer_phone,
        workerName: a.worker_name ?? 'Unassigned',
        services: a.service_names,
        totalAmountPaise: Number(a.total_amount_paise),
      }));

      // 6. Worker performance today
      const workerPerformance = (await c.query(
        `SELECT w.id, w.display_name,
                count(a.id)::int AS today_customers,
                count(a.id) FILTER (WHERE a.status = 'completed')::int AS completed_count,
                COALESCE(sum(inv.final_total_paise) FILTER (WHERE inv.payment_status = 'paid'), 0)::bigint AS revenue_paise
         FROM workers w
         LEFT JOIN appointments a ON a.worker_id = w.id AND a.date = $2::date
         LEFT JOIN invoices inv ON inv.appointment_id = a.id
         WHERE w.shop_id = $1 AND w.is_active = true
         GROUP BY w.id, w.display_name
         ORDER BY revenue_paise DESC, w.display_name ASC`,
        [ctx.shopId, today]
      )).rows.map((w) => ({
        workerId: w.id,
        displayName: w.display_name,
        todayCustomers: Number(w.today_customers),
        completedCount: Number(w.completed_count),
        revenuePaise: Number(w.revenue_paise),
      }));

      return {
        today,
        metrics: {
          todayRevenuePaise: totalRevenue,
          serviceRevenuePaise: Number(revSummary.service_revenue),
          productRevenuePaise: Number(revSummary.product_revenue),
          todayExpensesPaise: totalExpenses,
          netResultPaise: netResult,
          todayAppointments: Number(aptSummary.total_appointments),
          completedAppointments: Number(aptSummary.completed_appointments),
          pendingAppointments: Number(aptSummary.pending_appointments),
          todayCustomers: Number(aptSummary.total_customers),
          lowStockCount: lowStockProducts.length,
        },
        lowStockItems: lowStockProducts,
        appointments: todayAppointments,
        workerPerformance,
      };
    });
  }

  // ==================== WORKER DASHBOARD (RULE 33) ====================

  async getWorkerDashboard(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const today = new Date().toISOString().slice(0, 10);

      // Find worker for current user
      const worker = (await c.query(`SELECT id, display_name FROM workers WHERE user_id = $1 AND shop_id = $2`, [ctx.userId, ctx.shopId])).rows[0];
      if (!worker) {
        return {
          today,
          workerName: 'Worker',
          todayAppointments: 0,
          completedAppointments: 0,
          pendingAppointments: 0,
          todayRevenuePaise: 0,
          queue: [],
        };
      }

      const summary = (await c.query(
        `SELECT
           count(*)::int AS total_appointments,
           count(*) FILTER (WHERE status = 'completed')::int AS completed_appointments,
           count(*) FILTER (WHERE status IN ('booked', 'confirmed', 'checked_in', 'in_service'))::int AS pending_appointments,
           COALESCE(sum(total_amount_paise) FILTER (WHERE status = 'completed'), 0)::bigint AS completed_revenue
         FROM appointments
         WHERE shop_id = $1 AND worker_id = $2 AND date = $3::date`,
        [ctx.shopId, worker.id, today]
      )).rows[0];

      const queue = (await c.query(
        `SELECT a.id, a.appointment_number, a.start_time::text, a.end_time::text, a.status,
                c.name AS customer_name, c.phone AS customer_phone, c.notes AS customer_notes,
                a.total_amount_paise,
                COALESCE(string_agg(aps.service_name, ', '), '') AS service_names
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
         WHERE a.shop_id = $1 AND a.worker_id = $2 AND a.date = $3::date
         GROUP BY a.id, c.name, c.phone, c.notes
         ORDER BY a.start_time ASC`,
        [ctx.shopId, worker.id, today]
      )).rows.map((q) => ({
        id: q.id,
        appointmentNumber: q.appointment_number,
        startTime: q.start_time.slice(0, 5),
        endTime: q.end_time.slice(0, 5),
        status: q.status,
        customerName: q.customer_name,
        customerPhone: q.customer_phone,
        customerNotes: q.customer_notes,
        services: q.service_names,
        totalAmountPaise: Number(q.total_amount_paise),
      }));

      return {
        today,
        workerId: worker.id,
        workerName: worker.display_name,
        metrics: {
          todayAppointments: Number(summary.total_appointments),
          completedAppointments: Number(summary.completed_appointments),
          pendingAppointments: Number(summary.pending_appointments),
          todayRevenuePaise: Number(summary.completed_revenue),
        },
        queue,
      };
    });
  }

  // ==================== REPORTS & ANALYTICS (RULE 36) ====================

  async getReports(ctx: AuthContext, q: { type: 'sales' | 'workers' | 'customers' | 'inventory' | 'finance'; startDate?: string; endDate?: string }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const today = new Date().toISOString().slice(0, 10);
      const start = q.startDate ?? today;
      const end = q.endDate ?? today;

      if (q.type === 'sales') {
        const rows = (await c.query(
          `SELECT date_trunc('day', created_at)::date::text AS sale_date,
                  count(*)::int AS total_invoices,
                  sum(final_total_paise)::bigint AS total_sales_paise
           FROM invoices
           WHERE shop_id = $1 AND payment_status = 'paid'
             AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
           GROUP BY sale_date
           ORDER BY sale_date ASC`,
          [ctx.shopId, start, end]
        )).rows;
        return { type: 'sales', startDate: start, endDate: end, daily: rows };
      }

      if (q.type === 'workers') {
        const rows = (await c.query(
          `SELECT w.id, w.display_name,
                  count(a.id)::int AS total_appointments,
                  count(a.id) FILTER (WHERE a.status = 'completed')::int AS completed_services,
                  COALESCE(sum(inv.final_total_paise) FILTER (WHERE inv.payment_status = 'paid'), 0)::bigint AS revenue_paise
           FROM workers w
           LEFT JOIN appointments a ON a.worker_id = w.id AND a.date >= $2::date AND a.date <= $3::date
           LEFT JOIN invoices inv ON inv.appointment_id = a.id
           WHERE w.shop_id = $1
           GROUP BY w.id, w.display_name
           ORDER BY revenue_paise DESC`,
          [ctx.shopId, start, end]
        )).rows;
        return { type: 'workers', startDate: start, endDate: end, workers: rows };
      }

      if (q.type === 'customers') {
        const totalCustomers = Number((await c.query(`SELECT count(*)::int AS n FROM customers WHERE shop_id = $1`, [ctx.shopId])).rows[0].n);
        const newInPeriod = Number((await c.query(`SELECT count(*)::int AS n FROM customers WHERE shop_id = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')`, [ctx.shopId, start, end])).rows[0].n);
        return { type: 'customers', totalCustomers, newCustomersInPeriod: newInPeriod };
      }

      if (q.type === 'inventory') {
        const products = (await c.query(
          `SELECT p.id, p.name, p.sku, p.stock_quantity, p.low_stock_threshold,
                  (p.stock_quantity * p.cost_price_paise)::bigint AS stock_cost_value_paise
           FROM products p
           WHERE p.shop_id = $1 AND p.status = 'active'
           ORDER BY p.name ASC`,
          [ctx.shopId]
        )).rows;
        return { type: 'inventory', products };
      }

      // Default finance
      const rev = Number((await c.query(`SELECT COALESCE(sum(final_total_paise), 0) AS rev FROM invoices WHERE shop_id = $1 AND payment_status = 'paid' AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')`, [ctx.shopId, start, end])).rows[0].rev);
      const exp = Number((await c.query(`SELECT COALESCE(sum(amount_paise), 0) AS exp FROM expenses WHERE shop_id = $1 AND date >= $2::date AND date <= $3::date`, [ctx.shopId, start, end])).rows[0].exp);
      return {
        type: 'finance',
        startDate: start,
        endDate: end,
        revenuePaise: rev,
        expensesPaise: exp,
        netResultPaise: rev - exp,
      };
    });
  }

  // ==================== END-OF-DAY (EOD) RECONCILIATION ====================

  async getEndOfDayReconciliation(ctx: AuthContext, dateStr?: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const shop = (await c.query('SELECT id, name, slug, phone, gst_no, timezone FROM shops WHERE id = $1', [ctx.shopId])).rows[0];
      const targetDate = dateStr || new Date().toISOString().slice(0, 10);

      // 1. Invoices & Revenue breakdown
      const invSummary = (await c.query(
        `SELECT
           count(*)::int AS total_invoices,
           COALESCE(sum(subtotal_paise), 0)::bigint AS gross_subtotal_paise,
           COALESCE(sum(discount_paise), 0)::bigint AS total_discounts_paise,
           COALESCE(sum(tip_paise), 0)::bigint AS total_tips_paise,
           COALESCE(sum(final_total_paise), 0)::bigint AS net_revenue_paise
         FROM invoices
         WHERE shop_id = $1
           AND payment_status = 'paid'
           AND created_at >= $2::date AND created_at < ($2::date + interval '1 day')`,
        [ctx.shopId, targetDate]
      )).rows[0];

      // 2. Services vs Products revenue breakdown
      const itemBreakdown = (await c.query(
        `SELECT
           ii.type,
           COALESCE(sum(ii.total_paise), 0)::bigint AS total_paise,
           count(*)::int AS count
         FROM invoice_items ii
         JOIN invoices inv ON inv.id = ii.invoice_id
         WHERE inv.shop_id = $1
           AND inv.payment_status = 'paid'
           AND inv.created_at >= $2::date AND inv.created_at < ($2::date + interval '1 day')
         GROUP BY ii.type`,
        [ctx.shopId, targetDate]
      )).rows;

      let serviceRevenuePaise = 0;
      let productRevenuePaise = 0;
      for (const item of itemBreakdown) {
        if (item.type === 'service') serviceRevenuePaise = Number(item.total_paise);
        if (item.type === 'product') productRevenuePaise = Number(item.total_paise);
      }

      // 3. Payment Methods Breakdown (Drawer reconciliation)
      const payMethods = (await c.query(
        `SELECT
           p.method,
           count(*)::int AS transaction_count,
           COALESCE(sum(p.amount_paise), 0)::bigint AS total_paise
         FROM payments p
         JOIN invoices inv ON inv.id = p.invoice_id
         WHERE p.shop_id = $1
           AND p.status = 'completed'
           AND inv.payment_status = 'paid'
           AND p.created_at >= $2::date AND p.created_at < ($2::date + interval '1 day')
         GROUP BY p.method`,
        [ctx.shopId, targetDate]
      )).rows;

      let cashTotalPaise = 0;
      let upiTotalPaise = 0;
      let onlineTotalPaise = 0;
      let cashTransactionsCount = 0;
      let upiTransactionsCount = 0;
      let onlineTransactionsCount = 0;

      for (const pm of payMethods) {
        const amt = Number(pm.total_paise);
        const cnt = Number(pm.transaction_count);
        if (pm.method === 'cash') {
          cashTotalPaise += amt;
          cashTransactionsCount += cnt;
        } else if (pm.method === 'upi_qr') {
          upiTotalPaise += amt;
          upiTransactionsCount += cnt;
        } else {
          onlineTotalPaise += amt;
          onlineTransactionsCount += cnt;
        }
      }

      // 4. Appointment Status Counts
      const apptCounts = (await c.query(
        `SELECT
           count(*)::int AS total_appointments,
           count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
           count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
           count(*) FILTER (WHERE status = 'no_show')::int AS no_show_count,
           count(*) FILTER (WHERE is_walk_in = true)::int AS walk_in_count,
           count(*) FILTER (WHERE is_walk_in = false)::int AS online_booking_count
         FROM appointments
         WHERE shop_id = $1 AND date = $2::date`,
        [ctx.shopId, targetDate]
      )).rows[0];

      // 5. Stylist performance breakdown
      const workerRoster = (await c.query(
        `SELECT
           w.id,
           w.display_name,
           count(a.id) FILTER (WHERE a.status = 'completed')::int AS completed_appointments,
           COALESCE(sum(inv.final_total_paise) FILTER (WHERE inv.payment_status = 'paid'), 0)::bigint AS revenue_paise,
           COALESCE((
             SELECT sum(wcl.amount_paise)
             FROM worker_commission_ledger wcl
             WHERE wcl.worker_id = w.id
               AND wcl.type IN ('service_commission', 'product_commission')
               AND wcl.created_at >= $2::date AND wcl.created_at < ($2::date + interval '1 day')
           ), 0)::bigint AS earned_commission_paise,
           COALESCE((
             SELECT sum(wcl.amount_paise)
             FROM worker_commission_ledger wcl
             WHERE wcl.worker_id = w.id
               AND wcl.type = 'tip'
               AND wcl.created_at >= $2::date AND wcl.created_at < ($2::date + interval '1 day')
           ), 0)::bigint AS earned_tips_paise
         FROM workers w
         LEFT JOIN appointments a ON a.worker_id = w.id AND a.date = $2::date
         LEFT JOIN invoices inv ON inv.appointment_id = a.id
         WHERE w.shop_id = $1 AND w.is_active = true
         GROUP BY w.id, w.display_name
         ORDER BY revenue_paise DESC, w.display_name ASC`,
        [ctx.shopId, targetDate]
      )).rows.map((r) => ({
        workerId: r.id,
        displayName: r.display_name,
        completedAppointments: Number(r.completed_appointments),
        revenuePaise: Number(r.revenue_paise),
        earnedCommissionPaise: Number(r.earned_commission_paise),
        earnedTipsPaise: Number(r.earned_tips_paise),
      }));

      // 6. Shop Expenses recorded today
      const expensesList = (await c.query(
        `SELECT e.id, e.description, e.amount_paise, ec.name AS category_name
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.shop_id = $1 AND e.date = $2::date
         ORDER BY e.created_at ASC`,
        [ctx.shopId, targetDate]
      )).rows.map((exp) => ({
        id: exp.id,
        description: exp.description,
        category: exp.category_name || 'General',
        amountPaise: Number(exp.amount_paise),
      }));

      const totalExpensesPaise = expensesList.reduce((acc, e) => acc + e.amountPaise, 0);

      return {
        date: targetDate,
        shop: {
          id: shop?.id,
          name: shop?.name || 'Classic Barber Shop',
          slug: shop?.slug || 'classic-barber',
          phone: shop?.phone || null,
          gstNo: shop?.gst_no || null,
          timezone: shop?.timezone || 'Asia/Kolkata',
        },
        revenue: {
          totalInvoices: Number(invSummary?.total_invoices || 0),
          grossSubtotalPaise: Number(invSummary?.gross_subtotal_paise || 0),
          totalDiscountsPaise: Number(invSummary?.total_discounts_paise || 0),
          totalTipsPaise: Number(invSummary?.total_tips_paise || 0),
          netRevenuePaise: Number(invSummary?.net_revenue_paise || 0),
          serviceRevenuePaise,
          productRevenuePaise,
        },
        drawerReconciliation: {
          expectedCashInDrawerPaise: cashTotalPaise,
          cash: { count: cashTransactionsCount, amountPaise: cashTotalPaise },
          upi: { count: upiTransactionsCount, amountPaise: upiTotalPaise },
          onlineGateway: { count: onlineTransactionsCount, amountPaise: onlineTotalPaise },
        },
        appointments: {
          total: Number(apptCounts?.total_appointments || 0),
          completed: Number(apptCounts?.completed_count || 0),
          cancelled: Number(apptCounts?.cancelled_count || 0),
          noShow: Number(apptCounts?.no_show_count || 0),
          walkIn: Number(apptCounts?.walk_in_count || 0),
          online: Number(apptCounts?.online_booking_count || 0),
        },
        workers: workerRoster,
        expenses: {
          totalExpensesPaise,
          items: expensesList,
        },
        netCashFlowPaise: Number(invSummary?.net_revenue_paise || 0) - totalExpensesPaise,
      };
    });
  }
}
