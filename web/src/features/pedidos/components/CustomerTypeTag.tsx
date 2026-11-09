import { Tag } from 'primereact/tag';
import type { CustomerCategory } from '../types/shipment.types';

const labels = { DIRECTO: 'Directo', PRINCIPAL: 'Principal', TERCERO: 'Tercero', SIN_CLASIFICAR: 'Sin clasificar' };
const severity = { DIRECTO: 'success', PRINCIPAL: 'info', TERCERO: 'warning', SIN_CLASIFICAR: 'secondary' } as const;
export function CustomerTypeTag({ category }: { category: CustomerCategory }) {
  return <Tag value={labels[category]} severity={severity[category]} />;
}
