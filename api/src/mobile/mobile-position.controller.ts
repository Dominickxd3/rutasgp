import { Body, Controller, Header, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { MobilePositionService } from './mobile-position.service';
import { parseMobilePositionBatch } from './mobile-position.validation';

@ApiTags('mobile')
@ApiSecurity('api-key')
@Controller('mobile/positions')
export class MobilePositionController {
  constructor(private readonly positions: MobilePositionService) {}

  @Post('batch')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recibir un lote idempotente de posiciones desde GPSCamiones' })
  ingest(@Body() body: unknown) {
    return this.positions.ingest(parseMobilePositionBatch(body));
  }
}
