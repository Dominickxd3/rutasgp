import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mapShipmentPage } from './shipment.mapper';
import type { ShipmentSqlRow } from './shipment.types';

const row: ShipmentSqlRow = { id_guia_erp: 10, serie: 'T003 ', numero: '00000001',
  fecha_emision: '20261106', id_cliente_erp: 20, cliente: 'Cliente anónimo',
  tipo_cliente_codigo: '210001', id_vehiculo_local: 1, id_unidad_proveedor: 1085,
  placa_gps: 'A4V-941', estado_vinculo: 'COINCIDENCIA_EXACTA', vehiculo_gps_activo: 1,
  id_linea_guia_erp: 100, id_producto_erp: 30, cantidad_original: 0,
  unidad_utilizada: 'KGS', kilos_declarados_equivalentes: 0 };
const metadata = { fuente: 'ERP_GUIAS', guias_pagina: 1, lineas_pagina: 1,
  clientes_pagina: 1, vehiculos_gps_pagina: 1, guias_sin_vinculo_unico: 0, fin_utc: new Date('2026-11-06T17:00:00Z') };

test('directo, principal y tercero se resuelven por codigo ERP, no por descripcion', () => {
  for (const [code,category] of [['210001','DIRECTO'],['210003','PRINCIPAL'],['210002','TERCERO']]) {
    assert.equal(mapShipmentPage([{...row,tipo_cliente_codigo:code}],metadata).items[0].customer.category,category);
  }
  assert.equal(mapShipmentPage([{...row,tipo_cliente_codigo:'999999',tipo_cliente:'Cliente DIRECTO'}],metadata)
    .items[0].customer.category,'SIN_CLASIFICAR');
});
test('una guia con dos productos sigue siendo un documento, y NULL no se convierte en cero', () => {
  const result=mapShipmentPage([row,{...row,id_linea_guia_erp:101,kilos_declarados_equivalentes:null,cantidad_original:null}],
    {...metadata,lineas_pagina:2});
  assert.equal(result.items.length,1);assert.equal(result.items[0].lines.length,2);
  assert.equal(result.items[0].lines[0].quantity,0);
  assert.equal(result.items[0].lines[1].quantity,null);
  assert.equal(result.items[0].declaredKg,null);
  assert.equal(result.metadata.queriedAt,'2026-11-06T17:00:00.000Z');
});
test('lineas repetidas y cabeceras contradictorias rechazan un resultado inconsistente', () => {
  assert.throws(()=>mapShipmentPage([row,row],{...metadata,lineas_pagina:2}));
  assert.throws(()=>mapShipmentPage([row,{...row,id_linea_guia_erp:101,id_cliente_erp:999}],{...metadata,lineas_pagina:2}));
  assert.throws(()=>mapShipmentPage([row],{...metadata,guias_pagina:2}));
});
test('un vinculo GPS ambiguo no recibe un identificador local artificial', () => {
  const result=mapShipmentPage([{...row,id_vehiculo_local:null,id_unidad_proveedor:null,placa_gps:null,
    estado_vinculo:'PLACA_GPS_AMBIGUA'}],{...metadata,vehiculos_gps_pagina:0,guias_sin_vinculo_unico:1});
  assert.equal(result.items[0].vehicle.localId,null);
  assert.equal(result.items[0].vehicle.match,'PLACA_GPS_AMBIGUA');
});
test('rango vacio y guia sin detalle conservan sus conteos reales', () => {
  assert.deepEqual(mapShipmentPage([],{...metadata,guias_pagina:0,lineas_pagina:0}).items,[]);
  const result=mapShipmentPage([{...row,id_linea_guia_erp:null}],{...metadata,lineas_pagina:0});
  assert.equal(result.items.length,1);assert.deepEqual(result.items[0].lines,[]);
  assert.equal(result.items[0].declaredKg,null);
});

test('conserva vendedor y supervisor del cliente, incluidos codigos sin descripcion', () => {
  const result = mapShipmentPage([{ ...row, codigo_vendedor: '044', vendedor: 'CARTERA A ',
    codigo_supervisor: 'S66', supervisor: 'SUPERVISOR A ' }], metadata);
  assert.deepEqual(result.items[0].customer.salesperson, { code: '044', name: 'CARTERA A' });
  assert.deepEqual(result.items[0].customer.supervisor, { code: 'S66', name: 'SUPERVISOR A' });
  const missing = mapShipmentPage([{ ...row, codigo_vendedor: '099', vendedor: null }], metadata);
  assert.deepEqual(missing.items[0].customer.salesperson, { code: '099', name: null });
  assert.deepEqual(missing.items[0].customer.supervisor, { code: null, name: null });
});
