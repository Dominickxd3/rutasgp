export interface LocalOrder {
  id_pedido_erp: number; numero: string | null; id_cliente_erp: number | null;
  cliente: string | null; tipo_cliente_descripcion: string | null;
  estado_pedido_origen: string | null; cantidad_detalles: number;
  cajas: number | null; kilos_pedidos: number | null; kilos_atendidos: number | null;
  detalles_sin_pesajes: number | null; pesajes_sin_peso: number | null;
  fecha_sincronizacion_utc: string;
}
export interface LocalOrderPage {
  items: LocalOrder[]; next: number | null;
}
export interface LocalOrderProduct {
  id_detalle_erp: number; descripcion_producto: string | null;
  cajas_origen: number | null; kilos_pedidos_origen: number | null; kilos_atendidos_origen: number | null;
}
