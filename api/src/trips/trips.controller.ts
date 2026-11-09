import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { TripsService } from './trips.service';

@ApiTags('recorridos')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar recorridos consolidados (viajes diarios y activos)' })
  @ApiQuery({ name: 'date', required: false, description: 'Fecha YYYY-MM-DD en hora local' })
  @ApiQuery({ name: 'vehicleId', required: false, type: Number })
  @ApiQuery({ name: 'estado', required: false, description: 'EN_CURSO, FINALIZADO, INCOMPLETO, PARCIAL' })
  async getTrips(
    @Query('date') date?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.tripsService.getTrips({
      date,
      vehicleId: vehicleId ? Number(vehicleId) : undefined,
      estado,
    });
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Auditar integridad entre eventos, recorridos y paradas',
    description:
      'Verifica paradas sin recorrido o fuera de intervalo, contadores inconsistentes, ' +
      'trazabilidad, versión del algoritmo y distribución de estados/confianza.',
  })
  async getIntegrityReport() {
    return this.tripsService.getIntegrityReport();
  }

  @Get('stops/sample')
  @ApiOperation({
    summary: 'Muestra estratificada de paradas para validación manual',
    description:
      'Devuelve hasta N paradas por nivel de confianza (ALTA, MEDIA, BAJA) con la ' +
      'evidencia necesaria para contrastarlas con controles de acceso o partes del conductor.',
  })
  @ApiQuery({ name: 'date', required: false, description: 'Fecha YYYY-MM-DD en hora local' })
  @ApiQuery({ name: 'vehicleId', required: false, type: Number })
  @ApiQuery({ name: 'perLevel', required: false, type: Number, description: 'Muestras por nivel (1-50)' })
  async getStopsSample(
    @Query('date') date?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('perLevel', new DefaultValuePipe(5), ParseIntPipe) perLevel?: number,
  ) {
    return this.tripsService.getStopsSample({
      date,
      vehicleId: vehicleId ? Number(vehicleId) : undefined,
      perLevel,
    });
  }

  @Get(':id/stops')
  @ApiOperation({ summary: 'Listar paradas y evidencia de un recorrido' })
  async getTripStops(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.getTripStops(id);
  }

  @Post('consolidate')
  @ApiOperation({ summary: 'Ejecutar consolidación idempotente de recorridos y paradas' })
  async consolidate() {
    return this.tripsService.consolidateAll();
  }
}
