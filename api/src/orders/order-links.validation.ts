import { BadRequestException } from '@nestjs/common';
import { ConfirmOrderLink, OrderDocumentLink } from './order-links.types';
import { Shipment } from './shipment.types';

export function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new BadRequestException('Identificador inválido.');
  }
  return value;
}

export function reviewEvidence(value: unknown): { evidence: string; reviewer: string } {
  if (!value || typeof value !== 'object') throw new BadRequestException('Falta la confirmación.');
  const body = value as Record<string, unknown>;
  const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
  const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
  if (!evidence || evidence.length > 2000 || !reviewer || reviewer.length > 128) {
    throw new BadRequestException('Indique evidencia (hasta 2000 caracteres) y responsable (hasta 128).');
  }
  return { evidence, reviewer };
}

export function confirmation(value: unknown): ConfirmOrderLink {
  const review = reviewEvidence(value);
  const body = value as Record<string, unknown>;
  return { orderId: positiveId(body.orderId), detailId: positiveId(body.detailId),
    guideDetailId: positiveId(body.guideDetailId), ...review,
    acceptDifferentCustomer: body.acceptDifferentCustomer === true };
}

export function linkIsCurrent(link: OrderDocumentLink, shipment: Shipment): boolean {
  return Boolean(link.present) && link.orderStatus?.trim() === '0'
    && link.invoiceId === shipment.invoiceId && shipment.cancelled === '0'
    && shipment.invoiceCompanyMatches !== false
    && shipment.lines.some(line => line.id === link.guideDetailId && line.productId === link.productId);
}
