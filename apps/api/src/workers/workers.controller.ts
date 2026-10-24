import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ErrorCodes } from '@barbershop/shared';
import { Auth, Perms, RequirePermission, StaffOnly } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { loadConfig } from '../config';
import { WorkersService } from './workers.service';
import { addLoginSchema, createWorkerSchema, listWorkersSchema, updateWorkerSchema } from './workers.schemas';

const upload = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: loadConfig().MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 0 } });
const need = (f?: Express.Multer.File) => { if (!f) throw new BadRequestException({ message: 'Please choose an image file (form field "file").', code: ErrorCodes.VALIDATION_FAILED }); return f.buffer; };
const ID = () => Param('id', ParseUUIDPipe);

@Controller('workers')
export class WorkersController {
  constructor(private svc: WorkersService) {}

  @StaffOnly() @Get('me') me(@Auth() ctx: AuthContext) { return this.svc.me(ctx); } // static routes before ":id"

  @RequirePermission('workers.view') @Get()
  list(@Auth() ctx: AuthContext, @Perms() p: Effective, @Query(new ZodValidationPipe(listWorkersSchema)) q: any) { return this.svc.list(ctx, p, q); }
  @RequirePermission('workers.create') @Post()
  create(@Auth() ctx: AuthContext, @Perms() p: Effective, @Body(new ZodValidationPipe(createWorkerSchema)) dto: any) { return this.svc.create(ctx, p, dto); }
  @RequirePermission('workers.view') @Get(':id') get(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.get(ctx, p, id); }
  @RequirePermission('workers.update') @Patch(':id')
  update(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string, @Body(new ZodValidationPipe(updateWorkerSchema)) dto: any) { return this.svc.update(ctx, p, id, dto); }
  @RequirePermission('workers.delete') @Delete(':id') @HttpCode(200) archive(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.archive(ctx, p, id); }
  @RequirePermission('workers.delete') @Post(':id/restore') @HttpCode(200) restore(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.restore(ctx, p, id); }
  @RequirePermission('workers.update') @Post(':id/login')
  addLogin(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string, @Body(new ZodValidationPipe(addLoginSchema)) dto: any) { return this.svc.addLogin(ctx, p, id, dto); }
  @RequirePermission('workers.update') @Post(':id/photo') @HttpCode(200) @UseInterceptors(upload())
  photo(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string, @UploadedFile() f?: Express.Multer.File) { return this.svc.photo(ctx, p, id, need(f)); }
  @RequirePermission('workers.update') @Delete(':id/photo') @HttpCode(200) removePhoto(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.removePhoto(ctx, p, id); }
}
