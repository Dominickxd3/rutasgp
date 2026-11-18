import { Module } from '@nestjs/common';

import { GeofencesModule } from '../geofences/geofences.module';
import { OsrmService } from '../history/osrm.service';
import { MobileDeviceController } from './mobile-device.controller';
import { MobileDeviceService } from './mobile-device.service';

@Module({
  imports: [GeofencesModule],
  controllers: [MobileDeviceController],
  // Mismo map matching de Historial, para que el recorrido siga las calles
  providers: [MobileDeviceService, OsrmService],
})
export class MobileDeviceModule {}
