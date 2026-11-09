import { Module } from '@nestjs/common';

import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { OsrmService } from './osrm.service';
import { HistoryAuditService } from './history-audit.service';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService, OsrmService, HistoryAuditService],
})
export class HistoryModule {}
