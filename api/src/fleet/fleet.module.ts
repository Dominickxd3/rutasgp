import { Module } from '@nestjs/common';

import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { ProviderEvidenceService } from './provider-evidence.service';

@Module({
  controllers: [FleetController],
  providers: [FleetService, ProviderEvidenceService],
  exports: [FleetService],
})
export class FleetModule {}
