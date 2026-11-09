import { Button } from 'primereact/button';
import type { Shipment } from '../types/shipment.types';
import { displayCommercialAssignment, displayNumber } from '../utils/shipment.utils';
import { CustomerTypeTag } from './CustomerTypeTag';

export function ShipmentCard({ shipment, onOpen }: { shipment: Shipment; onOpen: () => void }) {
  const numbers = [...new Set(shipment.orders.filter(order => order.status === 'CONFIRMADO')
    .map(order => order.number ?? String(order.orderId)))];
  return (
    <article className="shipment-card">
      <header>
        <div className="shipment-card__identity">
          <span className="shipment-card__eyebrow">Pedido comercial</span>
          <strong className={numbers.length ? '' : 'shipment-card__pending'}><i className="pi pi-link" aria-hidden="true" />
            {numbers.length ? ` ${numbers.join(' · ')}` : ' Por vincular'}</strong>
        </div>
        <CustomerTypeTag category={shipment.customer.category} />
      </header>
      <h3>{shipment.customer.name ?? 'Cliente sin nombre en el maestro'}</h3>
      <p className="orders-page-note">Chofer en guía · {shipment.driver.name ?? 'Sin registrar'}</p>
      <p className="orders-page-note">Guía {shipment.document} · Factura {shipment.invoice ?? 'Sin referencia'}</p>
      {shipment.orders.some(order => order.status === 'REQUIERE_REVISION') && <p className="orders-warning">Hay vínculos que requieren revisión.</p>}
      <dl className="shipment-card__commercial">
        <div><dt>Vendedor / cartera</dt><dd>{displayCommercialAssignment(shipment.customer.salesperson)}</dd></div>
        <div><dt>Supervisor</dt><dd>{displayCommercialAssignment(shipment.customer.supervisor)}</dd></div>
      </dl>
      <p className="shipment-card__products">{shipment.lines.slice(0,2).map(line => line.product ?? 'Producto sin descripción').join(' · ')}
        {shipment.lines.length > 2 && ` · +${shipment.lines.length-2} más`}
        {!shipment.lines.length && 'Sin líneas de producto disponibles'}</p>
      {shipment.invoiceCompanyMatches === false && <p className="orders-warning">Empresa de factura diferente: requiere revisión.</p>}
      <footer><span>{shipment.lines.length} {shipment.lines.length === 1 ? 'línea' : 'líneas'}
        <strong>{shipment.declaredKg === null ? 'Peso no determinado' : `${displayNumber(shipment.declaredKg)} kg declarados`}</strong></span>
        <Button label="Ver detalle" icon="pi pi-angle-right" iconPos="right" text size="small" onClick={onOpen}
          aria-label={`Ver productos, factura y guía ${shipment.document}`} /></footer>
    </article>
  );
}
