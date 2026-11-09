import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { CustomerTypeTag } from './CustomerTypeTag';
import { displayCommercialAssignment, displayDate, displayNumber } from '../utils/shipment.utils';
import type { Shipment, ShipmentLine } from '../types/shipment.types';
import { OrderLinkEditor } from './OrderLinkEditor';

export function ShipmentDetailsDialog({ shipment, onHide, onChanged }: {
  shipment: Shipment | null; onHide: () => void; onChanged: () => void;
}) {
  const numbers = [...new Set(shipment?.orders.filter(order => order.status === 'CONFIRMADO')
    .map(order => order.number ?? String(order.orderId)) ?? [])];
  return (
    <Dialog visible={shipment !== null} onHide={onHide} header="Detalle del reparto"
      className="shipment-details" style={{ width: 'min(900px, 95vw)' }} modal draggable={false}>
      {shipment && <>
        <div className="shipment-details__customer">
          <div><span>Cliente destinatario</span><h2>{shipment.customer.name ?? 'Sin nombre disponible'}</h2></div>
          <CustomerTypeTag category={shipment.customer.category} />
        </div>
        <section className="shipment-details__documents" aria-label="Documentos relacionados">
          <article className={`shipment-document ${numbers.length ? '' : 'shipment-document--pending'}`}>
            <span className="shipment-document__icon"><i className="pi pi-shopping-cart" aria-hidden="true" /></span>
            <span className="shipment-document__label">Pedido comercial</span>
            <strong>{numbers.length ? numbers.join(' · ') : 'Pendiente de vincular'}</strong>
            <small>{numbers.length ? 'Vinculación local validada' : 'Seleccione y valide el pedido en esta pantalla'}</small>
          </article>
          <article className="shipment-document">
            <span className="shipment-document__icon"><i className="pi pi-receipt" aria-hidden="true" /></span>
            <span className="shipment-document__label">Factura relacionada</span>
            <strong>{shipment.invoice ?? 'Sin referencia disponible'}</strong>
            <small>{shipment.invoiceCompanyMatches === false ? 'Empresa diferente, requiere revisión' : 'Referencia documental del ERP'}</small>
          </article>
          <article className="shipment-document">
            <span className="shipment-document__icon"><i className="pi pi-file" aria-hidden="true" /></span>
            <span className="shipment-document__label">Guía de remisión</span>
            <strong>{shipment.document}</strong>
            <small>Emisión {displayDate(shipment.emissionDate)}</small>
          </article>
        </section>
        <div className="shipment-details__summary">
          <div><small>Camión</small><strong>{shipment.vehicle.plate ?? shipment.vehicle.erpPlate ?? 'Sin placa'}</strong></div>
          <div><small>Chofer registrado en la guía</small><strong>{shipment.driver.name ?? 'Sin chofer registrado'}</strong></div>
          {shipment.driver.secondaryName && <div><small>Chofer del segundo vehículo</small><strong>{shipment.driver.secondaryName}</strong></div>}
          <div><small>Fecha programada</small><strong>{displayDate(shipment.scheduledDate)}</strong></div>
          <div><small>Vendedor / cartera del cliente</small><strong>{displayCommercialAssignment(shipment.customer.salesperson)}</strong></div>
          <div><small>Supervisor del cliente</small><strong>{displayCommercialAssignment(shipment.customer.supervisor)}</strong></div>
        </div>
        <h3 className="shipment-details__section-title">Productos declarados</h3>
        <DataTable value={shipment.lines} dataKey="id" size="small" stripedRows scrollable
          emptyMessage="La guía no contiene líneas disponibles." tableStyle={{ minWidth: '620px' }}>
          <Column field="product" header="Producto" body={(line: ShipmentLine) => line.product ?? 'Sin descripción'} />
          <Column header="Cantidad" body={(line: ShipmentLine) => displayNumber(line.quantity)} />
          <Column header="Unidad" body={(line: ShipmentLine) => line.unit ?? 'Sin unidad'} />
          <Column header="Envases" body={(line: ShipmentLine) => displayNumber(line.packages)} />
          <Column header="Kg declarados" body={(line: ShipmentLine) => displayNumber(line.declaredKg)} />
        </DataTable>
        <p className="shipment-details__note">Cantidad y unidad originales de la guía. «—» indica dato no disponible, no cero.</p>
        <p className="shipment-details__note">Vínculo documental con el camión; no confirma carga física ni entrega.</p>
        <OrderLinkEditor key={shipment.id} shipment={shipment} onChanged={onChanged} />
      </>}
    </Dialog>
  );
}
