import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ApiKeyGuard } from './common/guards/api-key.guard';
import configuration from './config/configuration';
import { FleetModule } from './fleet/fleet.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
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
    FleetModule,
  ],
  controllers: [HealthController],
  providers: [
    // El rate limit se evalúa antes de validar la clave.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
