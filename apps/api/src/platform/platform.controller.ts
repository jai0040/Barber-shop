import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, PlatformOnly } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../auth/schemas';
import { PlatformService } from './platform.service';

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, 'Use 3-50 lowercase letters, numbers or hyphens'),
  owner: z.object({ name: nameSchema, phone: phoneSchema.optional(), email: emailSchema.optional(), password: passwordSchema })
    .refine((o) => o.phone || o.email, { message: 'Owner needs a mobile number or an email', path: ['phone'] }),
});
const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

@PlatformOnly()
@Controller('platform/shops')
export class PlatformController {
  constructor(private svc: PlatformService) {}
  @Get() list() { return this.svc.list(); }
  @Post() create(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createShopSchema)) dto: any) { return this.svc.createShop(ctx, dto); }
  @Patch(':id/status')
  setStatus(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(statusSchema)) dto: any) {
    return this.svc.setStatus(ctx, id, dto.status);
  }
}
