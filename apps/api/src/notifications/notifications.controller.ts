import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth, CustomerOnly, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { CustomersService } from '../customers/customers.service';
import { NotificationsService } from './notifications.service';
import {
  createNotificationSchema,
  listNotificationsSchema,
} from './notifications.schemas';

@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @RequirePermission('notifications.view')
  @Get()
  list(
    @Auth() ctx: AuthContext,
    @Perms() p: Effective,
    @Query(new ZodValidationPipe(listNotificationsSchema)) q: any
  ) {
    return this.svc.list(ctx, p, q);
  }

  @RequirePermission('notifications.view')
  @Get('unread-count')
  unreadCount(@Auth() ctx: AuthContext, @Perms() p: Effective) {
    return this.svc.getUnreadCount(ctx, p);
  }

  @RequirePermission('notifications.view')
  @Patch(':id/read')
  markRead(
    @Auth() ctx: AuthContext,
    @Perms() p: Effective,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.svc.markAsRead(ctx, p, id);
  }

  @RequirePermission('notifications.view')
  @Post('read-all')
  @HttpCode(200)
  markAllRead(@Auth() ctx: AuthContext, @Perms() p: Effective) {
    return this.svc.markAllAsRead(ctx, p);
  }

  @RequirePermission('notifications.manage')
  @Post('dispatch')
  dispatch(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(createNotificationSchema)) dto: any
  ) {
    return this.svc.dispatch(ctx.shopId!, dto);
  }
}

/** Customer self-service alerts and receipts */
@CustomerOnly()
@Controller('me/shops/:slug/notifications')
export class CustomerNotificationsController {
  constructor(
    private svc: NotificationsService,
    private customersSvc: CustomersService
  ) {}

  @Get()
  async listCustomerNotifications(
    @Auth() ctx: AuthContext,
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string
  ) {
    const shopId = await this.customersSvc.shopBySlug(slug);
    const custId = await this.customersSvc.myCustomerId(ctx, shopId);
    if (!custId) return [];
    return this.svc.listCustomerNotifications(shopId, custId);
  }

  @Patch(':id/read')
  async markCustomerNotificationRead(
    @Auth() ctx: AuthContext,
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    const shopId = await this.customersSvc.shopBySlug(slug);
    const custId = await this.customersSvc.myCustomerId(ctx, shopId);
    if (!custId) return null;
    return this.svc.markCustomerNotificationRead(shopId, custId, id);
  }
}
