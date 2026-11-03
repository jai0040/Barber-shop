import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsService } from './products.service';
import { InventoryController, ProductsController, PublicProductsController } from './products.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ProductsController, InventoryController, PublicProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
