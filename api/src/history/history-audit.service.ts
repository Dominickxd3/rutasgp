import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql from 'mssql/msnodesqlv8';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { auditGps, QualityPoint } from './gps-quality';

@Injectable()
export class HistoryAuditService {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}

  async inspect(vehicleId: number, from: Date, to: Date, tripId?: number) {
    const pool = await this.database.pool;
    if (tripId) {
      const trip = await pool.request().input('id',sql.BigInt,tripId).input('vehicle',sql.Int,vehicleId)
        .query<{start:Date;end:Date|null}>(`SELECT fecha_inicio_utc AS start,fecha_fin_utc AS [end]
          FROM dbo.GPS_Recorridos WHERE id_recorrido=@id AND id_vehiculo=@vehicle`);
      if (!trip.recordset[0]) throw new BadRequestException('Recorrido/vehículo inexistente.');
      from=trip.recordset[0].start; to=trip.recordset[0].end ?? new Date();
    }
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to<from || !Number.isSafeInteger(vehicleId) || vehicleId<1) throw new BadRequestException('Intervalo o vehículo inválido.');
    // Una sola lectura acotada garantiza independencia de las páginas HTTP.
    // Se rechaza el exceso en lugar de publicar métricas parciales como completas.
    const result = await pool.request().input('vehicle',sql.Int,vehicleId)
      .input('from',sql.DateTime2(3),from).input('to',sql.DateTime2(3),to)
      .query<QualityPoint & {engine:string|null;heading:number|null;received:Date}>(`
        SELECT TOP (100001) id_posicion AS id,CONVERT(float,latitud) AS latitude,
          CONVERT(float,longitud) AS longitude,CONVERT(float,velocidad_kmh) AS speed,
          estado_motor AS engine,orientacion AS heading,fecha_gps_utc AS gpsDate,
          fecha_recepcion_utc AS received FROM dbo.GPS_Posiciones
        WHERE id_vehiculo=@vehicle AND fecha_gps_utc>=@from AND fecha_gps_utc<=@to
        ORDER BY fecha_gps_utc,id_posicion;`);
    if(result.recordset.length>100000) throw new BadRequestException('La auditoría excede 100000 posiciones; requiere procesamiento por lotes. No se emitieron métricas parciales.');
    const points=result.recordset;
    const report=auditGps(points,this.config.get<number>('history.gapSeconds',180),Number(this.config.get('GPS_QUALITY_MAX_KMH','130')));
    return { vehicleId,tripId:tripId??null,from:from.toISOString(),to:to.toISOString(),
      ...report,scope:'complete-stored-interval', complete:true,
      limitations:['Observaciones normalizadas; no equivalen a mensajes originales del proveedor.','El orden de llegada y conflictos descartados no se recuperan desde esta tabla.'],
      parameters:report.policy, inputHash:createHash('sha256').update(JSON.stringify(points)).digest('hex'),points };
  }

  async preserve(report: Awaited<ReturnType<HistoryAuditService['inspect']>>) {
    if(this.config.get('GPS_RECONSTRUCTION_VERSIONS_ENABLED')!=='true') throw new BadRequestException('Persistencia de versiones deshabilitada; revisar migración 007.');
    const pool=await this.database.pool;
    const result=await pool.request().input('trip',sql.BigInt,report.tripId)
      .input('params',sql.NVarChar(sql.MAX),JSON.stringify(report.parameters))
      .input('points',sql.NVarChar(sql.MAX),JSON.stringify(report.points))
      .input('result',sql.NVarChar(sql.MAX),JSON.stringify({...report,points:undefined}))
      .input('hash',sql.Char(64),report.inputHash)
      .query<{id:number}>(`INSERT dbo.GPS_ReconstruccionVersion
        (id_recorrido,version_algoritmo,parametros_json,posiciones_json,resultado_json,sha256_entrada)
        VALUES (@trip,'stored-audit-v1',@params,@points,@result,@hash);
        SELECT CONVERT(bigint,SCOPE_IDENTITY()) AS id;`);
    return {versionId:result.recordset[0].id};
  }
}
