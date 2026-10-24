import { Module } from '@nestjs/common';
import { CategoriesController, ServicesController } from './catalog.controller';
import { PublicCatalogController } from './public-catalog.controller';
import { ServicesService } from './services.service';
@Module({ controllers: [CategoriesController, ServicesController, PublicCatalogController], providers: [ServicesService] })
export class CatalogModule {}
