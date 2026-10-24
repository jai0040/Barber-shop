import { Controller, Get, Param, Query } from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { AvailabilityService } from './availability.service';
import { slotsQuerySchema } from './availability.schemas';

@Public()
@Controller('appointments/public')
export class PublicAvailabilityController {
  constructor(private svc: AvailabilityService) {}

  @Get(':slug/slots')
  getSlots(
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string,
    @Query(new ZodValidationPipe(slotsQuerySchema)) q: any
  ) {
    const serviceIds = q.serviceIds.split(',').map((s: string) => s.trim()).filter(Boolean);
    return this.svc.calculateSlots(slug, {
      date: q.date,
      serviceIds,
      workerId: q.workerId,
    });
  }
}

@Controller('availability')
export class StaffAvailabilityController {
  constructor(private svc: AvailabilityService) {}

  @RequirePermission('appointments.view', 'appointments.create')
  @Get('slots')
  async getStaffSlots(
    @Auth() ctx: AuthContext,
    @Query(new ZodValidationPipe(slotsQuerySchema)) q: any
  ) {
    // In staff context, fetch current shop slug
    const serviceIds = q.serviceIds.split(',').map((s: string) => s.trim()).filter(Boolean);
    // Fetch shop slug from db for current shop
    return this.svc.calculateSlots((ctx as any).shopSlug ?? 'classic-barber', {
      date: q.date,
      serviceIds,
      workerId: q.workerId,
    });
  }
}
