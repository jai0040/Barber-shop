import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import * as crypto from 'crypto';
import { Observable, Subject, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface BarberShopEvent {
  id: string;
  shopId: string;
  type: string;
  workerId?: string | null;
  appointmentId?: string | null;
  customerId?: string | null;
  data?: any;
  timestamp: string;
}

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private readonly bus$ = new Subject<BarberShopEvent>();

  /** Emit an event across the shop event bus */
  emit(event: Omit<BarberShopEvent, 'id' | 'timestamp'>): void {
    const fullEvent: BarberShopEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.bus$.next(fullEvent);
  }

  /**
   * Subscribe to real-time events for a specific shop.
   * Enforces multi-tenant shop isolation (Rule D16).
   * Optional workerId filters events to that specific worker or shop-wide events.
   */
  subscribe(shopId: string, workerId?: string | null): Observable<MessageEvent> {
    const events$ = this.bus$.pipe(
      filter((e) => {
        // Strict shop tenant isolation
        if (e.shopId !== shopId) return false;

        // If subscriber is a specific barber, deliver events for their chair or shop-wide events
        if (workerId && e.workerId && e.workerId !== workerId) {
          return false;
        }

        return true;
      }),
      map((e) => ({
        id: e.id,
        type: e.type,
        data: e,
      } as MessageEvent))
    );

    // Keep-alive heartbeat ping every 25s to prevent timeouts in proxies/browsers
    const heartbeat$ = interval(25_000).pipe(
      map(() => ({
        type: 'ping',
        data: { timestamp: new Date().toISOString() },
      } as MessageEvent))
    );

    return merge(events$, heartbeat$);
  }
}
