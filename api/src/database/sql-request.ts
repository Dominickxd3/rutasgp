import sql, { ConnectionPool } from 'mssql/msnodesqlv8';

// mssql 12 admite opciones por petición; @types/mssql aún declara solo el padre.
export function sqlRequest(pool: ConnectionPool, requestTimeout: number): sql.Request {
  return Reflect.construct(sql.Request, [pool, { requestTimeout }]) as sql.Request;
}
