import { Module } from '@nestjs/common';

import { GeofencesModule } from '../geofences/geofences.module';
import { MobileDeviceController } from './mobile-device.controller';
import { MobileDeviceService } from './mobile-device.service';

@Module({
  imports: [GeofencesModule],
  controllers: [MobileDeviceController],
  providers: [MobileDeviceService],
})
export class MobileDeviceModule {}
