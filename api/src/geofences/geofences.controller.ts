import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { GeofencesService } from './geofences.service';

function optionalPositiveInt(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num < 1) {
    throw new BadRequestException('El ID debe ser un entero positivo.');
  }
  return num;
}

function optionalDate(val: string | undefined): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Formato de fecha inválido.');
  }
  return d;
}

@ApiTags('geofences')
@ApiSecurity('api-key')
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Get()
  @ApiOperation({ summary: 'Listado de geocercas activas agrupadas por sede' })
  getActiveGeofences() {
    return this.geofencesService.getActiveGeofences();
  }

  @Get('events')
  @ApiOperation({
    summary: 'Eventos persistidos de entrada y salida de geocercas/sedes',
  })
  getEvents(
    @Query('vehicleId') vehicleId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.geofencesService.getEvents(
      optionalPositiveInt(vehicleId),
      optionalDate(from),
      optionalDate(to),
      optionalPositiveInt(limit) ?? 200,
    );
  }

  @Post('sync-historical')
  @ApiOperation({
    summary:
      'Sincroniza retroactivamente los eventos de geocerca evaluando el historial GPS',
  })
  syncHistorical(@Query('vehicleId') vehicleId?: string) {
    return this.geofencesService.syncHistoricalEvents(
      optionalPositiveInt(vehicleId),
    );
  }
}
