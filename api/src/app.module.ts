import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ApiKeyGuard } from './common/guards/api-key.guard';
import { CollectionModule } from './collection/collection.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { FleetModule } from './fleet/fleet.module';
import { GeofencesModule } from './geofences/geofences.module';
import { HealthController } from './health.controller';
import { HistoryModule } from './history/history.module';
import { TripsModule } from './trips/trips.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      envFilePath: process.env.NODE_ENV === 'production'
        ? ['.env.production.local', '.env.production', '.env.local', '.env']
        : ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttlMs', 60_000),
            limit: config.get<number>('throttle.limit', 120),
          },
        ],
      }),
    }),
    DatabaseModule,
    FleetModule,
    CollectionModule,
    HistoryModule,
    GeofencesModule,
    TripsModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    // El rate limit se evalúa antes de validar la clave.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
