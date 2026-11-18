import { BadRequestException, Body, Controller, Get, Header, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { verifyMobileToken } from '../common/auth/mobile-token';
import { MobileDeviceService } from './mobile-device.service';
import { parseDeviceId, parseMobileEventBatch, parseVehicleAssignment } from './mobile-device.validation';

@ApiTags('mobile')
@ApiSecurity('api-key')
@Controller('mobile')
export class MobileDeviceController {
  constructor(
    private readonly devices: MobileDeviceService,
    private readonly config: ConfigService,
  ) {}

  /** Usuario del token móvil, comprobando que el celular sea el mismo del login. */
  private session(authorization: string | undefined, deviceId: string): string | null {
    const [scheme, token] = (authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    const payload = verifyMobileToken(token.trim(), this.config.get<string>('auth.secret', ''));
    if (!payload) return null;
    if (payload.deviceId && payload.deviceId !== deviceId) {
      // 400 y no 401/403: la app cierra sesión ante 401/403.
      throw new BadRequestException('El celular no coincide con el de la sesión.');
    }
    return payload.sub;
  }

  @Get('device/config')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Camión asignado y geocercas para un celular GPSCamiones' })
  deviceConfig(
    @Query('deviceId') deviceId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-device-model') model: string | undefined,
  ) {
    const id = parseDeviceId(deviceId);
    const username = this.session(authorization, id);
    const cleanModel = typeof model === 'string' && model.trim() ? model.trim().slice(0, 120) : null;
    return this.devices.config(id, username, cleanModel);
  }

  @Post('events/batch')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recibir un lote idempotente de eventos de paradas y geocercas del celular' })
  events(@Body() body: unknown, @Headers('authorization') authorization: string | undefined) {
    const batch = parseMobileEventBatch(body);
    this.session(authorization, batch.deviceId);
    return this.devices.ingestEvents(batch);
  }

  @Get('devices')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Celulares registrados y su camión asignado' })
  list() {
    return this.devices.list();
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recorrido de los celulares, el de su camión asignado y la comparación' })
  live(
    @Query('from') fromValue?: string,
    @Query('to') toValue?: string,
    @Query('deviceId') deviceId?: string,
    @Query('vehicleId') vehicleValue?: string,
  ) {
    // vehicleId: número = comparar con ese camión; "none" = solo el celular
    let compareVehicleId: number | null | undefined;
    if (vehicleValue !== undefined && vehicleValue !== '') {
      if (vehicleValue === 'none') compareVehicleId = null;
      else {
        compareVehicleId = Number(vehicleValue);
        if (!Number.isSafeInteger(compareVehicleId) || compareVehicleId < 1) {
          throw new BadRequestException('vehicleId debe ser un entero positivo o "none".');
        }
      }
    }
    const options = {
      deviceId: deviceId ? parseDeviceId(deviceId) : undefined,
      compareVehicleId,
    };
    const to = toValue ? new Date(toValue) : new Date();
    // Por defecto: desde las 00:00 de hoy en Lima (UTC-5)
    const limaMidnight = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 5));
    const from = fromValue
      ? new Date(fromValue)
      : limaMidnight.getTime() > to.getTime() ? new Date(limaMidnight.getTime() - 86_400_000) : limaMidnight;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BadRequestException('Rango de fechas inválido.');
    }
    if (to.getTime() - from.getTime() > 3 * 86_400_000) {
      throw new BadRequestException('El rango máximo es de 3 días.');
    }
    return this.devices.live(from, to, options);
  }

  @Put('devices/:deviceId/vehicle')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Asignar o quitar el camión de un celular' })
  assign(@Param('deviceId') deviceId: string, @Body() body: unknown) {
    const { vehicleId, assignedBy } = parseVehicleAssignment(body);
    return this.devices.assignVehicle(parseDeviceId(deviceId), vehicleId, assignedBy);
  }
}
