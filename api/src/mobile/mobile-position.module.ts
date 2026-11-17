import { Module } from '@nestjs/common';

import { GeofencesModule } from '../geofences/geofences.module';
import { TripsModule } from '../trips/trips.module';
import { MobilePositionController } from './mobile-position.controller';
import { MobilePositionService } from './mobile-position.service';

@Module({
  imports: [GeofencesModule, TripsModule],
  controllers: [MobilePositionController],
  providers: [MobilePositionService],
})
export class MobilePositionModule {}
