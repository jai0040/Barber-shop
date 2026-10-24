import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PublicWorkersController } from './public-workers.controller';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
@Module({ imports: [RbacModule], controllers: [WorkersController, PublicWorkersController], providers: [WorkersService] })
export class WorkersModule {}
