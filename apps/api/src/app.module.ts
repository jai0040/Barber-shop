import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfig } from './config';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CsrfGuard, PermissionGuard } from './auth/guards';
import { RbacModule } from './rbac/rbac.module';
import { PlatformModule } from './platform/platform.module';
import { ShopsModule } from './shops/shops.module';
import { FilesModule } from './files/files.module';
import { CatalogModule } from './catalog/catalog.module';
import { WorkersModule } from './workers/workers.module';
import { CustomersModule } from './customers/customers.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ProductsModule } from './products/products.module';
import { BillingModule } from './billing/billing.module';
import { FinanceModule } from './finance/finance.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MembershipsModule } from './memberships/memberships.module';
import { CommissionModule } from './commission/commission.module';
import { CouponsModule } from './coupons/coupons.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditController } from './audit/audit.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: loadConfig().GLOBAL_RATE_LIMIT }]),
    CoreModule, FilesModule, AuthModule, RbacModule, PlatformModule, ShopsModule,
    CatalogModule, WorkersModule, CustomersModule, AvailabilityModule,
    AppointmentsModule, ProductsModule, BillingModule, FinanceModule, ReportsModule,
    LoyaltyModule, MembershipsModule, CommissionModule, CouponsModule, AttendanceModule,
    ReviewsModule, NotificationsModule,
  ],
  controllers: [HealthController, AuditController],
  providers: [ // order matters: rate limit -> who are you -> CSRF -> are you allowed
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
