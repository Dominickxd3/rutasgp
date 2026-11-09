import { useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { useOrderLinks } from '../hooks/useOrderLinks';
import { displayNumber } from '../utils/shipment.utils';
import type { Shipment } from '../types/shipment.types';

export function OrderLinkEditor({ shipment, onChanged }: { shipment: Shipment; onChanged: () => void }) {
  const links = useOrderLinks(shipment.id, onChanged);
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [guideDetailId, setGuideDetailId] = useState<number | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [evidence, setEvidence] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [differentAccepted, setDifferentAccepted] = useState(false);
  const candidate = links.data?.items.find(item => item.detailId === detailId);
  const guideLines = shipment.lines.filter(line => line.productId === candidate?.productId);
  const chosenLine = guideLines.length === 1 ? guideLines[0].id : guideDetailId;
  const differentCustomer = !!candidate && candidate.customerId !== shipment.customer.id;
  const ready = !!candidate && guideLines.some(line => line.id === chosenLine) && accepted
    && (!differentCustomer || differentAccepted) && !!reviewer.trim() && !!evidence.trim();
  const options = (links.data?.items ?? []).map(item => ({ id: item.detailId,
    label: `${item.number ?? item.orderId} · ID ${item.orderId} · ${item.customer ?? 'Sin nombre'} · ${item.product ?? item.productId}` }));
  const body = candidate && chosenLine ? { orderId: candidate.orderId, detailId: candidate.detailId,
    guideDetailId: chosenLine, reviewer, evidence, acceptDifferentCustomer: differentAccepted } : null;
  return <section className="order-link-editor" aria-label="Vinculación de pedidos">
    <h3>Vincular pedido comercial</h3>
    <p>Los candidatos comparten producto. Confirme la correspondencia con evidencia documental.</p>
    {links.error && <Message severity="error" text={links.error} />}
    <form onSubmit={event => { event.preventDefault(); setDetailId(null); setGuideDetailId(null);
      links.search(search.trim() ? Number(search) : null); }} className="order-link-editor__search">
      <InputText aria-label="Buscar ID del pedido" inputMode="numeric" pattern="[0-9]+" value={search}
        onChange={event => setSearch(event.target.value)} placeholder="ID del pedido, ej. 1723263" disabled={links.saving} />
      <Button label="Buscar" type="submit" loading={links.loading} disabled={links.saving || (!!search && !/^[1-9]\d*$/.test(search))} />
    </form>
    <small>Sin ID se muestran hasta 100 detalles de pedidos de la fecha de emisión de la guía.</small>
    {links.data?.truncated && <Message severity="warn" text="Hay más candidatos. Busque por ID del pedido para acotar." />}
    <label>Pedido y producto
      <Dropdown options={options} optionLabel="label" optionValue="id" value={detailId} filter
        disabled={links.saving || links.loading} placeholder="Seleccione el pedido correspondiente"
        onChange={event => { setDetailId(event.value as number); setGuideDetailId(null); setAccepted(false); setDifferentAccepted(false); }} />
    </label>
    {!links.loading && links.data && !options.length && <Message severity="info"
      text="No hay candidatos importados con esos productos. Revise el ID o la carga local." />}
    {candidate && <>
      <p>Analítica {candidate.customerId} · {candidate.customer} · {candidate.category ?? 'Sin clasificar'}<br />
        {displayNumber(candidate.boxes)} cajas · {displayNumber(candidate.requestedKg)} kg pedidos · {displayNumber(candidate.attendedKg)} kg atendidos</p>
      <label>Detalle de la guía
        <Dropdown options={guideLines.map(line => ({ id: line.id, label: `${line.product} · detalle ${line.id} · ${displayNumber(line.declaredKg)} kg` }))}
          optionValue="id" optionLabel="label" value={chosenLine} disabled={links.saving}
          onChange={event => setGuideDetailId(event.value as number)} placeholder="Seleccione el detalle" />
      </label>
      {differentCustomer && <>
        <Message severity="warn" text="La analítica del pedido difiere del destinatario de la guía. Documente el motivo." />
        <label className="order-link-editor__check"><Checkbox checked={differentAccepted} disabled={links.saving}
          onChange={event => setDifferentAccepted(!!event.checked)} />He comprobado la relación entre ambos clientes.</label>
      </>}
    </>}
    <label>Responsable de la validación<InputText value={reviewer} maxLength={128} disabled={links.saving}
      onChange={event => setReviewer(event.target.value)} autoComplete="name" /></label>
    <label>Evidencia o motivo<InputTextarea value={evidence} rows={3} maxLength={2000} disabled={links.saving}
      onChange={event => setEvidence(event.target.value)} placeholder="Referencia del documento o comprobación realizada" /></label>
    <label className="order-link-editor__check"><Checkbox checked={accepted} disabled={links.saving}
      onChange={event => setAccepted(!!event.checked)} />He revisado que este pedido y producto corresponden a la guía.</label>
    <Button label="Confirmar vínculo" icon="pi pi-link" loading={links.saving}
      disabled={!ready || links.loading || shipment.cancelled !== '0' || shipment.invoiceCompanyMatches === false}
      onClick={() => { if (body) void links.save(body).then(saved => { if (saved) { setAccepted(false); setDetailId(null); } }); }} />
    <p className="shipment-details__note">La confirmación registra una asociación documental. Las cantidades atendidas permanecen asociadas al pedido original.</p>
    {(links.data?.links ?? shipment.orders).map(link => <article className="order-link-editor__confirmed" key={link.id}>
      <strong>Pedido {link.number ?? link.orderId} · ID {link.orderId}</strong>
      <span>{link.customer} · {link.category ?? 'Sin clasificar'}</span>
      <small>{link.status === 'CONFIRMADO' ? 'Confirmado' : 'Requiere revisión'} · {link.reviewer} · detalle {link.orderDetailId}</small>
      <p>{link.evidence}</p>
      <Button label="Revocar vínculo" severity="danger" outlined size="small" disabled={links.saving || !reviewer.trim() || !evidence.trim()}
        onClick={() => { void links.revoke(link.id, evidence, reviewer); }} />
      <small>Para revocar, indique responsable y motivo en los campos anteriores.</small>
    </article>)}
  </section>;
}
