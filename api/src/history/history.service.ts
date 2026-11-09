import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import { detectGpsStops, gpsDistanceMeters } from '../common/gps/stop-detection';
import { OsrmService } from './osrm.service';
import { auditGps } from './gps-quality';
import { HistoryAuditService } from './history-audit.service';

interface PositionRow {
  id: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  engine: string | null;
  heading: number | null;
  gpsDate: Date;
}

@Injectable()
export class HistoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly osrm: OsrmService,
    private readonly audit: HistoryAuditService,
  ) {}

  async listVehicles() {
    const pool = await this.database.pool;
    const result = await pool.request().query<{
      id: number;
      providerId: number;
      plate: string;
      active: boolean;
      firstPosition: Date | null;
      lastPosition: Date | null;
      positionCount: number;
    }>(`
      SELECT v.id_vehiculo AS id, v.id_unidad_proveedor AS providerId,
        v.placa AS plate, v.activo AS active,
        MIN(p.fecha_gps_utc) AS firstPosition,
        MAX(p.fecha_gps_utc) AS lastPosition,
        COUNT_BIG(p.id_posicion) AS positionCount
      FROM dbo.Vehiculos v
      LEFT JOIN dbo.GPS_Posiciones p ON p.id_vehiculo = v.id_vehiculo
      GROUP BY v.id_vehiculo, v.id_unidad_proveedor, v.placa, v.activo
      ORDER BY v.placa;
    `);

    return result.recordset.map((row) => ({
      ...row,
      firstPosition: row.firstPosition?.toISOString() ?? null,
      lastPosition: row.lastPosition?.toISOString() ?? null,
      positionCount: Number(row.positionCount),
    }));
  }

  async getPositions(vehicleId: number, from: Date, to: Date, page: number, requestedSize: number) {
    const pool = await this.database.pool;
    const maxPageSize = this.config.get<number>('history.maxPageSize', 5_000);
    const pageSize = Math.min(Math.max(1, requestedSize), maxPageSize);
    const offset = (page - 1) * pageSize;
    const request = () => pool.request()
      .input('vehicleId', sql.Int, vehicleId)
      .input('from', sql.DateTime2(3), from)
      .input('to', sql.DateTime2(3), to);

    const [data, summary, eventsData, priorEventData, sedesData] = await Promise.all([
      request().input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize)
        .query<PositionRow>(`
          SELECT id_posicion AS id, CONVERT(float, latitud) AS latitude,
            CONVERT(float, longitud) AS longitude,
            CONVERT(float, velocidad_kmh) AS speed, estado_motor AS engine,
            orientacion AS heading, fecha_gps_utc AS gpsDate
          FROM dbo.GPS_Posiciones
          WHERE id_vehiculo = @vehicleId
            AND fecha_gps_utc >= @from AND fecha_gps_utc <= @to
          ORDER BY fecha_gps_utc, id_posicion
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        `),
      request().query<{ total: number; firstDate: Date | null; lastDate: Date | null }>(`
        SELECT COUNT_BIG(*) AS total, MIN(fecha_gps_utc) AS firstDate,
          MAX(fecha_gps_utc) AS lastDate
        FROM dbo.GPS_Posiciones
        WHERE id_vehiculo = @vehicleId
          AND fecha_gps_utc >= @from AND fecha_gps_utc <= @to;
      `),
      request().query<{
        id: number;
        sedeId: number;
        sedeNombre: string;
        tipoEvento: 'SALIDA' | 'ENTRADA';
        fechaGpsUtc: Date;
        idPosicion: number;
        latitude: number | null;
        longitude: number | null;
      }>(`
        SELECT e.id_evento AS id,
               e.id_sede AS sedeId,
               s.nombre AS sedeNombre,
               e.tipo_evento AS tipoEvento,
               e.fecha_gps_utc AS fechaGpsUtc,
               e.id_posicion AS idPosicion,
               CONVERT(float, p.latitud) AS latitude,
               CONVERT(float, p.longitud) AS longitude
        FROM dbo.GPS_GeocercaEventos e
        LEFT JOIN dbo.GPS_Sedes s ON s.id_sede = e.id_sede
        LEFT JOIN dbo.GPS_Posiciones p ON p.id_posicion = e.id_posicion
        WHERE e.id_vehiculo = @vehicleId
          AND e.estado <> 'DESCARTADO'
          AND e.fecha_gps_utc >= @from AND e.fecha_gps_utc <= @to
        ORDER BY e.fecha_gps_utc ASC, e.id_evento ASC;
      `),
      request().query<{
        tipoEvento: string;
        fechaGpsUtc: Date;
        sedeNombre: string;
      }>(`
        SELECT TOP 1 e.tipo_evento AS tipoEvento, e.fecha_gps_utc AS fechaGpsUtc, s.nombre AS sedeNombre
        FROM dbo.GPS_GeocercaEventos e
        LEFT JOIN dbo.GPS_Sedes s ON s.id_sede = e.id_sede
        WHERE e.id_vehiculo = @vehicleId
          AND e.estado <> 'DESCARTADO'
          AND e.fecha_gps_utc < @from
        ORDER BY e.fecha_gps_utc DESC;
      `),
      pool.request().query<{
        id_sede: number;
        nombre: string;
        latitud: number;
        longitud: number;
      }>(`
        SELECT id_sede, nombre, CONVERT(float, latitud_referencia) as latitud, CONVERT(float, longitud_referencia) as longitud
        FROM dbo.GPS_Sedes
        WHERE activo = 1;
      `),
    ]);

    const rawPoints = data.recordset;
    // Asegurar ordenamiento cronológico estricto (Req 10)
    const points = [...rawPoints].sort((a, b) => a.gpsDate.getTime() - b.gpsDate.getTime());

    const gapSeconds = this.config.get<number>('history.gapSeconds', 180);
    const stopSeconds = this.config.get<number>('history.stopSeconds', 180);
    const stopRadius = this.config.get<number>('history.stopRadiusMeters', 40);
    const stopSpeed = this.config.get<number>('history.stopMaximumSpeedKmh', 3);
    const maximumHeartbeat = this.config.get<number>('history.stopMaximumHeartbeatSeconds', 900);
    const gaps: Array<{ from: string; to: string; seconds: number; coordinates?: [number, number][] }> = [];
    let observedDistanceMeters = 0;

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const seconds = (current.gpsDate.getTime() - previous.gpsDate.getTime()) / 1_000;
      const distance = gpsDistanceMeters(previous, current);
      const isStationaryHeartbeat = distance <= stopRadius &&
        (current.speed ?? 0) <= stopSpeed && (previous.speed ?? 0) <= stopSpeed &&
        seconds <= maximumHeartbeat;

      if (seconds > gapSeconds && !isStationaryHeartbeat) {
        gaps.push({ from: previous.gpsDate.toISOString(), to: current.gpsDate.toISOString(), seconds });
        continue;
      }
      observedDistanceMeters += distance;
    }

    // Ayuda visual exclusivamente: Route no es evidencia observada ni modifica
    // distancia, auditoría o posiciones originales. Fallo = intervalo abierto.
    await Promise.all(gaps.map(async (gap) => {
      const first = points.find(point => point.gpsDate.toISOString() === gap.from);
      const last = points.find(point => point.gpsDate.toISOString() === gap.to);
      if (!first || !last) return;
      const coordinates = await this.osrm.estimateRoute(first,last);
      if (coordinates && coordinates.length > 1) gap.coordinates = coordinates;
    }));
    const detectedStops = detectGpsStops(points, {
      radiusMeters: stopRadius,
      minimumSeconds: stopSeconds,
      maximumSpeedKmh: stopSpeed,
      maximumStationaryGapSeconds: maximumHeartbeat,
    });
    const sedes = sedesData.recordset;
    const stops = detectedStops.map((stop) => {
      const matchedSede = sedes.find((s) => {
        if (!s.latitud || !s.longitud) return false;
        const dist = gpsDistanceMeters(
          { latitude: stop.latitude, longitude: stop.longitude },
          { latitude: s.latitud, longitude: s.longitud },
        );
        return dist <= 150; // radio de sede
      });

      const locationType = matchedSede ? ('SEDE' as const) : ('OTRA' as const);

      return {
        start: stop.startTime.toISOString(),
        end: stop.endTime.toISOString(),
        seconds: stop.durationSeconds,
        latitude: stop.latitude,
        longitude: stop.longitude,
        radiusMeters: stop.radiusMeters,
        samples: stop.samples,
        detectionType: stop.detectionType,
        locationType,
        confidence: stop.confidence,
        confidenceReason: stop.confidenceReason,
        distinctCoordinates: stop.distinctCoordinates,
        hasRepeatedCoordinates: stop.hasRepeatedCoordinates,
        distinctGpsTimestamps: stop.distinctGpsTimestamps,
        maxGapSeconds: stop.maxGapSeconds,
        coverageRatioPct: stop.coverageRatioPct,
        engineState: stop.engineState,
        sedeNombre: matchedSede?.nombre ?? null,
      };
    });

    const events = eventsData.recordset;
    const hasDepartureInInterval = events.some((e) => e.tipoEvento === 'SALIDA');
    const prior = priorEventData.recordset[0];

    let departureObserved = hasDepartureInInterval;
    let departureNotice: string | null = null;

    if (!departureObserved) {
      if (prior?.tipoEvento === 'SALIDA') {
        departureNotice = `Salida de sede previa no incluida en este rango (registrada el ${prior.fechaGpsUtc.toISOString()}).`;
      } else {
        departureNotice = 'Salida de sede no observada. La unidad comenzó a ser registrada fuera de las instalaciones.';
      }
    }

    const gapKeys = new Set(gaps.map((gap) => `${gap.from}|${gap.to}`));
    const continuousSegments: PositionRow[][] = [];
    let segment: PositionRow[] = [];
    for (const point of points) {
      const previous = segment.at(-1);
      if (previous && gapKeys.has(`${previous.gpsDate.toISOString()}|${point.gpsDate.toISOString()}`)) {
        if (segment.length > 1) continuousSegments.push(segment);
        segment = [];
      }
      segment.push(point);
    }
    if (segment.length > 1) continuousSegments.push(segment);

    const roadSegments = await this.osrm.matchSegments(continuousSegments);

    const totals = summary.recordset[0];
    return {
      vehicleId,
      qualityAudit: await this.fullAudit(vehicleId,from,to),
      statisticsScope: 'returned-page',
      interval: { from: from.toISOString(), to: to.toISOString() },
      pagination: { page, pageSize, total: Number(totals.total), pages: Math.ceil(Number(totals.total) / pageSize) },
      observed: { first: totals.firstDate?.toISOString() ?? null, last: totals.lastDate?.toISOString() ?? null },
      statistics: { points: points.length, observedDistanceMeters: Math.round(observedDistanceMeters), gaps: gaps.length, stops: stops.length },
      gaps,
      stops,
      roadSegments,
      mapMatching: {
        applied: roadSegments.some((item) => item.kind === 'matched'),
        provider: 'OSRM',
        matchedSegments: roadSegments.filter((item) => item.kind === 'matched').length,
        estimatedSegments: roadSegments.filter((item) => item.kind === 'estimated').length,
      },
      points: points.map((point) => ({ ...point, gpsDate: point.gpsDate.toISOString() })),
      geofenceEvents: events.map((e) => ({
        id: Number(e.id),
        sedeId: Number(e.sedeId),
        sedeNombre: e.sedeNombre,
        tipoEvento: e.tipoEvento,
        fechaGpsUtc: e.fechaGpsUtc.toISOString(),
        idPosicion: Number(e.idPosicion),
        latitude: e.latitude ?? undefined,
        longitude: e.longitude ?? undefined,
      })),
      departureObserved,
      departureNotice,
      stopCriteria: {
        minimumSeconds: stopSeconds,
        radiusMeters: stopRadius,
        maximumSpeedKmh: stopSpeed,
        maximumStationaryGapSeconds: maximumHeartbeat,
      },
      precisionNotice: 'La ruta azul fue ajustada a la red vial con OSRM. Los segmentos discontinuos son estimados o carecen de cobertura GPS y no representan una trayectoria confirmada.',
    };
  }

  private async fullAudit(vehicleId:number,from:Date,to:Date) {
    const {points,...report}=await this.audit.inspect(vehicleId,from,to);
    return report;
  }
}
