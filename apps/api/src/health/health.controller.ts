import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { Db } from '../db/db.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private db: Db) {}

  @Get()
  live() { return { status: 'ok', time: new Date().toISOString() }; }

  @Get('db')
  async dbCheck() {
    try { await this.db.query('SELECT 1'); return { status: 'ok', database: 'up' }; }
    catch { throw new ServiceUnavailableException('Database is unreachable'); }
  }
}
