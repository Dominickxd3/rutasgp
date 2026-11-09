import { Shipment, ShipmentPage, ShipmentSqlRow, CustomerCategory } from './shipment.types';

const categories: Record<string, CustomerCategory> = {
  '210001': 'DIRECTO', '210003': 'PRINCIPAL', '210002': 'TERCERO',
};
function text(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function dateOnly(value: unknown): string | null {
  const date = text(value);
  return date && /^\d{8}$/.test(date) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : null;
}
function timestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

export function mapShipmentPage(rows: ShipmentSqlRow[], metadata: Record<string, unknown>): ShipmentPage {
  const shipments = new Map<number, Shipment>();
  const lines = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.id_guia_erp)) throw new Error('Guía sin identificador válido.');
    let shipment = shipments.get(row.id_guia_erp);
    const code = text(row.tipo_cliente_codigo);
    if (!shipment) {
      const invoiceNumber = text(row.numero_factura);
      shipment = {
        id: row.id_guia_erp, document: [text(row.serie), text(row.numero)].filter(Boolean).join('-'),
        emissionDate: dateOnly(row.fecha_emision), scheduledDate: dateOnly(row.fecha_programada),
        customer: { id: numeric(row.id_cliente_erp), name: text(row.cliente), code,
          category: code ? categories[code] ?? 'SIN_CLASIFICAR' : 'SIN_CLASIFICAR',
          description: text(row.tipo_cliente),
          salesperson: { code: text(row.codigo_vendedor), name: text(row.vendedor) },
          supervisor: { code: text(row.codigo_supervisor), name: text(row.supervisor) } },
        vehicle: { localId: numeric(row.id_vehiculo_local), providerId: numeric(row.id_unidad_proveedor),
          erpId: numeric(row.id_vehiculo_erp), plate: text(row.placa_gps), erpPlate: text(row.placa_erp),
          match: text(row.estado_vinculo) ?? 'SIN_COINCIDENCIA_GPS',
          active: row.vehiculo_gps_activo === null ? null : numeric(row.vehiculo_gps_activo) === null
            ? null : Boolean(row.vehiculo_gps_activo) },
        status: text(row.estado_guia), cancelled: text(row.anulada), electronicStatus: text(row.estado_envio_fe),
        invoice: invoiceNumber ? `${text(row.serie_factura) ?? ''}-${invoiceNumber}` : null,
        invoiceId: numeric(row.id_factura_encontrada), orders: [], driver: { name: null, secondaryName: null },
        invoiceCompanyMatches: row.empresa_factura_coincide === null ? null
          : numeric(row.empresa_factura_coincide) === null ? null : Boolean(row.empresa_factura_coincide),
        lines: [], declaredKg: null,
      };
      shipments.set(shipment.id, shipment);
    } else if (shipment.customer.id !== numeric(row.id_cliente_erp)
      || shipment.vehicle.localId !== numeric(row.id_vehiculo_local) || shipment.customer.code !== code
      || shipment.customer.salesperson.code !== text(row.codigo_vendedor)
      || shipment.customer.supervisor.code !== text(row.codigo_supervisor)) {
      throw new Error('Cabeceras contradictorias para una misma guía.');
    }
    const id = numeric(row.id_linea_guia_erp);
    if (id !== null) {
      if (lines.has(id)) throw new Error('Una línea logística aparece más de una vez.');
      lines.add(id);
      shipment.lines.push({ id, productId: numeric(row.id_producto_erp), product: text(row.producto),
        quantity: numeric(row.cantidad_original), unit: text(row.unidad_utilizada),
        packages: numeric(row.envases_declarados), declaredKg: numeric(row.kilos_declarados_equivalentes) });
    }
  }
  const items = [...shipments.values()];
  for (const item of items) {
    item.lines.sort((a,b) => a.id-b.id);
    item.declaredKg = item.lines.length && item.lines.every(line => line.declaredKg !== null)
      ? item.lines.reduce((sum,line) => sum + line.declaredKg!, 0) : null;
  }
  if (numeric(metadata.guias_pagina) !== items.length || numeric(metadata.lineas_pagina) !== lines.size) {
    throw new Error('El resultado no coincide con los conteos del procedimiento.');
  }
  return { items, metadata: { source: 'ERP_GUIAS', queriedAt: timestamp(metadata.fin_utc),
    nextCursor: numeric(metadata.siguiente_cursor), guidesOnPage: items.length,
    clientsOnPage: numeric(metadata.clientes_pagina) ?? 0, vehiclesOnPage: numeric(metadata.vehiculos_gps_pagina) ?? 0,
    unmatchedOnPage: numeric(metadata.guias_sin_vinculo_unico) ?? 0 } };
}
