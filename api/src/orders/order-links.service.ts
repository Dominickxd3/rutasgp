import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { sqlRequest } from '../database/sql-request';
import { Shipment } from './shipment.types';
import { ConfirmOrderLink, LinkCandidate, OrderDocumentLink } from './order-links.types';
import { CANDIDATES, CONFIRM_LINK, LINK_COLUMNS, LINK_JOINS } from './order-links.queries';
import { linkIsCurrent } from './order-links.validation';

@Injectable()
export class OrderLinksService {
  constructor(private readonly database: DatabaseService) {}

  async attach(items: Shipment[]): Promise<void> {
    if (!items.length) return;
    const request = sqlRequest(await this.database.pool, 15_000);
    const parameters = items.map((item, index) => {
      request.input(`guide${index}`, sql.Int, item.id);
      return `@guide${index}`;
    });
    const result = await request.query<OrderDocumentLink>(`SELECT ${LINK_COLUMNS} ${LINK_JOINS}
      WHERE v.empresa='003' AND v.estado='CONFIRMADO'
      AND v.id_guia_erp IN (${parameters.join(',')}) ORDER BY v.id_vinculo;`);
    for (const item of items) {
      item.orders = result.recordset.filter(link => link.guideId === item.id).map(link => ({
        ...link, status: linkIsCurrent(link, item) ? 'CONFIRMADO' : 'REQUIERE_REVISION',
      }));
    }
  }

  async candidates(shipment: Shipment, orderId: number | null) {
    const products = [...new Set(shipment.lines.map(line => line.productId).filter(id => id !== null))];
    if (!products.length) return { items: [], truncated: false };
    if (products.length > 1000) throw new BadRequestException('La guía excede el límite de productos de esta consulta.');
    const request = sqlRequest(await this.database.pool, 15_000)
      .input('orderId', sql.Int, orderId).input('date', sql.Char(8), shipment.emissionDate?.replaceAll('-', '') ?? '')
      .input('customer', sql.Int, shipment.customer.id);
    const parameters = products.map((id, index) => {
      request.input(`product${index}`, sql.Int, id);
      return `@product${index}`;
    });
    const result = await request.query<LinkCandidate>(CANDIDATES.replace('PRODUCT_PARAMETERS', parameters.join(',')));
    return { items: result.recordset.slice(0, 100), truncated: result.recordset.length > 100 };
  }

  async confirm(shipment: Shipment, body: ConfirmOrderLink) {
    const line = shipment.lines.find(item => item.id === body.guideDetailId);
    if (!line?.productId) throw new BadRequestException('El detalle no pertenece a esta guía o carece de producto.');
    if (shipment.cancelled !== '0' || shipment.invoiceCompanyMatches === false) {
      throw new BadRequestException('Revise la anulación o la empresa de la guía y factura.');
    }
    const pool = await this.database.pool;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = new sql.Request(transaction).input('order', sql.Int, body.orderId)
        .input('detail', sql.Int, body.detailId).input('guide', sql.Int, shipment.id)
        .input('guideDetail', sql.Int, body.guideDetailId).input('invoice', sql.Int, shipment.invoiceId)
        .input('product', sql.Int, line.productId).input('customer', sql.Int, shipment.customer.id)
        .input('different', sql.Bit, body.acceptDifferentCustomer).input('evidence', sql.NVarChar(2000), body.evidence)
        .input('reviewer', sql.NVarChar(128), body.reviewer);
      const result = await request.query<{ id: string }>(CONFIRM_LINK);
      await transaction.commit();
      return result.recordset[0];
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      const number = (error as { number?: number }).number;
      if (number === 50241) throw new BadRequestException('Pedido, producto o cliente no válido. Revise la selección.');
      if ([50240, 50242, 2601, 2627].includes(number ?? 0)) throw new ConflictException('El vínculo cambió o ya existe. Actualice la consulta.');
      throw error;
    }
  }

  async revoke(guideId: number, id: number, evidence: string, reviewer: string) {
    const result = await sqlRequest(await this.database.pool, 15_000)
      .input('guide', sql.Int, guideId).input('id', sql.BigInt, id)
      .input('evidence', sql.NVarChar(2000), evidence).input('reviewer', sql.NVarChar(128), reviewer)
      .query(`UPDATE dbo.Distribucion_PedidoDocumento SET estado='REVOCADO',evidencia=@evidence,
        usuario_validacion=@reviewer,fecha_validacion_utc=SYSUTCDATETIME()
        WHERE empresa='003' AND id_guia_erp=@guide AND id_vinculo=@id AND estado='CONFIRMADO';`);
    if (result.rowsAffected[0] !== 1) throw new ConflictException('El vínculo ya cambió. Actualice la consulta.');
    return { revoked: true };
  }
}
