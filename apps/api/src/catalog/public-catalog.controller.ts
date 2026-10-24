import { Controller, Get, Param } from '@nestjs/common';
import { ErrorCodes } from '@barbershop/shared';
import { Public } from '../common/decorators';
import { AppException } from '../common/app-exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Db } from '../db/db.service';
import { slugParam } from '../shops/shops.schemas';

/** Customer website: what can be booked. Read-only, no login, active things only (enforced by RLS public_read policies). */
@Public()
@Controller('shops/public/:slug')
export class PublicCatalogController {
  constructor(private db: Db) {}

  @Get('services')
  services(@Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query('SELECT id FROM shops WHERE slug=$1', [slug])).rows[0];
      if (!shop) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Shop not found.');
      const cats = (await c.query('SELECT id, name FROM service_categories WHERE shop_id=$1 ORDER BY sort_order, lower(name)', [shop.id])).rows;
      const svcs = (await c.query('SELECT id, category_id, name, description, price_paise, duration_min FROM services WHERE shop_id=$1 ORDER BY lower(name)', [shop.id])).rows;
      const shape = (s: any) => ({ id: s.id, name: s.name, description: s.description, pricePaise: s.price_paise, durationMin: s.duration_min });
      return {
        categories: cats.map((k) => ({ id: k.id, name: k.name, services: svcs.filter((s) => s.category_id === k.id).map(shape) })).filter((g) => g.services.length),
        uncategorized: svcs.filter((s) => !s.category_id).map(shape),
      };
    });
  }
}
