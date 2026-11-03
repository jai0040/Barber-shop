import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CouponsService } from './coupons.service';
import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './coupons.schemas';

@Controller('coupons')
export class CouponsController {
  constructor(private svc: CouponsService) {}

  @RequirePermission('coupons.view')
  @Get()
  listCoupons(@Auth() ctx: AuthContext, @Query('activeOnly') activeOnly?: string) {
    return this.svc.listCoupons(ctx, activeOnly === 'true');
  }

  @RequirePermission('coupons.view')
  @Get(':id')
  getCoupon(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getCoupon(ctx, id);
  }

  @RequirePermission('coupons.manage')
  @Post()
  createCoupon(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(createCouponSchema)) dto: CreateCouponDto
  ) {
    return this.svc.createCoupon(ctx, dto);
  }

  @RequirePermission('coupons.manage')
  @Patch(':id')
  updateCoupon(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCouponSchema)) dto: UpdateCouponDto
  ) {
    return this.svc.updateCoupon(ctx, id, dto);
  }

  @RequirePermission('coupons.manage')
  @Delete(':id')
  deleteCoupon(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteCoupon(ctx, id);
  }

  // Used by POS billing terminal and customer booking
  @RequirePermission('billing.create')
  @Post('validate')
  validateCoupon(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(validateCouponSchema)) dto: ValidateCouponDto
  ) {
    return this.svc.validateCoupon(ctx, dto);
  }
}
