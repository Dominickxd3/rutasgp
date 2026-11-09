import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { displayNumber, groupByTruck, limaToday } from './shipment.utils';
import type { Shipment } from '../types/shipment.types';

function fixture(id: number, customer: number, localId: number | null, erpId: number): Shipment {
  return { id, customer: {id:customer}, vehicle:{localId,erpId,erpPlate:'ABC123',plate:null,match:localId?'COINCIDENCIA_EXACTA':'SIN_COINCIDENCIA_GPS'} } as Shipment;
}
test('conteos por camion no duplican clientes de multiples guias', () => {
  const groups=groupByTruck([fixture(1,20,1,68562),fixture(2,20,1,68562),fixture(3,21,1,68562)]);
  assert.equal(groups.length,1);assert.equal(groups[0].items.length,3);assert.equal(groups[0].clients,2);
});
test('no agrupa vehiculos ERP distintos por compartir una placa no resuelta', () => {
  assert.equal(groupByTruck([fixture(1,20,null,1),fixture(2,20,null,2)]).length,2);
});
test('fecha de Lima respeta el cambio de dia UTC; cero y ausente se distinguen', () => {
  assert.equal(limaToday(new Date('2026-11-07T02:00:00Z')),'2026-11-06');
  assert.equal(displayNumber(0),'0');assert.equal(displayNumber(null),'—');
});
