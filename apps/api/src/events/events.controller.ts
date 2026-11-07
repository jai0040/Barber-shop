import { Controller, Get, Query, Res, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { Auth, StaffOnly } from '../common/decorators';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { RealtimeEventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private eventsSvc: RealtimeEventsService,
    private db: Db
  ) {}

  /**
   * Server-Sent Events (SSE) stream for real-time queue updates,
   * chair status transitions, and salon alerts.
   * Scoped strictly to the caller's shop tenant.
   */
  @StaffOnly()
  @SkipThrottle()
  @Sse('stream')
  async stream(
    @Auth() ctx: AuthContext,
    @Query('scope') scope: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<Observable<any>> {
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    let workerId: string | null = null;

    // If caller didn't explicitly request shop-wide scope ('all'),
    // check if this staff user has an assigned worker profile
    if (scope !== 'all' && ctx.shopId && ctx.userId) {
      const w = (
        await this.db.query(
          'SELECT id FROM workers WHERE shop_id = $1 AND user_id = $2 AND status = $3',
          [ctx.shopId, ctx.userId, 'active']
        )
      ).rows[0];
      if (w) {
        workerId = w.id;
      }
    }

    return this.eventsSvc.subscribe(ctx.shopId!, workerId);
  }
}
