import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { ErrorCodes } from '@barbershop/shared';
import { Auth, Public, RequirePermission, StaffOnly } from '../common/decorators';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { loadConfig } from '../config';
import { ShopsService } from './shops.service';
import { hoursSchema, publicListSchema, settingsSchema, slugParam, updateShopSchema } from './shops.schemas';

const upload = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: loadConfig().MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 0 } });
const need = (f?: Express.Multer.File) => {
  if (!f) throw new BadRequestException({ message: 'Please choose an image file (form field "file").', code: ErrorCodes.VALIDATION_FAILED });
  return f.buffer;
};

function sendImage(res: Response, svc: ShopsService, f: { key: string; mime: string }, cache: string, corp: 'cross-origin' | 'same-site') {
  res.set({
    'Content-Type': f.mime, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'", 'Cache-Control': cache, 'Cross-Origin-Resource-Policy': corp,
  });
  const s = svc.stream(f.key);
  s.on('error', () => { if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found.', code: ErrorCodes.NOT_FOUND }); else res.end(); });
  s.pipe(res);
}

@Controller('shops/current')
export class ShopsController {
  constructor(private svc: ShopsService) {}

  @StaffOnly() @Get() current(@Auth() ctx: AuthContext) { return this.svc.current(ctx); }
  @StaffOnly() @Get('setup') setup(@Auth() ctx: AuthContext) { return this.svc.setup(ctx); }

  @RequirePermission('settings.manage')
  @Get('backup')
  backup(@Auth() ctx: AuthContext) {
    return this.svc.exportShopBackup(ctx);
  }

  @RequirePermission('settings.manage') @Patch()
  update(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(updateShopSchema)) dto: any) { return this.svc.update(ctx, dto); }

  @RequirePermission('settings.manage') @Put('hours')
  hours(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(hoursSchema)) dto: any) { return this.svc.setHours(ctx, dto.hours); }

  @RequirePermission('settings.manage') @Patch('settings')
  settings(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(settingsSchema)) dto: any) { return this.svc.updateSettings(ctx, dto); }

  @RequirePermission('settings.manage') @Post('logo') @HttpCode(200) @UseInterceptors(upload())
  logo(@Auth() ctx: AuthContext, @UploadedFile() f?: Express.Multer.File) { return this.svc.uploadImage(ctx, 'shop_logo', need(f)); }

  @RequirePermission('settings.manage') @Delete('logo')
  removeLogo(@Auth() ctx: AuthContext) { return this.svc.removeImage(ctx, 'shop_logo'); }

  @RequirePermission('settings.manage') @Post('upi-qr') @HttpCode(200) @UseInterceptors(upload())
  qr(@Auth() ctx: AuthContext, @UploadedFile() f?: Express.Multer.File) { return this.svc.uploadImage(ctx, 'upi_qr', need(f)); }

  @RequirePermission('settings.manage') @Delete('upi-qr')
  removeQr(@Auth() ctx: AuthContext) { return this.svc.removeImage(ctx, 'upi_qr'); }

  /** The QR is for billing screens: staff who can take payments or manage settings. Never public. */
  @RequirePermission('settings.manage', 'payments.record', 'billing.create') @Get('upi-qr')
  async getQr(@Auth() ctx: AuthContext, @Res() res: Response) {
    sendImage(res, this.svc, await this.svc.upiQr(ctx), 'private, no-store', 'same-site');
  }
}

@Public()
@Controller('shops/public')
export class PublicShopsController {
  constructor(private svc: ShopsService) {}

  @Get() list(@Query(new ZodValidationPipe(publicListSchema)) q: any) { return this.svc.publicList(q); }

  @Get(':slug') bySlug(@Param('slug', new ZodValidationPipe(slugParam)) slug: string) { return this.svc.publicBySlug(slug); }

  @Get(':slug/logo')
  async logo(@Param('slug', new ZodValidationPipe(slugParam)) slug: string, @Res() res: Response) {
    sendImage(res, this.svc, await this.svc.publicLogo(slug), 'public, max-age=300', 'cross-origin');
  }
}
