import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth, Perms, Public, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { AppointmentsService } from './appointments.service';
import {
  addServiceSchema,
  appointmentQuerySchema,
  assignWorkerSchema,
  createWalkInSchema,
  publicBookSchema,
  updateStatusSchema,
} from './appointments.schemas';

@Controller('appointments')
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @RequirePermission('appointments.view')
  @Get()
  list(@Auth() ctx: AuthContext, @Perms() p: Effective, @Query(new ZodValidationPipe(appointmentQuerySchema)) q: any) {
    return this.svc.list(ctx, p, q);
  }

  @RequirePermission('appointments.view')
  @Get(':id')
  get(@Auth() ctx: AuthContext, @Perms() p: Effective, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(ctx, p, id);
  }

  @RequirePermission('appointments.create')
  @Post('walk-in')
  createWalkIn(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createWalkInSchema)) dto: any) {
    return this.svc.createWalkIn(ctx, dto);
  }

  @RequirePermission('appointments.assign')
  @Patch(':id/assign')
  assign(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignWorkerSchema)) dto: any
  ) {
    return this.svc.assignWorker(ctx, id, dto.workerId);
  }

  @RequirePermission('appointments.update')
  @Patch(':id/status')
  updateStatus(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) dto: any
  ) {
    return this.svc.updateStatus(ctx, id, dto.status, dto.notes);
  }

  @RequirePermission('appointments.add_service')
  @Post(':id/services')
  addService(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addServiceSchema)) dto: any
  ) {
    return this.svc.addService(ctx, id, dto.serviceId);
  }
}

@Public()
@Controller('appointments/public')
export class PublicAppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Post(':slug/book')
  book(
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string,
    @Body(new ZodValidationPipe(publicBookSchema)) dto: any
  ) {
    return this.svc.bookPublic(slug, dto);
  }
}
