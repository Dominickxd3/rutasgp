import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { HistoryService } from './history.service';
import { normalizeHistoryRange } from './history-range';
import { HistoryAuditService } from './history-audit.service';

function positiveInteger(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException(`${name} debe ser un entero positivo.`);
  return parsed;
}

function isoDate(value: string | undefined, name: string): Date {
  const date = new Date(value ?? '');
  if (!value || Number.isNaN(date.getTime())) throw new BadRequestException(`${name} debe ser una fecha ISO válida.`);
  return date;
}

@ApiTags('history')
@ApiSecurity('api-key')
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService, private readonly config: ConfigService, private readonly audit: HistoryAuditService) {}

  @Get('audit')
  async inspect(@Query('vehicleId') vehicle?:string,@Query('from') from?:string,@Query('to') to?:string,@Query('tripId') trip?:string) {
    const report=await this.audit.inspect(positiveInteger(vehicle,'vehicleId'),isoDate(from,'from'),isoDate(to,'to'),trip?positiveInteger(trip,'tripId'):undefined);
    return {...report,points:undefined};
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Vehículos disponibles para consulta histórica' })
  listVehicles() {
    return this.history.listVehicles();
  }

  @Get('positions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Posiciones históricas paginadas por vehículo e intervalo UTC' })
  getPositions(
    @Query('vehicleId') vehicleIdValue?: string,
    @Query('from') fromValue?: string,
    @Query('to') toValue?: string,
    @Query('page') pageValue?: string,
    @Query('pageSize') pageSizeValue?: string,
  ) {
    const vehicleId = positiveInteger(vehicleIdValue, 'vehicleId');
    const { from, to } = normalizeHistoryRange(isoDate(fromValue, 'from'), isoDate(toValue, 'to'));
    const page = positiveInteger(pageValue, 'page', 1);
    const pageSize = positiveInteger(pageSizeValue, 'pageSize', this.config.get<number>('history.defaultPageSize', 1_000));
    return this.history.getPositions(vehicleId, from, to, page, pageSize);
  }
}
