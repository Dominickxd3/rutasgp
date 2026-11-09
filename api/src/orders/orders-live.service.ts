import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { liveDetailsQuery, liveHeadersQuery, throughLinkedServer, LiveOrderFilter } from './orders-live.queries';

type Header = Record<string, unknown> & { id_pedido_erp: number };
type Detail = Record<string, unknown> & { id_pedido_erp: number; id_detalle_erp: number };

@Injectable()
export class OrdersLiveService {
  constructor(private readonly database: DatabaseService) {}

  async list(filter: LiveOrderFilter) {
    const startedUtc = new Date().toISOString();
    const pool = await this.database.pool;
    const request = () => pool.request();
    const headers = (await request().query<Header>(throughLinkedServer(liveHeadersQuery(filter)))).recordset;
    const ids = headers.map(row => row.id_pedido_erp);
    const details = ids.length
      ? (await request().query<Detail>(throughLinkedServer(liveDetailsQuery(ids)))).recordset : [];
    const byOrder = new Map<number, Detail[]>();
    for (const row of details) {
      const group = byOrder.get(row.id_pedido_erp) ?? [];
      group.push(row);
      byOrder.set(row.id_pedido_erp, group);
    }
    const items = headers.map(header => ({ ...header,
      details: (byOrder.get(header.id_pedido_erp) ?? []).sort((a,b) => a.id_detalle_erp-b.id_detalle_erp) }));
    return { source: 'ERP_LIVE', consistency: 'MULTIPLE_READS', startedUtc,
      finishedUtc: new Date().toISOString(), items,
      nextCursor: ids.length === 50 ? Math.max(...ids) : null };
  }
}
