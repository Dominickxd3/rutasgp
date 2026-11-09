import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersLiveService } from './orders-live.service';
import { ShipmentService } from './shipment.service';
import { OrderLinksService } from './order-links.service';
import { OrderLinksController } from './order-links.controller';
import { ShipmentDriversService } from './shipment-drivers.service';

@Module({ controllers: [OrdersController, OrderLinksController],
  providers: [OrdersService, OrdersLiveService, ShipmentService, OrderLinksService, ShipmentDriversService] })
export class OrdersModule {}
