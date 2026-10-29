import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

function setupSwagger(app: NestExpressApplication, port: number): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API de monitoreo de flota')
      .setDescription(
        [
          'Proxy tipado sobre el feed GPS del proveedor.',
          '',
          'Autenticación: envía el header `x-api-key` con la clave que te entregó el',
          'administrador del servicio (también se acepta `Authorization: Bearer <clave>`).',
          '',
          'El endpoint `/api/health` no requiere clave.',
        ].join('\n'),
      )
      .setVersion('1.0.0')
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Clave de acceso entregada por el administrador.',
        },
        'api-key',
      )
      .addTag('fleet', 'Posiciones y estado de las unidades')
      .addTag('health', 'Estado del servicio')
      .build(),
  );

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'API de flota',
  });

  Logger.log(
    `Documentación interactiva en http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  if (config.get<boolean>('trustProxy', false)) {
    // Necesario para que el rate limit use la IP real detrás de Nginx/Traefik.
    app.set('trust proxy', 1);
  }

  app.enableCors({
    origin: (config.get<string>('corsOrigin') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET'],
    allowedHeaders: ['x-api-key', 'authorization', 'content-type', 'accept'],
  });
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);

  if (config.get<boolean>('swaggerEnabled', true)) {
    setupSwagger(app, port);
  }

  await app.listen(port);

  Logger.log(
    `API de flota disponible en http://localhost:${port}/api/fleet/units`,
    'Bootstrap',
  );

  if (!config.get<string>('apiKey') && process.env.NODE_ENV === 'production') {
    Logger.warn(
      'API_KEY está vacía: la API es pública. Define API_KEY antes de exponerla.',
      'Bootstrap',
    );
  }
}

void bootstrap();
