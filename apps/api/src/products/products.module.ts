import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { InventoryController, ProductsController, PublicProductsController } from './products.controller';

@Module({
  controllers: [ProductsController, InventoryController, PublicProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
