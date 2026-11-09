import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { sqlRequest } from '../database/sql-request';
import type { Shipment } from './shipment.types';

interface DriverRow {
  id_nota: number; id_vehiculo: number | null; st_anulado: string | null;
  chofer: string | null; chofer_secundario: string | null;
}

@Injectable()
export class ShipmentDriversService {
  constructor(private readonly database: DatabaseService) {}

  async attach(items: Shipment[]): Promise<void> {
    if (!items.length) return;
    const ids = [...new Set(items.map(item => item.id))];
    if (ids.length > 100 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647)) {
      throw new Error('Identificadores de guías inválidos para consultar conductores.');
    }
    const result = await sqlRequest(await this.database.pool, 15_000).query<DriverRow>(`
      SELECT id_nota,id_vehiculo,st_anulado,chofer,chofer_secundario
      FROM OPENQUERY([10.10.1.3,1433],'
        SELECT id_nota,id_vehiculo,st_anulado,RTRIM(veh_Chofer) chofer,
          RTRIM(veh_Chofer2) chofer_secundario
        FROM dbGP_2024_GP.dbo.LO001030 WHERE id_nota IN (${ids.join(',')})');`);
    const rows = new Map(result.recordset.map(row => [row.id_nota, row]));
    for (const shipment of items) {
      const row = rows.get(shipment.id);
      if (!row || row.id_vehiculo !== shipment.vehicle.erpId || row.st_anulado?.trim() !== shipment.cancelled) {
        throw new Error('El documento cambió durante la consulta del conductor. Actualice la consulta.');
      }
      shipment.driver = { name: row.chofer?.trim() || null, secondaryName: row.chofer_secundario?.trim() || null };
    }
  }
}
