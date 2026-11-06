import { Injectable, Optional } from '@nestjs/common';
import { AppointmentItem, AppointmentServiceItem, AppointmentStatus, ErrorCodes, Paginated } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AvailabilityService } from '../availability/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizePhone } from '../auth/phone';
import { loadConfig } from '../config';

const notFound = (m = 'Appointment not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

const timeToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const minToTime = (min: number): string => {
  const safeMin = Math.min(Math.max(0, min), 1439); // 23:59 max time
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

@Injectable()
export class AppointmentsService {
  private cfg = loadConfig();
  constructor(
    private db: Db,
    private audit: AuditService,
    private availability: AvailabilityService,
    @Optional() private notifications?: NotificationsService
  ) {}

  // ==================== PUBLIC BOOKING ====================

  async bookPublic(
    slug: string,
    dto: {
      name: string;
      phone: string;
      email?: string | null;
      date: string;
      startTime: string;
      serviceIds: string[];
      workerId?: string | null;
      notes?: string | null;
    }
  ): Promise<AppointmentItem> {
    const phone = normalizePhone(dto.phone, this.cfg.DEFAULT_COUNTRY_CODE);
    if (!phone) throw badRequest('Invalid mobile phone number format.');

    return this.db.tenant({ publicRead: true }, async (c) => {
      // 1. Fetch active shop
      const shop = (await c.query(`SELECT id, name, slug FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found.');

      // Scope this connection's tenant context to this shop for appointment and customer creation
      await c.query(`SELECT set_config('app.shop_id', $1, true)`, [shop.id]);

      // 2. Validate availability using slot engine
      const slotResult = await this.availability.calculateSlots(slug, {
        date: dto.date,
        serviceIds: dto.serviceIds,
        workerId: dto.workerId ?? undefined,
      });

      const matchedSlot = slotResult.slots.find((s) => s.time === dto.startTime);
      if (!matchedSlot) {
        throw badRequest('The selected time slot is no longer available. Please select another slot.');
      }

      // Determine assigned worker:
      // If customer requested specific worker, use that;
      // If "any", assign the first available worker from the slot
      let assignedWorkerId: string | null = null;
      if (dto.workerId && dto.workerId.toLowerCase() !== 'any') {
        assignedWorkerId = dto.workerId;
      } else if (matchedSlot.availableWorkers.length > 0) {
        assignedWorkerId = matchedSlot.availableWorkers[0].id;
      }

      // 3. Find or create customer in this shop
      let customerId: string;
      const existingCustomer = (await c.query(
        `SELECT id FROM customers WHERE shop_id = $1 AND phone = $2`,
        [shop.id, phone]
      )).rows[0];

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const matchedUserId = (await c.query(`SELECT id FROM users WHERE phone = $1`, [phone])).rows[0]?.id ?? null;
        const custRes = await c.query(
          `INSERT INTO customers (shop_id, user_id, name, phone, email, preferred_worker_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [shop.id, matchedUserId, dto.name, phone, dto.email?.toLowerCase() ?? null, assignedWorkerId, dto.notes ?? null]
        );
        customerId = custRes.rows[0].id;
      }

      // 4. Fetch service snapshots
      const services = (await c.query(
        `SELECT id, name, price_paise, duration_minutes FROM services
         WHERE shop_id = $1 AND id = ANY($2::uuid[])`,
        [shop.id, dto.serviceIds]
      )).rows;

      const totalDuration = services.reduce((acc, s) => acc + s.duration_minutes, 0);
      const totalAmount = services.reduce((acc, s) => acc + s.price_paise, 0);
      const startMin = timeToMin(dto.startTime);
      const endTime = minToTime(startMin + totalDuration);

      // 5. Create appointment
      let appointmentId: string;
      try {
        const aptRes = await c.query(
          `INSERT INTO appointments (
             shop_id, customer_id, worker_id, date, start_time, end_time,
             status, notes, is_walk_in, total_amount_paise
           )
           VALUES ($1, $2, $3, $4::date, $5::time, $6::time, 'booked', $7, false, $8)
           RETURNING id`,
          [shop.id, customerId, assignedWorkerId, dto.date, dto.startTime, endTime, dto.notes ?? null, totalAmount]
        );
        appointmentId = aptRes.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01' || err.code === '23505') {
          throw badRequest('The selected time slot is no longer available. Please select another slot.');
        }
        throw err;
      }

      // 6. Snapshot appointment services
      for (const s of services) {
        await c.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [shop.id, appointmentId, s.id, s.name, s.price_paise, s.duration_minutes]
        );
      }

      // 7. Record status history
      await c.query(
        `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes)
         VALUES ($1, $2, 'booked', 'Booked via customer website')`,
        [shop.id, appointmentId]
      );

      const loaded = await this.loadAppointment(c, shop.id, appointmentId);

      if (this.notifications) {
        try {
          const workerUserRow = assignedWorkerId
            ? (await c.query(`SELECT user_id FROM workers WHERE id = $1`, [assignedWorkerId])).rows[0]
            : null;
          await this.notifications.notifyAppointmentBooked(shop.id, {
            appointmentId: loaded.id,
            appointmentNumber: loaded.appointmentNumber,
            customerName: dto.name,
            customerPhone: dto.phone,
            customerId: customerId,
            date: dto.date,
            startTime: dto.startTime,
            workerName: loaded.workerName ?? undefined,
            workerUserId: workerUserRow?.user_id,
            serviceNames: services.map((s) => s.name),
            shopName: shop.name,
          });
        } catch {
          // notification dispatch failure should not block core booking
        }
      }

      return loaded;
    });
  }

  // ==================== WALK-IN CREATION ====================

  async createWalkIn(
    ctx: AuthContext,
    dto: {
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      date?: string;
      startTime?: string;
      serviceIds: string[];
      workerId?: string | null;
      notes?: string | null;
    }
  ): Promise<AppointmentItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Find or create customer
      let customerId = dto.customerId;
      if (!customerId) {
        if (!dto.customerName || !dto.customerPhone) {
          throw badRequest('Either customerId or both customerName and customerPhone are required for walk-in.');
        }
        const phone = normalizePhone(dto.customerPhone, this.cfg.DEFAULT_COUNTRY_CODE);
        if (!phone) throw badRequest('Invalid mobile number format.');

        const existing = (await c.query(
          `SELECT id FROM customers WHERE shop_id = $1 AND phone = $2`,
          [ctx.shopId, phone]
        )).rows[0];

        if (existing) {
          customerId = existing.id;
        } else {
          const matchedUserId = (await c.query(`SELECT id FROM users WHERE phone = $1`, [phone])).rows[0]?.id ?? null;
          const newCust = await c.query(
            `INSERT INTO customers (shop_id, user_id, name, phone, preferred_worker_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [ctx.shopId, matchedUserId, dto.customerName, phone, dto.workerId ?? null, dto.notes ?? null]
          );
          customerId = newCust.rows[0].id;
        }
      }

      // Fetch services
      const services = (await c.query(
        `SELECT id, name, price_paise, duration_minutes FROM services
         WHERE shop_id = $1 AND id = ANY($2::uuid[])`,
        [ctx.shopId, dto.serviceIds]
      )).rows;

      if (services.length !== dto.serviceIds.length) {
        throw badRequest('One or more selected services are invalid.');
      }

      const totalDuration = services.reduce((acc, s) => acc + s.duration_minutes, 0);
      const totalAmount = services.reduce((acc, s) => acc + s.price_paise, 0);

      const now = new Date();
      const dateStr = dto.date ?? now.toISOString().slice(0, 10);
      const startTimeStr = dto.startTime ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const startMin = timeToMin(startTimeStr);
      const endTimeStr = minToTime(startMin + totalDuration);

      const aptRes = await c.query(
        `INSERT INTO appointments (
           shop_id, customer_id, worker_id, date, start_time, end_time,
           status, notes, is_walk_in, total_amount_paise
         )
         VALUES ($1, $2, $3, $4::date, $5::time, $6::time, 'checked_in', $7, true, $8)
         RETURNING id`,
        [ctx.shopId, customerId, dto.workerId ?? null, dateStr, startTimeStr, endTimeStr, dto.notes ?? null, totalAmount]
      );
      const appointmentId = aptRes.rows[0].id;

      for (const s of services) {
        await c.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ctx.shopId, appointmentId, s.id, s.name, s.price_paise, s.duration_minutes]
        );
      }

      await c.query(
        `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes, changed_by)
         VALUES ($1, $2, 'checked_in', 'Walk-in created', $3)`,
        [ctx.shopId, appointmentId, ctx.userId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'appointment.walk_in.create',
        entity: 'appointment',
        entityId: appointmentId,
        newValues: { totalAmount, totalDuration, isWalkIn: true },
        ip: ctx.ip,
      });

      return this.loadAppointment(c, ctx.shopId!, appointmentId);
    });
  }

  // ==================== ADD-ON SERVICE (RULE 17, 49, 74) ====================

  async addService(ctx: AuthContext, appointmentId: string, serviceId: string): Promise<AppointmentItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const apt = (await c.query(
        `SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
        [appointmentId, ctx.shopId]
      )).rows[0];

      if (!apt) throw notFound();
      if (apt.status === 'completed' || apt.status === 'cancelled') {
        throw badRequest(`Cannot add services to a ${apt.status} appointment.`);
      }

      const service = (await c.query(
        `SELECT id, name, price_paise, duration_minutes FROM services WHERE id = $1 AND shop_id = $2 AND is_active = true`,
        [serviceId, ctx.shopId]
      )).rows[0];
      if (!service) throw notFound('Service not found or inactive.');

      // Insert into appointment_services
      await c.query(
        `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ctx.shopId, appointmentId, service.id, service.name, service.price_paise, service.duration_minutes]
      );

      // Extend duration and update total_amount_paise
      const newTotal = Number(apt.total_amount_paise) + Number(service.price_paise);
      const currentEndMin = timeToMin(apt.end_time.slice(0, 5));
      const newEndTime = minToTime(currentEndMin + service.duration_minutes);

      await c.query(
        `UPDATE appointments
         SET total_amount_paise = $1, end_time = $2::time, updated_at = now()
         WHERE id = $3 AND shop_id = $4`,
        [newTotal, newEndTime, appointmentId, ctx.shopId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'appointment.service.add',
        entity: 'appointment',
        entityId: appointmentId,
        oldValues: { totalAmount: apt.total_amount_paise, endTime: apt.end_time },
        newValues: { addedService: service.name, price: service.price_paise, newTotal, newEndTime },
        ip: ctx.ip,
      });

      return this.loadAppointment(c, ctx.shopId!, appointmentId);
    });
  }

  // ==================== WORKER ASSIGNMENT ====================

  async assignWorker(ctx: AuthContext, appointmentId: string, workerId: string): Promise<AppointmentItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const apt = (await c.query(
        `SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
        [appointmentId, ctx.shopId]
      )).rows[0];
      if (!apt) throw notFound();

      const worker = (await c.query(
        `SELECT id, display_name FROM workers WHERE id = $1 AND shop_id = $2 AND is_active = true`,
        [workerId, ctx.shopId]
      )).rows[0];
      if (!worker) throw notFound('Worker not found or inactive.');

      // Verify worker supports all services in this appointment
      const unsupported = (await c.query(
        `SELECT aps.service_name FROM appointment_services aps
         LEFT JOIN worker_services ws ON ws.service_id = aps.service_id AND ws.worker_id = $1
         WHERE aps.appointment_id = $2 AND ws.service_id IS NULL`,
        [workerId, appointmentId]
      )).rows;

      if (unsupported.length > 0) {
        throw badRequest(
          `Worker ${worker.display_name} cannot perform: ${unsupported.map((u) => u.service_name).join(', ')}`
        );
      }

      await c.query(
        `UPDATE appointments SET worker_id = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`,
        [workerId, appointmentId, ctx.shopId]
      );

      await c.query(
        `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [ctx.shopId, appointmentId, apt.status, `Assigned to worker ${worker.display_name}`, ctx.userId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'appointment.assign',
        entity: 'appointment',
        entityId: appointmentId,
        oldValues: { workerId: apt.worker_id },
        newValues: { workerId, workerName: worker.display_name },
        ip: ctx.ip,
      });

      return this.loadAppointment(c, ctx.shopId!, appointmentId);
    });
  }

  // ==================== STATUS MANAGEMENT ====================

  async updateStatus(ctx: AuthContext, appointmentId: string, status: AppointmentStatus, notes?: string | null): Promise<AppointmentItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const apt = (await c.query(
        `SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
        [appointmentId, ctx.shopId]
      )).rows[0];
      if (!apt) throw notFound();

      await c.query(
        `UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`,
        [status, appointmentId, ctx.shopId]
      );

      await c.query(
        `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [ctx.shopId, appointmentId, status, notes ?? `Status changed to ${status}`, ctx.userId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'appointment.status.update',
        entity: 'appointment',
        entityId: appointmentId,
        oldValues: { status: apt.status },
        newValues: { status, notes },
        ip: ctx.ip,
      });

      const loaded = await this.loadAppointment(c, ctx.shopId!, appointmentId);

      if (this.notifications) {
        try {
          await this.notifications.notifyAppointmentStatus(ctx.shopId!, {
            appointmentId: loaded.id,
            appointmentNumber: loaded.appointmentNumber,
            customerName: loaded.customerName,
            customerPhone: loaded.customerPhone,
            customerId: loaded.customerId,
            status,
            date: loaded.date,
            startTime: loaded.startTime ?? '',
            workerName: loaded.workerName ?? undefined,
          });
        } catch {
          // notification dispatch failure should not block core status change
        }
      }

      return loaded;
    });
  }

  // ==================== LISTING & QUERYING ====================

  async list(
    ctx: AuthContext,
    p: Effective,
    q: { date?: string; workerId?: string; customerId?: string; status?: string; page: number; limit: number }
  ): Promise<Paginated<AppointmentItem>> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const scope = p.isOwner ? 'all' : (p.map.get('appointments.view') ?? 'own');
      const conditions = ['a.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (scope === 'own') {
        const workerId = (await c.query(`SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`, [ctx.userId, ctx.shopId])).rows[0]?.id;
        if (!workerId) return { items: [], page: q.page, limit: q.limit, total: 0 };
        params.push(workerId);
        conditions.push(`a.worker_id = $${params.length}`);
      } else if (q.workerId) {
        params.push(q.workerId);
        conditions.push(`a.worker_id = $${params.length}`);
      }

      if (q.date) {
        params.push(q.date);
        conditions.push(`a.date = $${params.length}::date`);
      }
      if (q.customerId) {
        params.push(q.customerId);
        conditions.push(`a.customer_id = $${params.length}`);
      }
      if (q.status) {
        params.push(q.status);
        conditions.push(`a.status = $${params.length}`);
      }

      const whereClause = conditions.join(' AND ');
      const total = Number((await c.query(`SELECT count(*)::int n FROM appointments a WHERE ${whereClause}`, params)).rows[0].n);

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit);
      params.push(offset);

      const aptRows = (await c.query(
        `SELECT a.id
         FROM appointments a
         WHERE ${whereClause}
         ORDER BY a.date DESC, a.start_time ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )).rows;

      const items: AppointmentItem[] = [];
      for (const r of aptRows) {
        items.push(await this.loadAppointment(c, ctx.shopId!, r.id));
      }

      return { items, page: q.page, limit: q.limit, total };
    });
  }

  async get(ctx: AuthContext, p: Effective, id: string): Promise<AppointmentItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const scope = p.isOwner ? 'all' : (p.map.get('appointments.view') ?? 'own');
      if (scope === 'own') {
        const workerId = (await c.query(`SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`, [ctx.userId, ctx.shopId])).rows[0]?.id;
        const apt = (await c.query(`SELECT id FROM appointments WHERE id = $1 AND shop_id = $2 AND worker_id = $3`, [id, ctx.shopId, workerId])).rows[0];
        if (!apt) throw notFound();
      }
      return this.loadAppointment(c, ctx.shopId!, id);
    });
  }

  // ==================== HELPER ====================

  private async loadAppointment(c: any, shopId: string, appointmentId: string): Promise<AppointmentItem> {
    const row = (await c.query(
      `SELECT a.id, a.appointment_number, a.customer_id, c.name AS customer_name, c.phone AS customer_phone,
              a.worker_id, w.display_name AS worker_name, a.date::text AS date,
              a.start_time::text AS start_time, a.end_time::text AS end_time,
              a.status, a.notes, a.is_walk_in, a.total_amount_paise,
              a.created_at, a.updated_at
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       LEFT JOIN workers w ON w.id = a.worker_id
       WHERE a.id = $1 AND a.shop_id = $2`,
      [appointmentId, shopId]
    )).rows[0];

    if (!row) throw notFound();

    const services = (await c.query(
      `SELECT id, service_id, service_name, unit_price_paise, duration_minutes, added_at
       FROM appointment_services
       WHERE appointment_id = $1 AND shop_id = $2
       ORDER BY added_at ASC`,
      [appointmentId, shopId]
    )).rows;

    return {
      id: row.id,
      appointmentNumber: row.appointment_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      workerId: row.worker_id ?? null,
      workerName: row.worker_name ?? null,
      date: row.date,
      startTime: hhmm(row.start_time)!,
      endTime: hhmm(row.end_time)!,
      status: row.status as AppointmentStatus,
      notes: row.notes,
      isWalkIn: row.is_walk_in,
      totalAmountPaise: Number(row.total_amount_paise),
      services: services.map((s: any) => ({
        id: s.id,
        serviceId: s.service_id,
        serviceName: s.service_name,
        unitPricePaise: Number(s.unit_price_paise),
        durationMinutes: Number(s.duration_minutes),
        addedAt: s.added_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async dispatchUpcomingReminders(ctx: AuthContext, windowMinutes = 120): Promise<{ count: number; reminded: Array<{ id: string; appointmentNumber: number; customerName: string; time: string }> }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const shop = (await c.query('SELECT id, name, phone, timezone FROM shops WHERE id = $1', [ctx.shopId])).rows[0];
      if (!shop) throw notFound();

      const query = `
        SELECT a.id, a.appointment_number, a.customer_id, c.name as customer_name, c.phone as customer_phone,
               w.id as worker_id, w.display_name as worker_name, w.user_id as worker_user_id,
               a.date::text as date, a.start_time::text as start_time, a.start_at,
               COALESCE(
                 (SELECT array_agg(COALESCE(s.name_snapshot, s.service_name))
                  FROM appointment_services s
                  WHERE s.appointment_id = a.id AND s.removed_at IS NULL),
                 '{}'
               ) as service_names
        FROM appointments a
        JOIN customers c ON c.id = a.customer_id
        LEFT JOIN workers w ON w.id = a.worker_id
        WHERE a.shop_id = $1
          AND a.status IN ('booked', 'confirmed')
          AND a.start_at >= now() - interval '15 minutes'
          AND a.start_at <= now() + ($2 || ' minutes')::interval
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.shop_id = a.shop_id
              AND n.customer_id = a.customer_id
              AND (n.metadata->>'appointmentId') = a.id::text
              AND (n.metadata->>'isReminder') = 'true'
          )
        ORDER BY a.start_at ASC
      `;

      const rows = (await c.query(query, [ctx.shopId, windowMinutes])).rows;
      const reminded: Array<{ id: string; appointmentNumber: number; customerName: string; time: string }> = [];

      for (const row of rows) {
        const srvText = (row.service_names && row.service_names.length) ? row.service_names.join(', ') : 'Grooming Services';
        const workerText = row.worker_name ? ` with ${row.worker_name}` : '';
        const timeStr = row.start_time ? row.start_time.slice(0, 5) : '';

        const clientReminderMsg = `${shop.name}: Friendly reminder! Your appointment #${row.appointment_number} for ${srvText}${workerText} is scheduled for today at ${timeStr}. We look forward to seeing you!`;
        const adminReminderMsg = `Reminder: Appointment #${row.appointment_number} for ${row.customer_name} is starting at ${timeStr}${workerText}.`;

        const whatsappUrl = this.notifications?.buildWhatsAppLink(row.customer_phone, clientReminderMsg);

        // 1. Client notification (In-app + WhatsApp link)
        await c.query(
          `INSERT INTO notifications (shop_id, customer_id, title, message, type, channel, status, metadata, whatsapp_url)
           VALUES ($1, $2, $3, $4, 'appointment_confirmed', 'in_app', 'unread', $5, $6)`,
          [
            ctx.shopId,
            row.customer_id,
            `Upcoming Appointment Reminder #${row.appointment_number}`,
            clientReminderMsg,
            JSON.stringify({
              appointmentId: row.id,
              appointmentNumber: row.appointment_number,
              customerPhone: row.customer_phone,
              isReminder: true,
              scheduledTime: timeStr,
            }),
            whatsappUrl || null,
          ]
        );

        // 2. Staff notification
        await c.query(
          `INSERT INTO notifications (shop_id, user_id, title, message, type, channel, status, metadata)
           VALUES ($1, $2, $3, $4, 'appointment_confirmed', 'in_app', 'unread', $5)`,
          [
            ctx.shopId,
            row.worker_user_id || null,
            `Upcoming Appointment #${row.appointment_number} in Chair`,
            adminReminderMsg,
            JSON.stringify({
              appointmentId: row.id,
              appointmentNumber: row.appointment_number,
              customerName: row.customer_name,
              isReminder: true,
              scheduledTime: timeStr,
            }),
          ]
        );

        reminded.push({
          id: row.id,
          appointmentNumber: row.appointment_number,
          customerName: row.customer_name,
          time: timeStr,
        });
      }

      if (reminded.length > 0) {
        await this.audit.log(c, {
          shopId: ctx.shopId,
          userId: ctx.userId,
          action: 'appointment.reminders.dispatch',
          entity: 'appointment',
          entityId: ctx.shopId!,
          newValues: { count: reminded.length, reminded },
          ip: ctx.ip,
        });
      }

      return { count: reminded.length, reminded };
    });
  }
}
