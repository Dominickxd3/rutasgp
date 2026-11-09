export const LINK_COLUMNS = `v.id_vinculo id,v.id_pedido_erp orderId,RTRIM(p.numero) number,
 v.id_detalle_pedido_erp orderDetailId,v.id_guia_erp guideId,v.id_detalle_guia_erp guideDetailId,
 v.id_factura_erp invoiceId,p.id_cliente_erp customerId,c.nombre customer,
 c.tipo_cliente_descripcion category,d.id_producto_erp productId,v.evidencia evidence,
 v.usuario_validacion reviewer,v.fecha_validacion_utc validatedAt,
 CONVERT(bit,CASE WHEN p.presente_ultima_lectura=1 AND d.presente_ultima_lectura=1
   AND (d.estado_origen IS NULL OR d.estado_origen='0') THEN 1 ELSE 0 END) present,
 p.estado_origen orderStatus`;
export const LINK_JOINS = `FROM dbo.Distribucion_PedidoDocumento v
 JOIN dbo.ERP_Pedidos p ON p.empresa=v.empresa AND p.id_pedido_erp=v.id_pedido_erp
 JOIN dbo.ERP_PedidosDetalle d ON d.empresa=v.empresa AND d.id_detalle_erp=v.id_detalle_pedido_erp
 LEFT JOIN dbo.ERP_Clientes c ON c.id_cliente_erp=p.id_cliente_local`;

export const CANDIDATES = `SELECT TOP(101) p.id_pedido_erp orderId,RTRIM(p.numero) number,
 d.id_detalle_erp detailId,p.fecha_pedido_origen date,p.id_cliente_erp customerId,
 c.nombre customer,c.tipo_cliente_descripcion category,d.id_producto_erp productId,
 d.descripcion_producto product,d.cajas_origen boxes,d.kilos_pedidos_origen requestedKg,
 d.kilos_atendidos_origen attendedKg
 FROM dbo.ERP_Pedidos p
 JOIN dbo.ERP_PedidosDetalle d ON d.empresa=p.empresa AND d.id_pedido_erp=p.id_pedido_erp
 LEFT JOIN dbo.ERP_Clientes c ON c.id_cliente_erp=p.id_cliente_local
 WHERE p.empresa='003' AND p.presente_ultima_lectura=1 AND d.presente_ultima_lectura=1
 AND p.estado_origen='0' AND (d.estado_origen IS NULL OR d.estado_origen='0')
 AND (@orderId IS NOT NULL AND p.id_pedido_erp=@orderId
      OR @orderId IS NULL AND p.fecha_pedido_origen=@date)
 AND d.id_producto_erp IN (PRODUCT_PARAMETERS)
 ORDER BY CASE WHEN p.id_cliente_erp=@customer THEN 0 ELSE 1 END,p.id_pedido_erp,d.id_detalle_erp;`;

export const CONFIRM_LINK = `
DECLARE @Lock int,@Now datetime2(3)=SYSUTCDATETIME();
EXEC @Lock=sys.sp_getapplock @Resource='DISTRIBUCION_VINCULOS',
  @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
IF @Lock<0 THROW 50240,'Otro usuario esta validando un vinculo.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.ERP_Pedidos p WITH(UPDLOCK,HOLDLOCK)
  JOIN dbo.ERP_PedidosDetalle d WITH(UPDLOCK,HOLDLOCK)
    ON d.empresa=p.empresa AND d.id_pedido_erp=p.id_pedido_erp
  WHERE p.empresa='003' AND p.id_pedido_erp=@order AND d.id_detalle_erp=@detail
  AND d.id_producto_erp=@product AND p.estado_origen='0'
  AND (d.estado_origen IS NULL OR d.estado_origen='0')
  AND p.presente_ultima_lectura=1 AND d.presente_ultima_lectura=1
  AND (@different=1 OR p.id_cliente_erp=@customer))
  THROW 50241,'Pedido, producto o cliente no valido. Revise la seleccion.',1;
IF EXISTS(SELECT 1 FROM dbo.Distribucion_PedidoDocumento
  WHERE empresa='003' AND id_pedido_erp=@order AND id_detalle_pedido_erp=@detail
  AND id_guia_erp=@guide AND id_detalle_guia_erp=@guideDetail AND estado='CONFIRMADO')
  THROW 50242,'El vinculo ya esta confirmado.',1;
UPDATE dbo.Distribucion_PedidoDocumento SET estado='CONFIRMADO',origen='VALIDACION_MANUAL',
  id_factura_erp=@invoice,id_detalle_factura_erp=NULL,evidencia=@evidence,
  usuario_validacion=@reviewer,fecha_validacion_utc=SYSUTCDATETIME()
WHERE empresa='003' AND id_pedido_erp=@order AND id_detalle_pedido_erp=@detail
  AND id_guia_erp=@guide AND id_detalle_guia_erp=@guideDetail;
IF @@ROWCOUNT=0
  INSERT dbo.Distribucion_PedidoDocumento(empresa,id_pedido_erp,id_detalle_pedido_erp,
    id_guia_erp,id_detalle_guia_erp,id_factura_erp,estado,origen,evidencia,
    usuario_registro,usuario_validacion,fecha_registro_utc,fecha_validacion_utc)
  VALUES('003',@order,@detail,@guide,@guideDetail,@invoice,'CONFIRMADO','VALIDACION_MANUAL',
    @evidence,@reviewer,@reviewer,@Now,@Now);
SELECT CONVERT(varchar(20),id_vinculo) id FROM dbo.Distribucion_PedidoDocumento
  WHERE empresa='003' AND id_pedido_erp=@order AND id_detalle_pedido_erp=@detail
  AND id_guia_erp=@guide AND id_detalle_guia_erp=@guideDetail;
      `;
