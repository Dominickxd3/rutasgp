import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { useLocalOrders } from '../hooks/useLocalOrders';
import { displayNumber, displayTime } from '../utils/shipment.utils';

export function LocalOrdersPanel({ date }: { date: string }) {
  const orders = useLocalOrders(date);
  return <div className="orders-local" aria-busy={orders.loading}>
    <div className="orders-content">
      <Message severity="info" text="Pedidos importados. Para asociar guía, factura y camión, abra Por camión → Ver detalle." />
      <Button label="Refrescar consulta local" icon="pi pi-refresh" outlined loading={orders.loading} onClick={orders.refresh} />
      {orders.error && <Message severity="error" text={orders.error} />}
      {orders.loading && !orders.data && <p role="status">Cargando pedidos locales…</p>}
      {orders.data?.items.map(order => <article className="shipment-card" key={order.id_pedido_erp}>
        <header><strong>Pedido {order.numero ?? 'Sin número'}</strong><small>{order.tipo_cliente_descripcion ?? 'Sin clasificar'}</small></header>
        <p className="orders-page-note">ID {order.id_pedido_erp} · Analítica {order.id_cliente_erp ?? 'Sin referencia'}</p>
        <h3>{order.cliente ?? 'Sin nombre'}</h3>
        <p>{displayNumber(order.cajas)} cajas · {displayNumber(order.kilos_pedidos)} kg pedidos</p>
        <p>{displayNumber(order.kilos_atendidos)} kg atendidos</p>
        {(Number(order.detalles_sin_pesajes) > 0 || Number(order.pesajes_sin_peso) > 0) &&
          <small>Peso atendido incompleto. Hay detalles sin pesajes o lecturas sin peso.</small>}
        {order.estado_pedido_origen?.trim() !== '0' && <Message severity="warn" text="Revise el estado del pedido en el ERP." />}
        <small>Importado {displayTime(order.fecha_sincronizacion_utc)} · Lima</small>
        <Button label={orders.selectedId === order.id_pedido_erp ? 'Ocultar productos' : 'Ver productos'} text size="small"
          onClick={() => orders.select(order.id_pedido_erp)} />
        {orders.selectedId === order.id_pedido_erp && <>
          {orders.productsLoading && <p role="status">Cargando productos…</p>}
          {orders.products?.items.map(product => <div className="orders-local__product" key={product.id_detalle_erp}>
            <strong>{product.descripcion_producto ?? 'Sin descripción'}</strong>
            <small>Detalle {product.id_detalle_erp}</small>
            <span>{displayNumber(product.cajas_origen)} cajas · {displayNumber(product.kilos_pedidos_origen)} kg pedidos · {displayNumber(product.kilos_atendidos_origen)} kg atendidos</span>
          </div>)}
          {orders.products?.truncated && <Message severity="warn" text="Se muestran los primeros 500 detalles." />}
        </>}
      </article>)}
      {orders.data && !orders.data.items.length && <p>No hay pedidos importados para esta fecha.</p>}
    </div>
    <footer className="orders-pagination">
      <Button label="Anterior" text disabled={orders.loading || orders.page === 1} onClick={orders.previous} />
      <span>Página {orders.page}</span>
      <Button label="Siguiente" text disabled={orders.loading || !orders.data?.next} onClick={orders.next} />
    </footer>
  </div>;
}
