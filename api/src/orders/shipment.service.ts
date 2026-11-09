import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { sqlRequest } from '../database/sql-request';
import { mapShipmentPage } from './shipment.mapper';
import { LocalOrderVehicle, ShipmentPage, ShipmentSqlRow } from './shipment.types';
import { OrderLinksService } from './order-links.service';
import { ShipmentDriversService } from './shipment-drivers.service';

function sqlDate(value: string): Date {
  return new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00Z`);
}

@Injectable()
export class ShipmentService {
  private readonly logger = new Logger(ShipmentService.name);
  private readonly pending = new Map<string, Promise<ShipmentPage>>();
  private linksRevision = 0;
  constructor(private readonly database: DatabaseService, private readonly links: OrderLinksService,
    private readonly drivers: ShipmentDriversService) {}

  invalidateLinks() { this.linksRevision += 1; }

  async one(id: number) {
    const result = await sqlRequest(await this.database.pool, 30_000)
      .input('Empresa', sql.Char(3), '003').input('GuiaId', sql.Int, id)
      .execute('dbo.sp_ConsultarGuiasVehiculosERP');
    const sets = result.recordsets as unknown as Record<string, unknown>[][];
    const page = mapShipmentPage(sets[0] as ShipmentSqlRow[], sets[1][0]);
    const shipment = page.items[0];
    if (!shipment) throw new NotFoundException('Guía no disponible para la empresa.');
    await Promise.all([this.links.attach(page.items), this.drivers.attach(page.items)]);
    return shipment;
  }

  async vehicles(): Promise<LocalOrderVehicle[]> {
    const pool = await this.database.pool;
    const result = await pool.request().query<LocalOrderVehicle>(`SELECT id_vehiculo AS id,
      id_unidad_proveedor AS providerId,placa AS plate,activo AS active FROM dbo.Vehiculos ORDER BY placa;`);
    return result.recordset;
  }

  list(from: string, until: string, after: number, vehicle?: number): Promise<ShipmentPage> {
    const key = `${from}:${until}:${after}:${vehicle ?? ''}:${this.linksRevision}`;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = this.read(from, until, after, vehicle).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async read(from: string, until: string, after: number, vehicle?: number): Promise<ShipmentPage> {
    try {
      const pool = await this.database.pool;
      const request = sqlRequest(pool, 30_000).input('Empresa', sql.Char(3), '003')
        .input('Desde', sql.Date, sqlDate(from)).input('HastaExclusiva', sql.Date, sqlDate(until))
        .input('TamanoPagina', sql.Int, 50).input('UltimaGuiaId', sql.Int, after);
      if (vehicle !== undefined) request.input('IdVehiculoLocal', sql.Int, vehicle);
      const result = await request.execute('dbo.sp_ConsultarGuiasVehiculosERP');
      const sets = result.recordsets as unknown as Record<string, unknown>[][];
      if (!sets[1]?.[0] || sets[1][0].fuente !== 'ERP_GUIAS') throw new Error('Contrato de guías no reconocido.');
      const page = mapShipmentPage(sets[0] as ShipmentSqlRow[], sets[1][0]);
      await Promise.all([this.links.attach(page.items), this.drivers.attach(page.items)]);
      return page;
    } catch (error) {
      if ([50809,50810].includes((error as {number?:number}).number ?? 0)) {
        throw new BadRequestException('La placa del vehículo no puede resolverse de forma única.');
      }
      this.logger.error('No se pudieron consultar guías ERP', error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('No se pudieron consultar los documentos del ERP. Intente nuevamente.');
    }
  }
}
