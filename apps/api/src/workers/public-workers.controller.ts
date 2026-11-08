import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '@barbershop/shared';
import { Public } from '../common/decorators';
import { AppException } from '../common/app-exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Db } from '../db/db.service';
import { FilesService } from '../files/files.service';
import { slugParam } from '../shops/shops.schemas';
import { publicBarbersSchema } from './workers.schemas';

/** Customer website: barber photos (only for active, non-archived barbers of active shops, via RLS public_read). */
@Public()
@Controller()
export class PublicWorkersController {
  constructor(private db: Db, private files: FilesService) {}

  /** Barbers; with ?serviceIds=a,b only those who can perform ALL of them (customers never see someone who can't do the job). */
  @Get(['shops/public/:slug/barbers', 'workers/public/:slug'])
  list(@Param('slug', new ZodValidationPipe(slugParam)) slug: string, @Query(new ZodValidationPipe(publicBarbersSchema)) q: { serviceIds: string[] }) {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query('SELECT id FROM shops WHERE slug=$1', [slug])).rows[0];
      if (!shop) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Shop not found.');
      const rows = (await c.query(
        `SELECT w.id, w.display_name, w.photo_file_id IS NOT NULL AS has_photo,
                COALESCE((SELECT array_agg(ws.service_id) FROM worker_services ws WHERE ws.worker_id = w.id), '{}') AS service_ids
           FROM workers w WHERE w.shop_id = $1
            AND NOT EXISTS (SELECT 1 FROM unnest($2::uuid[]) sid WHERE NOT EXISTS (SELECT 1 FROM worker_services ws WHERE ws.worker_id = w.id AND ws.service_id = sid))
          ORDER BY lower(w.display_name)`, [shop.id, q.serviceIds])).rows;
      return rows.map((r) => ({ id: r.id, displayName: r.display_name, photoUrl: r.has_photo ? `/api/v1/shops/public/${slug}/barbers/${r.id}/photo` : null, serviceIds: r.service_ids }));
    });
  }

  @Get(['shops/public/:slug/barbers/:id/photo', 'workers/public/:slug/:id/photo'])
  async photo(@Param('slug', new ZodValidationPipe(slugParam)) slug: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.db.tenant({ publicRead: true }, async (c) =>
      (await c.query('SELECT f.storage_key, f.mime FROM workers w JOIN files f ON f.id = w.photo_file_id JOIN shops s ON s.id = w.shop_id WHERE s.slug=$1 AND w.id=$2', [slug, id])).rows[0]);
    if (!f) throw new AppException(404, ErrorCodes.NOT_FOUND, 'No photo.');
    res.set({ 'Content-Type': f.mime, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'public, max-age=300', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    const s = this.files.stream(f.storage_key);
    s.on('error', () => { if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found.', code: ErrorCodes.NOT_FOUND }); else res.end(); });
    s.pipe(res);
  }
}
