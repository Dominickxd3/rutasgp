import { Module } from '@nestjs/common';

import { FleetModule } from '../fleet/fleet.module';
import { GeofencesModule } from '../geofences/geofences.module';
import { TripsModule } from '../trips/trips.module';
import { GpsCollectorService } from './gps-collector.service';

@Module({
  imports: [FleetModule, GeofencesModule, TripsModule],
  providers: [GpsCollectorService],
})
export class CollectionModule {}

