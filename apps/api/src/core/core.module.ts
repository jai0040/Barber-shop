import { Global, Module } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from './permissions.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [Db, AuditService, PermissionsService, TokenService],
  exports: [Db, AuditService, PermissionsService, TokenService],
})
export class CoreModule {}
