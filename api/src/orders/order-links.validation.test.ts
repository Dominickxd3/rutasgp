import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { confirmation, linkIsCurrent, positiveId, reviewEvidence } from './order-links.validation';
import type { OrderDocumentLink } from './order-links.types';
import type { Shipment } from './shipment.types';

test('la confirmacion exige identificadores enteros y evidencia con responsable', () => {
  const input = { orderId: 1, detailId: 2, guideDetailId: 3, evidence: ' documento ', reviewer: ' responsable ' };
  assert.equal(confirmation(input).evidence, 'documento');
  assert.equal(confirmation(input).acceptDifferentCustomer, false);
  for (const id of [null, undefined, 0, -1, 1.5, '1', 2147483648, NaN]) assert.throws(() => positiveId(id));
  for (const body of [null, {}, { ...input, evidence: ' ' }, { ...input, reviewer: '' },
    { ...input, evidence: 'x'.repeat(2001) }, { ...input, reviewer: 'x'.repeat(129) }]) {
    assert.throws(() => confirmation(body));
  }
  assert.equal(confirmation({ ...input, acceptDifferentCustomer: 'true' }).acceptDifferentCustomer, false);
  assert.equal(confirmation({ ...input, acceptDifferentCustomer: true }).acceptDifferentCustomer, true);
  assert.deepEqual(reviewEvidence(input), { evidence: 'documento', reviewer: 'responsable' });
});

test('un vinculo se revisa si cambia la factura, el producto, la presencia o la anulacion', () => {
  const link = { present: true, orderStatus: '0', invoiceId: 4, guideDetailId: 3, productId: 8 } as OrderDocumentLink;
  const shipment = { invoiceId: 4, cancelled: '0', invoiceCompanyMatches: true,
    lines: [{ id: 3, productId: 8 }] } as Shipment;
  assert.equal(linkIsCurrent(link, shipment), true);
  assert.equal(linkIsCurrent({ ...link, present: false }, shipment), false);
  assert.equal(linkIsCurrent({ ...link, orderStatus: '1' }, shipment), false);
  for (const changed of [{ invoiceId: 9 }, { cancelled: '1' }, { invoiceCompanyMatches: false },
    { lines: [] }, { lines: [{ id: 3, productId: 9 }] }]) {
    assert.equal(linkIsCurrent(link, { ...shipment, ...changed } as Shipment), false);
  }
});
