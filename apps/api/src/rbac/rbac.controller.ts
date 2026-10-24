import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Auth, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';
import { createRoleSchema, createStaffSchema, renameRoleSchema, setPermissionsSchema, setStatusSchema, setUserRolesSchema } from './rbac.schemas';

@Controller('permissions')
export class PermissionsController {
  constructor(private roles: RolesService) {}
  @RequirePermission('permissions.manage', 'roles.manage') @Get()
  catalog() { return this.roles.catalog(); }
}

@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}
  @RequirePermission('roles.manage', 'permissions.manage') @Get()
  list(@Auth() ctx: AuthContext) { return this.roles.list(ctx); }

  @RequirePermission('roles.manage', 'permissions.manage') @Get(':id')
  get(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.roles.get(ctx, id); }

  @RequirePermission('roles.manage') @Post()
  create(@Auth() ctx: AuthContext, @Perms() p: Effective, @Body(new ZodValidationPipe(createRoleSchema)) dto: any) { return this.roles.create(ctx, p, dto); }

  @RequirePermission('roles.manage') @Patch(':id')
  rename(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(renameRoleSchema)) dto: any) { return this.roles.rename(ctx, id, dto.name); }

  @RequirePermission('permissions.manage') @Put(':id/permissions')
  setPermissions(@Auth() ctx: AuthContext, @Perms() p: Effective, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setPermissionsSchema)) dto: any) {
    return this.roles.setPermissions(ctx, p, id, dto.permissions);
  }

  @RequirePermission('roles.manage') @Delete(':id') @HttpCode(200)
  remove(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.roles.remove(ctx, id); }
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}
  @RequirePermission('users.view', 'users.manage', 'roles.manage') @Get()
  list(@Auth() ctx: AuthContext) { return this.users.list(ctx); }

  @RequirePermission('users.manage') @Post()
  create(@Auth() ctx: AuthContext, @Perms() p: Effective, @Body(new ZodValidationPipe(createStaffSchema)) dto: any) { return this.users.create(ctx, p, dto); }

  @RequirePermission('roles.manage', 'users.manage') @Put(':id/roles')
  setRoles(@Auth() ctx: AuthContext, @Perms() p: Effective, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setUserRolesSchema)) dto: any) {
    return this.users.setRoles(ctx, p, id, dto.roleIds);
  }

  @RequirePermission('users.manage') @Patch(':id/status')
  setStatus(@Auth() ctx: AuthContext, @Perms() p: Effective, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setStatusSchema)) dto: any) {
    return this.users.setStatus(ctx, p, id, dto.status);
  }
}
