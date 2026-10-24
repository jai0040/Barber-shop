import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '@barbershop/shared';
import { Public } from '../common/decorators';
import { AppException } from '../common/app-exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Db } from '../db/db.service';
import { FilesService } from '../files/files.service';
import { slugParam } from '../shops/shops.schemas';

/** Customer website: barber photos (only for active, non-archived barbers of active shops, via RLS public_read). */
@Public()
@Controller('shops/public/:slug/barbers')
export class PublicWorkersController {
  constructor(private db: Db, private files: FilesService) {}

  @Get(':id/photo')
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
