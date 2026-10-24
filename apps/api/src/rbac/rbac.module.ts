import { Module } from '@nestjs/common';
import { PermissionsController, RolesController, UsersController } from './rbac.controller';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';

@Module({ controllers: [PermissionsController, RolesController, UsersController], providers: [RolesService, UsersService], exports: [UsersService] })
export class RbacModule {}
