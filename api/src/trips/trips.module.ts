import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { GeofencesModule } from '../geofences/geofences.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [DatabaseModule, GeofencesModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
