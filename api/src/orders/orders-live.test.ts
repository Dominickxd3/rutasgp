import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseService } from '../database/database.service';
import { OrdersLiveService } from './orders-live.service';
import { liveDetailsQuery, liveHeadersQuery, throughLinkedServer } from './orders-live.queries';
import { orderRange } from './orders.validation';

test('rechaza filtros inválidos e identificadores que podrían alterar SQL', () => {
  assert.throws(() => orderRange('2026-02-30','2026-03-01'));
  assert.throws(() => orderRange('2026-11-01','2026-11-08'));
  assert.throws(() => liveDetailsQuery([Number.NaN]));
  assert.throws(() => liveDetailsQuery([1,1]));
  assert.throws(() => liveDetailsQuery(Array.from({length:51},(_,index) => index+1)));
  assert.throws(() => liveHeadersQuery({from:"20261105';--",until:'20261106',after:0}));
});

test('OPENQUERY proyecta ambos resultados sin SELECT * ni escrituras', () => {
  for (const query of [liveHeadersQuery({from:'20261105',until:'20261106',after:0}),liveDetailsQuery([1,2])]) {
    const wrapped = throughLinkedServer(query);
    assert.match(wrapped,/OPENQUERY\(\[10\.10\.1\.3,1433\]/);
    assert.doesNotMatch(wrapped,/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP)\b|SELECT\s+\*/i);
    assert.doesNotMatch(wrapped,/r\.undefined/);
  }
});

test('lectura vacía no consulta detalles y no dispara sincronización', async () => {
  let requests=0;
  const database={pool:Promise.resolve({request:() => ({query:async () => {
    requests++; return {recordset:[]};
  }})})} as unknown as DatabaseService;
  const result=await new OrdersLiveService(database).list({from:'20261105',until:'20261106',after:0});
  assert.equal(requests,1);
  assert.deepEqual(result.items,[]);
  assert.equal(result.nextCursor,null);
});

test('agrupa solo detalles por pedido, conserva NULL y pedidos sin detalle', async () => {
  const statements:string[]=[];
  const headers=[{id_pedido_erp:10,cliente:'Anonimo'},{id_pedido_erp:20,cliente:null}];
  const details=[{id_pedido_erp:10,id_detalle_erp:2,kilos_atendidos:null},
    {id_pedido_erp:10,id_detalle_erp:1,kilos_atendidos:0}];
  const database={pool:Promise.resolve({request:() => ({query:async (query:string) => {
    statements.push(query); return {recordset:statements.length===1?headers:details};
  }})})} as unknown as DatabaseService;
  const result=await new OrdersLiveService(database).list({from:'20261105',until:'20261106',after:0});
  assert.equal(statements.length,2);
  assert.match(statements[1],/IN \(10,20\)/);
  assert.equal(result.items.length,2);
  assert.equal(result.items[0].details.length,2);
  assert.equal(result.items[0].details[0].kilos_atendidos,0);
  assert.equal(result.items[0].details[1].kilos_atendidos,null);
  assert.deepEqual(result.items[1].details,[]);
  assert.equal(result.consistency,'MULTIPLE_READS');
});
