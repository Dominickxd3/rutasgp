import { BadRequestException, Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { orderCursor, orderRange } from './orders.validation';
import { OrdersLiveService } from './orders-live.service';
import { ShipmentService } from './shipment.service';

@ApiTags('orders')
@ApiSecurity('api-key')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly live: OrdersLiveService,
    private readonly shipments: ShipmentService) {}

  @Get('vehicles')
  @Header('Cache-Control', 'no-store')
  vehicles() { return this.shipments.vehicles(); }

  @Get('shipments')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  shipmentList(@Query('from') from?: string, @Query('to') to?: string,
    @Query('after') after?: string, @Query('vehicleId') vehicle?: string) {
    const range = orderRange(from, to);
    const vehicleId = vehicle === undefined ? undefined : orderCursor(vehicle);
    if (vehicleId === 0) throw new BadRequestException('Vehículo inválido.');
    return this.shipments.list(range.from, range.until, orderCursor(after), vehicleId);
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  liveOrders(@Query('from') from?: string, @Query('to') to?: string, @Query('after') after?: string) {
    const range = orderRange(from, to);
    return this.live.list({ ...range, after: orderCursor(after) });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('from') from?: string, @Query('to') to?: string, @Query('after') after?: string) {
    const range = orderRange(from, to);
    return this.orders.list(range.from, range.until, orderCursor(after));
  }

  @Get('products')
  @Header('Cache-Control', 'no-store')
  products(@Query('id') id?: string) {
    return this.orders.products(orderCursor(id));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 1, ttl: 30_000 } })
  refresh(@Body() body: { from?: string; to?: string } | undefined) {
    const range = orderRange(body?.from, body?.to);
    return this.orders.refresh(range.from, range.until);
  }
}
