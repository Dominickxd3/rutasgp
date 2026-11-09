// Solo SELECT. Estas consultas nunca utilizan las tablas de copia local.
export interface LiveOrderFilter { from: string; until: string; after: number }

export function liveHeadersQuery(filter: LiveOrderFilter): string {
  if (!/^\d{8}$/.test(filter.from) || !/^\d{8}$/.test(filter.until)
    || !Number.isInteger(filter.after) || filter.after < 0 || filter.after > 2147483647) {
    throw new Error('Filtros remotos inválidos.');
  }
  return `SELECT p.emp_codigo AS empresa,p.id_pvt AS id_pedido_erp,
    p.pvt_anomes AS periodo,p.pvt_numero AS numero,p.pvt_fecreg AS fecha_pedido_origen,
    p.crea_fec AS fecha_creacion_origen,p.modi_fec AS fecha_modificacion_origen,
    p.st_anulado AS estado_pedido,p.id_analit AS id_cliente_erp,
    c.Id_Analit AS id_cliente_encontrado,RTRIM(c.Ana_Descri) AS cliente,
    c.CodTipoCliente AS tipo_cliente_codigo,RTRIM(tc.tab_descri) AS tipo_cliente_descripcion,
    c.st_anulado AS estado_cliente
    FROM (SELECT TOP(50) emp_codigo,id_pvt,pvt_anomes,pvt_numero,pvt_fecreg,
      crea_fec,modi_fec,st_anulado,id_analit
      FROM dbGP_2024_GP.dbo.FA001020
      WHERE emp_codigo='003' AND pvt_fecreg>='${filter.from}' AND pvt_fecreg<'${filter.until}'
        AND id_pvt>${filter.after} ORDER BY id_pvt) p
    LEFT JOIN dbGP_2024_GP.dbo.MA001090 c ON c.Id_Analit=p.id_analit
    LEFT JOIN dbGP_2024_GP.dbo.MA001160 tc
      ON tc.tab_grupo='210' AND tc.tab_grupo+tc.tab_codigo=c.CodTipoCliente`;
}

export function liveDetailsQuery(ids: number[]): string {
  if (!ids.length || ids.length > 50 || ids.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647)
    || new Set(ids).size !== ids.length) throw new Error('Lista de pedidos inválida.');
  return `SELECT d.id_pvt AS id_pedido_erp,d.id_pvtdet AS id_detalle_erp,
    d.id_producto AS id_producto_erp,d.id_factor AS id_factor_erp,
    pr.pro_Descri AS descripcion_producto,d.pvt_unidad AS cajas,
    d.pvt_pespro AS peso_promedio,d.pvt_kgsadi AS kilos_pedidos,
    k.kilos_atendidos AS kilos_atendidos,k.numero_pesajes AS numero_pesajes,k.pesajes_con_peso AS pesajes_con_peso,
    d.st_item AS estado_detalle,u.Cod_UndSnt AS unidad_producto,
    uf.Cod_UndSnt AS unidad_factor
    FROM dbGP_2024_GP.dbo.FA001021 d
    LEFT JOIN dbGP_2024_GP.dbo.MA001110 pr ON pr.id_producto=d.id_producto
    LEFT JOIN dbGP_2024_GP.dbo.MA001111 u ON u.Id_Unidad=pr.id_unidad
    LEFT JOIN dbGP_2024_GP.dbo.MA001112 fa ON fa.id_factor=d.id_factor
    LEFT JOIN dbGP_2024_GP.dbo.MA001111 uf ON uf.Id_Unidad=fa.id_unidad
    OUTER APPLY (SELECT SUM(w.Pes_Neto) AS kilos_atendidos,COUNT(*) AS numero_pesajes,
      COUNT(w.Pes_Neto) AS pesajes_con_peso
      FROM dbGP_2024_GP.dbo.FA001022 w WHERE w.id_pvtdet=d.id_pvtdet) k
    WHERE d.id_pvt IN (${ids.join(',')})`;
}

export function throughLinkedServer(remote: string): string {
  if (Buffer.byteLength(remote, 'utf8') > 8000) throw new Error('Consulta remota demasiado extensa.');
  // El subquery remoto ya contiene la proyección explícita. No usar SELECT * exterior.
  const aliases = remote.slice(0, remote.indexOf('\n    FROM')).split(',')
    .map(column => column.trim().match(/(?:AS\s+)(\w+)$/i)?.[1]);
  if (aliases.some(alias => !alias)) throw new Error('Proyección remota inválida.');
  return `SELECT ${aliases.map(alias => `r.${alias}`).join(',')}
    FROM OPENQUERY([10.10.1.3,1433], '${remote.replaceAll("'", "''")}') r`;
}
