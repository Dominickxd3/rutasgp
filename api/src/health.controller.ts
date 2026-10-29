import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  @ApiOperation({
    summary: 'Healthcheck',
    description: 'No requiere API key. Útil para balanceadores y monitoreo.',
  })
  @ApiOkResponse({
    description: 'El servicio está en línea.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        uptimeSeconds: { type: 'number', example: 120 },
        timestamp: { type: 'string', example: '2026-10-21T17:37:06.000Z' },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
