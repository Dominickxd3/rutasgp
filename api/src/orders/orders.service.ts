import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { sqlRequest } from '../database/sql-request';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private readonly database: DatabaseService) {}

  async list(from: string, until: string, after: number) {
    const pool = await this.database.pool;
    const result = await pool.request().input('from', sql.Char(8), from)
      .input('until', sql.Char(8), until).input('after', sql.Int, after).query(`
      SELECT TOP(101) empresa,id_pedido_erp,periodo,numero,fecha_pedido_origen,
        id_cliente_erp,cliente,tipo_cliente_codigo,tipo_cliente_descripcion,estado_pedido_origen,presente_ultima_lectura,
        cantidad_detalles,cajas,kilos_pedidos,kilos_atendidos,detalles_sin_kilos_pedidos,
        detalles_sin_pesajes,pesajes_sin_peso,
        fecha_sincronizacion_utc
      FROM dbo.vERP_PedidosResumen
      WHERE empresa='003' AND fecha_pedido_origen>=@from AND fecha_pedido_origen<@until
        AND id_pedido_erp>@after ORDER BY id_pedido_erp;
      SELECT TOP(1) estado,fin_utc,desde,hasta_exclusiva,pedidos
      FROM dbo.Control_Sincronizacion WHERE entidad='PEDIDOS' AND empresa='003'
      ORDER BY id_sincronizacion DESC;`);
    const rows = result.recordsets as unknown as Record<string, unknown>[][];
    const items = rows[0].slice(0, 100);
    return { items, next: rows[0].length > 100 ? items[99].id_pedido_erp : null,
      lastSync: rows[1][0] ?? null };
  }

  async products(id: number) {
    const pool = await this.database.pool;
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT TOP(501) id_detalle_erp,id_producto_erp,descripcion_producto,cajas_origen,
        peso_promedio_origen,kilos_pedidos_origen,kilos_atendidos_origen,
        numero_pesajes,unidad_producto_codigo,detalle_presente_ultima_lectura
      FROM dbo.vERP_PedidosProductos WHERE empresa='003' AND id_pedido_erp=@id
      ORDER BY id_detalle_erp;`);
    return { items: result.recordset.slice(0, 500), truncated: result.recordset.length > 500 };
  }

  async refresh(from: string, until: string) {
    try {
      const pool = await this.database.pool;
      const request = sqlRequest(pool, 120_000).input('Empresa', sql.Char(3), '003')
        .input('Desde', sql.Date, new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`))
        .input('HastaExclusiva', sql.Date, new Date(`${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}T00:00:00Z`))
        .input('TamanoLote', sql.Int, 50).input('MaxPedidos', sql.Int, 2000)
        .input('MaxDuracionSeg', sql.Int, 60);
      const result = await request.execute('dbo.sp_SincronizarPedidosERP');
      const sets = result.recordsets as unknown as Record<string, unknown>[][];
      return { items: sets[0] ?? [], metadata: sets[1]?.[0] ?? null };
    } catch (error) {
      const number = (error as { number?: number }).number;
      if (number === 50108) throw new ConflictException('Ya hay una sincronización en curso. Intente nuevamente.');
      this.logger.error('Falló la consulta de pedidos ERP', error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('No se completó la consulta al ERP. No se modificaron las copias locales.');
    }
  }
}
