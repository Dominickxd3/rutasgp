import {
  Controller,
  Get,
  Header,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { FleetSnapshotDto } from './dto/fleet.dto';
import { FleetService } from './fleet.service';
import { FleetSnapshot } from './interfaces/fleet.interface';

@ApiTags('fleet')
@ApiSecurity('api-key')
@ApiUnauthorizedResponse({ description: 'API key ausente o inválida.' })
@ApiTooManyRequestsResponse({ description: 'Se superó el límite de peticiones.' })
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('units')
  @ApiOperation({
    summary: 'Última posición conocida de todas las unidades',
    description:
      'Devuelve el snapshot normalizado de la flota. La API cachea la respuesta ' +
      'del proveedor GPS (CACHE_TTL_MS); usa refresh=true para forzar una consulta ' +
      'respetando POLL_MIN_INTERVAL_MS. Si el proveedor falla se devuelve la ' +
      'última copia con stale=true.',
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: Boolean,
    description: 'Fuerza una consulta al proveedor GPS.',
    example: false,
  })
  @ApiOkResponse({ description: 'Snapshot de la flota.', type: FleetSnapshotDto })
  @ApiServiceUnavailableResponse({
    description: 'No hay cache y el proveedor GPS no responde.',
    type: ServiceUnavailableException,
  })
  @Header('Cache-Control', 'no-store')
  getUnits(@Query('refresh') refresh?: string): Promise<FleetSnapshot> {
    const forceRefresh = refresh === '1' || refresh === 'true';

    return this.fleetService.getFleet(forceRefresh);
  }
}
