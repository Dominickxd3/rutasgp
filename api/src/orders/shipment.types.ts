import { OrderDocumentLink } from './order-links.types';
export type CustomerCategory = 'DIRECTO' | 'PRINCIPAL' | 'TERCERO' | 'SIN_CLASIFICAR';
export interface ShipmentLine {
  id: number; productId: number | null; product: string | null;
  quantity: number | null; unit: string | null; packages: number | null; declaredKg: number | null;
}
export interface Shipment {
  id: number; document: string; emissionDate: string | null; scheduledDate: string | null;
  customer: { id: number | null; name: string | null; code: string | null;
    category: CustomerCategory; description: string | null;
    salesperson: { code: string | null; name: string | null };
    supervisor: { code: string | null; name: string | null } };
  vehicle: { localId: number | null; providerId: number | null; erpId: number | null;
    plate: string | null; erpPlate: string | null; match: string; active: boolean | null };
  status: string | null; cancelled: string | null; electronicStatus: string | null;
  invoice: string | null; invoiceId: number | null; invoiceCompanyMatches: boolean | null;
  orders: OrderDocumentLink[];
  driver: { name: string | null; secondaryName: string | null };
  lines: ShipmentLine[]; declaredKg: number | null;
}
export interface ShipmentMetadata {
  source: 'ERP_GUIAS'; queriedAt: string | null; nextCursor: number | null;
  guidesOnPage: number; clientsOnPage: number; vehiclesOnPage: number; unmatchedOnPage: number;
}
export interface ShipmentPage { items: Shipment[]; metadata: ShipmentMetadata }
export interface LocalOrderVehicle { id: number; providerId: number; plate: string; active: boolean }
export type ShipmentSqlRow = Record<string, unknown> & { id_guia_erp: number };
