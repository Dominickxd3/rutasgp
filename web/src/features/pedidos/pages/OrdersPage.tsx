import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { SelectButton } from 'primereact/selectbutton';
import { useAppState } from '../../../context/AppStateContext';
import { useShipmentOrders } from '../hooks/useShipmentOrders';
import { CUSTOMER_CATEGORIES, POLLING_OPTIONS } from '../config/orders.config';
import { displayDate, displayTime, groupByTruck, limaToday } from '../utils/shipment.utils';
import { ShipmentCard } from '../components/ShipmentCard';
import { LocalOrdersPanel } from '../components/LocalOrdersPanel';
import type { ShipmentVehicleGroup } from '../types/shipment.types';
import '../styles/orders.scss';

const ShipmentDetailsDialog = lazy(() => import('../components/ShipmentDetailsDialog')
  .then(module => ({ default: module.ShipmentDetailsDialog })));

export function OrdersPage() {
  const [view, setView] = useState('shipments');
  const [date, setDate] = useState(limaToday);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [category, setCategory] = useState('ALL');
  const [polling, setPolling] = useState(30_000);
  const [selection, setSelection] = useState<{ key: string; id: number } | null>(null);
  const orders = useShipmentOrders(view === 'shipments' ? date : '', vehicleId, polling);
  const { units, focusUnit } = useAppState();
  const selectionKey = `${date}:${vehicleId}:${orders.page}`;
  const items = orders.data?.items ?? [];
  const selectedShipment = selection?.key === selectionKey ? items.find(item => item.id === selection.id) ?? null : null;
  const visibleItems = items.filter(item => category === 'ALL' || item.customer.category === category);
  const groups = useMemo(() => groupByTruck(visibleItems), [orders.data, category]);
  const options = [{ id: null, plate: 'Todos los camiones' }, ...orders.vehicles];
  function currentUnit(group: ShipmentVehicleGroup) {
    const matches = units.filter(unit => group.vehicle.providerId !== null && unit.idUnidad === String(group.vehicle.providerId));
    return matches.length === 1 ? matches[0] : undefined;
  }
  return (
    <section className="fleet-panel orders-panel" aria-label="Pedidos por camión">
      <header className="fleet-panel__head">
        <div className="orders-heading"><div><p className="orders-eyebrow">Distribución</p><h1>Pedidos</h1></div>
          <Tag value={view === 'local' ? 'Copia local' : 'Guías ERP'} severity="info" /></div>
        <p className="orders-subtitle">Pedidos, clientes y documentos de reparto</p>
        <SelectButton value={view} options={[{ label: 'Por camión', value: 'shipments' }, { label: 'Pedidos importados', value: 'local' }]}
          allowEmpty={false} onChange={event => { setView(event.value as string); setSelection(null); }} aria-label="Vista de pedidos" />
        <div className="orders-filters">
          <label htmlFor="orders-date">{view === 'local' ? 'Fecha del pedido' : 'Fecha de emisión'}
            <InputText id="orders-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          {view === 'shipments' && <><label htmlFor="orders-truck">Camión
            <Dropdown inputId="orders-truck" options={options} optionLabel="plate" optionValue="id" value={vehicleId}
              onChange={event => setVehicleId(event.value as number | null)} filter filterBy="plate" disabled={!orders.vehicles.length}
              placeholder="Todos los camiones" /></label>
          <label htmlFor="orders-category"><span>Tipo de cliente <small className="orders-label-note">en esta página</small></span>
            <Dropdown inputId="orders-category" options={CUSTOMER_CATEGORIES} value={category} onChange={event => setCategory(event.value as string)} /></label>
          <div className="orders-refresh-row">
            <Button label="Actualizar ERP" icon="pi pi-refresh" loading={orders.loading} disabled={!date}
              onClick={orders.refresh} size="small" />
            <Dropdown aria-label="Frecuencia de actualización del ERP" options={POLLING_OPTIONS} value={polling}
              onChange={event => setPolling(event.value as number)} className="orders-polling" />
          </div>
          </>}
        </div>
        {view === 'shipments' && <p className="orders-query-time" aria-live="polite">{orders.data ? `Consulta: ${displayTime(orders.data.metadata.queriedAt)} · Lima` : 'Consulta en vivo al ERP'}
          {polling > 0 && orders.page > 1 && ' · automática en pausa al paginar'}</p>}
      </header>

      {view === 'local' ? <LocalOrdersPanel date={date} /> : <>
      <div className="orders-content" aria-busy={orders.loading}>
        <p className="orders-evidence"><i className="pi pi-info-circle" aria-hidden="true" /> Vínculo por guía de remisión; no confirma entrega.</p>
        {orders.vehiclesError && <Message severity="warn" text={orders.vehiclesError} />}
        {orders.error && <Message severity="error" text={`${orders.error}${orders.data ? ' Se conserva la consulta anterior.' : ''}`} />}
        {!date && <Message severity="info" text="Seleccione una fecha para consultar." />}
        {orders.loading && !orders.data && <div className="orders-loading"><ProgressSpinner style={{ width: 30, height: 30 }} />
          <p>Consultando documentos del ERP…</p></div>}
        {orders.data && <>
          <div className="orders-stats" aria-label="Conteos de esta página">
            <div><strong>{orders.data.metadata.guidesOnPage}</strong><span>Guías</span></div>
            <div><strong>{orders.data.metadata.clientsOnPage}</strong><span>Clientes</span></div>
            <div><strong>{orders.data.metadata.vehiclesOnPage}</strong><span>Camiones GPS</span></div>
          </div>
          <p className="orders-page-note">Página {orders.page} · {visibleItems.length} de {items.length} guías · {displayDate(date)}</p>
          {orders.data.metadata.unmatchedOnPage > 0 && <Message severity="warn"
            text={`${orders.data.metadata.unmatchedOnPage} guías de esta página requieren revisar su vínculo GPS.`} />}
          {groups.map(group => {
            const unit = currentUnit(group);
            const linkedOrders = new Set(group.items.flatMap(item => item.orders
              .filter(order => order.status === 'CONFIRMADO').map(order => order.orderId))).size;
            return <section className="orders-truck" key={group.key}>
              <header className="orders-truck__header"><div><strong><i className="pi pi-truck" aria-hidden="true" /> {group.vehicle.plate ?? group.vehicle.erpPlate ?? 'Sin placa'}</strong>
                <span>{linkedOrders} pedidos vinculados · {group.items.length} guías · {group.clients} clientes en esta página</span></div>
                <Button icon="pi pi-map-marker" rounded text size="small" disabled={!unit}
                  aria-label={`Ver ubicación GPS actual de ${group.vehicle.plate ?? group.vehicle.erpPlate ?? 'vehículo'}`}
                  tooltip={unit ? 'Ubicación GPS actual' : 'Sin posición GPS actual disponible'}
                  onClick={() => { if (unit) focusUnit(unit); }} /></header>
              {group.vehicle.match !== 'COINCIDENCIA_EXACTA' && <p className="orders-warning">
                {group.vehicle.match === 'PLACA_GPS_AMBIGUA' ? 'Placa GPS ambigua: sin vínculo automático.' : 'Guía sin vínculo GPS único.'}</p>}
              {group.items.map(shipment => <ShipmentCard key={shipment.id} shipment={shipment}
                onOpen={() => setSelection({ key: selectionKey, id: shipment.id })} />)}
            </section>;
          })}
          {!groups.length && <div className="orders-empty"><i className="pi pi-inbox" aria-hidden="true" />
            <h2>{items.length ? 'Sin coincidencias en esta página' : 'Sin guías disponibles'}</h2>
            <p>{items.length ? 'Cambie el tipo de cliente o consulte otra página.' : 'No se encontraron guías para la fecha y el camión seleccionados.'}</p></div>}
        </>}
      </div>
      <footer className="orders-pagination">
        <Button label="Anterior" icon="pi pi-angle-left" text size="small" onClick={orders.previous} disabled={orders.loading || orders.page===1} />
        <span>Página {orders.page}</span>
        <Button label="Siguiente" icon="pi pi-angle-right" iconPos="right" text size="small" onClick={orders.next}
          disabled={orders.loading || orders.data?.metadata.nextCursor == null} />
      </footer>
      </>}
      {selectedShipment && <Suspense fallback={<span role="status">Abriendo detalle…</span>}>
        <ShipmentDetailsDialog shipment={selectedShipment} onHide={() => setSelection(null)} onChanged={orders.reload} />
      </Suspense>}
    </section>
  );
}
