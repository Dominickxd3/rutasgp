export interface OrderDocumentLink {
  id: number; orderId: number; number: string | null; orderDetailId: number;
  guideId: number; guideDetailId: number; invoiceId: number | null;
  customerId: number | null; customer: string | null; category: string | null;
  productId: number | null; evidence: string; reviewer: string | null;
  validatedAt: Date | null; present: boolean; orderStatus: string | null;
  status: 'CONFIRMADO' | 'REQUIERE_REVISION';
}
export interface LinkCandidate {
  orderId: number; number: string | null; detailId: number; date: string | null;
  customerId: number | null; customer: string | null; category: string | null;
  productId: number | null; product: string | null; boxes: number | null;
  requestedKg: number | null; attendedKg: number | null;
}
export interface ConfirmOrderLink {
  orderId: number; detailId: number; guideDetailId: number;
  evidence: string; reviewer: string; acceptDifferentCustomer: boolean;
}
