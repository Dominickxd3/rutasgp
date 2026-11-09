import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderLinksService } from './order-links.service';
import { ShipmentService } from './shipment.service';
import { orderCursor } from './orders.validation';
import { confirmation, positiveId, reviewEvidence } from './order-links.validation';

@ApiTags('orders')
@ApiSecurity('api-key')
@Controller('orders/order-links')
export class OrderLinksController {
  constructor(private readonly links: OrderLinksService, private readonly shipments: ShipmentService) {}

  @Get(':guideId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async candidates(@Param('guideId') guide: string, @Query('orderId') order?: string) {
    const shipment = await this.shipments.one(positiveId(orderCursor(guide)));
    return { ...await this.links.candidates(shipment, order === undefined ? null : positiveId(orderCursor(order))),
      links: shipment.orders };
  }

  @Post(':guideId')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirm(@Param('guideId') guide: string, @Body() value: unknown) {
    const body = confirmation(value);
    const shipment = await this.shipments.one(positiveId(orderCursor(guide)));
    const result = await this.links.confirm(shipment, body);
    this.shipments.invalidateLinks();
    return result;
  }

  @Post(':guideId/:linkId/revoke')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async revoke(@Param('guideId') guide: string, @Param('linkId') link: string, @Body() value: unknown) {
    const body = reviewEvidence(value);
    const result = await this.links.revoke(positiveId(orderCursor(guide)), positiveId(orderCursor(link)), body.evidence, body.reviewer);
    this.shipments.invalidateLinks();
    return result;
  }
}
