import { Module } from '@nestjs/common';
import { CategoriesController, ServicesController } from './catalog.controller';
import { PublicCatalogController, PublicServicesCatalogController } from './public-catalog.controller';
import { ServicesService } from './services.service';
@Module({ controllers: [CategoriesController, ServicesController, PublicCatalogController, PublicServicesCatalogController], providers: [ServicesService] })
export class CatalogModule {}
