import { Module } from '@nestjs/common';
import { PublicShopsController, ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
@Module({ controllers: [ShopsController, PublicShopsController], providers: [ShopsService] })
export class ShopsModule {}
