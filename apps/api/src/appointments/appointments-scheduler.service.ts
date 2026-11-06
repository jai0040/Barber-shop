import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private initialTimeout: NodeJS.Timeout | null = null;

  constructor(
    private db: Db,
    private appointmentsService: AppointmentsService
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // Initial sweep after 15 seconds, then recurring every 30 minutes
    const intervalMs = 30 * 60 * 1000;
    this.initialTimeout = setTimeout(() => this.runScheduledSweep(), 15000);
    this.initialTimeout.unref();
    this.timer = setInterval(() => this.runScheduledSweep(), intervalMs);
    this.timer.unref();
    this.logger.log('Appointments auto-reminder scheduler initialized (30 min interval).');
  }

  onModuleDestroy() {
    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runScheduledSweep() {
    try {
      const shops = await this.db.tenant({ platform: true }, async (c) => {
        return (await c.query(`SELECT id, name, settings FROM shops WHERE status = 'active'`)).rows;
      });

      for (const shop of shops) {
        // Run if auto_reminders is not explicitly disabled
        const enabled = shop.settings?.auto_reminders_enabled !== false;
        if (!enabled) continue;

        try {
          const res = await this.appointmentsService.dispatchUpcomingReminders(
            {
              shopId: shop.id,
              userId: '00000000-0000-0000-0000-000000000000',
              type: 'staff',
              ip: '127.0.0.1',
            },
            180 // check upcoming 3 hours
          );
          if (res.count > 0) {
            this.logger.log(`[Auto-Reminder] Dispatched ${res.count} reminders for "${shop.name}".`);
          }
        } catch (err: any) {
          this.logger.warn(`[Auto-Reminder] Note for "${shop.name}": ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Auto-Reminder] Scheduler error: ${err.message}`);
    }
  }
}
