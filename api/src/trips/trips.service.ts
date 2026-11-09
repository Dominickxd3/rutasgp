import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import {
  GeofencesService,
  type StoredGeofence,
} from '../geofences/geofences.service';
import {
  detectGpsStops,
  gpsDistanceMeters,
  STOP_ALGORITHM_VERSION,
  type DetectedGpsStop,
} from '../common/gps/stop-detection';
import {
  buildTripWindows,
  type GeofenceEventInput,
  type TripEndReason,
} from './trip-consolidation';

export interface TripSummary {
  idRecorrido: number;
  idVehiculo: number;
  placa: string;
  idSede: number | null;
  sedeNombre: string | null;
  fechaInicioUtc: string;
  fechaFinUtc: string | null;
  duracionSegundos: number | null;
  distanciaObservadaM: number | null;
  cantidadPuntos: number;
  cantidadGaps: number;
  coberturaGpsPct: number | null;
  cantidadParadas: number;
  duracionParadasSeg: number;
  estado: 'EN_CURSO' | 'FINALIZADO' | 'INCOMPLETO' | 'OBSERVADO' | 'PARCIAL' | 'REPROCESADO';
  versionAlgoritmo: string | null;
  fechaProcesamientoUtc: string;
  origenObservado: boolean;
}

export interface PositionPoint {
  id: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  engine: string | null;
  heading: number | null;
  gpsDate: Date;
}

export interface TripStopRecord {
  idParada: number;
  idRecorrido: number | null;
  idVehiculo: number;
  placa: string;
  fechaInicioUtc: string;
  fechaFinUtc: string;
  duracionSegundos: number;
  latitud: number;
  longitud: number;
  tipoDeteccion: string;
  tipoUbicacion: string;
  nivelConfianza: string;
  motivoConfianza: string | null;
  criterioDeteccion: string;
  idSede: number | null;
  versionAlgoritmo: string;
  idPosicionInicio: number | null;
  idPosicionFin: number | null;
  muestrasGps: number;
  coordenadasDistintas: number;
  timestampsDistintos: number;
  intervaloMaximoSeg: number;
  coberturaTemporalPct: number;
  coordenadasRepetidas: boolean;
  estadoMotorDominante: string;
}

export interface TripsIntegrityReport {
  generadoEnUtc: string;
  estado: 'OK' | 'ADVERTENCIA' | 'ERROR';
  resumen: {
    posiciones: number;
    eventosVigentes: number;
    recorridos: number;
    paradas: number;
  };
  controles: Record<string, number>;
  distribucion: {
    estados: Array<{ valor: string; cantidad: number }>;
    confianza: Array<{ valor: string; cantidad: number }>;
    ubicacion: Array<{ valor: string; cantidad: number }>;
    versiones: Array<{ valor: string; cantidad: number }>;
  };
  incidencias: Array<{
    codigo: string;
    severidad: 'ERROR' | 'ADVERTENCIA' | 'INFO';
    descripcion: string;
    cantidad: number;
  }>;
}

export interface StopManualSample {
  idParada: number;
  idRecorrido: number | null;
  idVehiculo: number;
  placa: string;
  estadoRecorrido: string | null;
  fechaInicioUtc: string;
  fechaFinUtc: string;
  duracionSegundos: number;
  latitud: number;
  longitud: number;
  tipoDeteccion: string;
  tipoUbicacion: string;
  nivelConfianza: string;
  motivoConfianza: string | null;
  criterioDeteccion: string;
  versionAlgoritmo: string;
  idPosicionInicio: number | null;
  idPosicionFin: number | null;
  muestrasGps: number;
  coordenadasDistintas: number;
  timestampsDistintos: number;
  intervaloMaximoSeg: number;
  coberturaTemporalPct: number;
  requiereValidacionFisica: true;
}

export type DetectedStop = DetectedGpsStop;

const haversineDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  gpsDistanceMeters({ latitude: lat1, longitude: lon1 }, { latitude: lat2, longitude: lon2 });

/** Un viaje abierto sin lecturas nuevas se considera incompleto, no en curso. */
const OPEN_TRIP_STALE_HOURS = 2;

const STOP_CRITERIA_LABEL =
  'permanencia>=180s; radio<=40m; velocidad<=3km/h; gap_max<=900s';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly geofences: GeofencesService,
  ) {}

  /**
   * Detecta paradas según las reglas del pretest/investigación:
   * Permanencia > 180 segundos en un radio de 40 metros con velocidad <= 3 km/h.
   */
  detectStops(points: PositionPoint[], stopRadius = 40, stopSeconds = 180): DetectedStop[] {
    return detectGpsStops(points, {
      radiusMeters: stopRadius,
      minimumSeconds: stopSeconds,
      maximumSpeedKmh: 3,
      maximumStationaryGapSeconds: 900,
    });
  }

  /**
   * Consolida los recorridos y paradas de un vehículo en base a sus eventos de SALIDA y ENTRADA.
   * Totalmente idempotente.
   */
  async consolidateVehicle(vehicleId: number): Promise<{
    tripsProcessed: number;
    tripsCreated: number;
    stopsCreated: number;
    stopsUpdated: number;
    stopsDeleted: number;
  }> {
    const pool = await this.database.pool;

    // Los recorridos derivados de una SALIDA descartada dejan de ser válidos.
    // Se eliminan antes de reconstruir para no conservar viajes con origen falso.
    await this.pruneDiscardedTrips(vehicleId);

    const eventsResult = await pool
      .request()
      .input('vehicleId', sql.Int, vehicleId)
      .query<GeofenceEventInput>(`
        SELECT id_evento, id_sede, tipo_evento, fecha_gps_utc, id_posicion
        FROM dbo.GPS_GeocercaEventos
        WHERE id_vehiculo = @vehicleId AND estado <> 'DESCARTADO'
        ORDER BY fecha_gps_utc ASC, id_evento ASC;
      `);

    const windows = buildTripWindows(eventsResult.recordset);
    if (windows.length === 0) {
      return { tripsProcessed: 0, tripsCreated: 0, stopsCreated: 0, stopsUpdated: 0, stopsDeleted: 0 };
    }

    const geofencesBySede = await this.loadGeofencesBySede();
    const now = Date.now();

    let tripsProcessed = 0;
    let tripsCreated = 0;
    let stopsCreated = 0;
    let stopsUpdated = 0;
    let stopsDeleted = 0;

    for (const window of windows) {
      const salidaEvent = window.salida;
      const entradaEvent = window.entrada;
      const isClosed = entradaEvent !== null;
      const fechaInicio = salidaEvent.fecha_gps_utc;
      const fechaFin = entradaEvent?.fecha_gps_utc ?? window.endLimit;

      const posRequest = pool
        .request()
        .input('vId', sql.Int, vehicleId)
        .input('from', sql.DateTime2(3), fechaInicio);

      let queryStr = `
        SELECT id_posicion AS id,
               CONVERT(float, latitud) AS latitude,
               CONVERT(float, longitud) AS longitude,
               CONVERT(float, velocidad_kmh) AS speed,
               estado_motor AS engine,
               orientacion AS heading,
               fecha_gps_utc AS gpsDate
        FROM dbo.GPS_Posiciones
        WHERE id_vehiculo = @vId AND fecha_gps_utc >= @from
      `;

      if (isClosed && fechaFin) {
        posRequest.input('to', sql.DateTime2(3), fechaFin);
        queryStr += ` AND fecha_gps_utc <= @to`;
      } else if (window.endLimit) {
        // La segunda SALIDA marca el fin del primer recorrido, pero su punto
        // ya pertenece al siguiente: se excluye para no compartir evidencia.
        posRequest.input('to', sql.DateTime2(3), window.endLimit);
        queryStr += ` AND fecha_gps_utc < @to`;
      }

      queryStr += ` ORDER BY fecha_gps_utc ASC, id_posicion ASC;`;

      const posResult = await posRequest.query<PositionPoint>(queryStr);
      const points = posResult.recordset;

      if (points.length === 0) continue;

      const firstPt = points[0];
      const lastPt = points[points.length - 1];

      let observedDistanceMeters = 0;
      let gapCount = 0;
      let totalGapSeconds = 0;

      for (let pIdx = 1; pIdx < points.length; pIdx += 1) {
        const prev = points[pIdx - 1];
        const curr = points[pIdx];
        const dist = haversineDistanceMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        observedDistanceMeters += dist;

        const sec = (curr.gpsDate.getTime() - prev.gpsDate.getTime()) / 1_000;
        const isStationaryHeartbeat = dist <= 40 && (curr.speed ?? 0) <= 3 && (prev.speed ?? 0) <= 3;
        if (sec > 180 && !isStationaryHeartbeat) {
          gapCount += 1;
          totalGapSeconds += sec;
        }
      }

      const totalDurationSec = Math.max(
        1,
        Math.round((lastPt.gpsDate.getTime() - firstPt.gpsDate.getTime()) / 1_000),
      );

      const coveragePct = Math.max(
        0,
        Math.min(100, Number(((1 - totalGapSeconds / totalDurationSec) * 100).toFixed(2))),
      );

      const stops = this.detectStops(points, 40, 180);
      const totalStopDuration = stops.reduce((sum, s) => sum + s.durationSeconds, 0);

      const estadoRecorrido = this.resolveTripState({
        isClosed,
        endReason: window.endReason,
        gapCount,
        lastObservedAt: lastPt.gpsDate,
        now,
      });

      const tripUpsert = await pool
        .request()
        .input('vId', sql.Int, vehicleId)
        .input('sedeId', sql.Int, salidaEvent.id_sede)
        .input('fechaInicio', sql.DateTime2(3), fechaInicio)
        .input('fechaFin', sql.DateTime2(3), fechaFin)
        .input('posInicio', sql.BigInt, salidaEvent.id_posicion)
        .input('posFin', sql.BigInt, isClosed ? entradaEvent!.id_posicion : lastPt.id)
        .input('distancia', sql.Decimal(14, 2), observedDistanceMeters)
        .input('puntos', sql.Int, points.length)
        .input('gaps', sql.Int, gapCount)
        .input('cobertura', sql.Decimal(5, 2), coveragePct)
        .input('duracion', sql.Int, totalDurationSec)
        .input('cantParadas', sql.Int, stops.length)
        .input('durParadas', sql.Int, totalStopDuration)
        .input('evtSalida', sql.BigInt, salidaEvent.id_evento)
        .input('evtRetorno', sql.BigInt, entradaEvent?.id_evento ?? null)
        .input('estado', sql.VarChar(20), estadoRecorrido)
        .input('versionAlg', sql.VarChar(20), STOP_ALGORITHM_VERSION)
        .query<{ id_recorrido: number; inserted: number }>(`
          DECLARE @recId bigint;
          DECLARE @inserted bit = 0;
          SELECT @recId = id_recorrido FROM dbo.GPS_Recorridos WITH (UPDLOCK, HOLDLOCK)
          WHERE id_vehiculo = @vId AND fecha_inicio_utc = @fechaInicio;

          IF @recId IS NULL
          BEGIN
            INSERT INTO dbo.GPS_Recorridos (
              id_vehiculo, id_sede, fecha_inicio_utc, fecha_fin_utc,
              id_posicion_inicio, id_posicion_fin, distancia_observada_m,
              cantidad_puntos, cantidad_intervalos_sin_datos, cobertura_gps_pct,
              duracion_segundos, cantidad_paradas, duracion_paradas_seg,
              id_evento_salida, id_evento_retorno, estado, version_algoritmo
            )
            VALUES (
              @vId, @sedeId, @fechaInicio, @fechaFin,
              @posInicio, @posFin, @distancia,
              @puntos, @gaps, @cobertura,
              @duracion, @cantParadas, @durParadas,
              @evtSalida, @evtRetorno, @estado, @versionAlg
            );
            SET @recId = SCOPE_IDENTITY();
            SET @inserted = 1;
          END
          ELSE
          BEGIN
            UPDATE dbo.GPS_Recorridos
            SET fecha_fin_utc = @fechaFin,
                id_posicion_fin = @posFin,
                distancia_observada_m = @distancia,
                cantidad_puntos = @puntos,
                cantidad_intervalos_sin_datos = @gaps,
                cobertura_gps_pct = @cobertura,
                duracion_segundos = @duracion,
                cantidad_paradas = @cantParadas,
                duracion_paradas_seg = @durParadas,
                id_evento_retorno = @evtRetorno,
                estado = @estado,
                version_algoritmo = @versionAlg,
                fecha_procesamiento_utc = SYSUTCDATETIME()
            WHERE id_recorrido = @recId;
          END;

          SELECT @recId AS id_recorrido, @inserted AS inserted;
        `);

      const tripId = tripUpsert.recordset[0]?.id_recorrido;
      if (!tripId) continue;

      tripsProcessed += 1;
      if (Number(tripUpsert.recordset[0]?.inserted) === 1) tripsCreated += 1;

      const persisted = await this.persistStops({
        tripId: Number(tripId),
        vehicleId,
        tripStart: fechaInicio,
        tripEnd: fechaFin,
        stops,
        geofencesBySede,
      });

      stopsCreated += persisted.created;
      stopsUpdated += persisted.updated;
      stopsDeleted += persisted.deleted;
    }

    // El contador se recalcula desde la evidencia persistida, nunca desde el
    // arreglo en memoria: así no quedan contadores históricos obsoletos.
    await this.reassignStopsToTrips(vehicleId);
    await this.refreshTripAggregates(vehicleId);

    return { tripsProcessed, tripsCreated, stopsCreated, stopsUpdated, stopsDeleted };
  }

  /**
   * Consolida todos los recorridos activos e históricos para la flota.
   */
  async consolidateAll(): Promise<{
    totalTrips: number;
    totalStops: number;
    totalTripsCreated: number;
    totalStopsUpdated: number;
    totalStopsDeleted: number;
  }> {
    const pool = await this.database.pool;
    const vehicles = await pool.request().query<{ id_vehiculo: number }>(`
      SELECT DISTINCT id_vehiculo FROM dbo.GPS_GeocercaEventos
      WHERE estado <> 'DESCARTADO';
    `);

    let totalTrips = 0;
    let totalTripsCreated = 0;
    let totalStops = 0;
    let totalStopsUpdated = 0;
    let totalStopsDeleted = 0;

    for (const row of vehicles.recordset) {
      const res = await this.consolidateVehicle(row.id_vehiculo);
      totalTrips += res.tripsProcessed;
      totalTripsCreated += res.tripsCreated;
      totalStops += res.stopsCreated;
      totalStopsUpdated += res.stopsUpdated;
      totalStopsDeleted += res.stopsDeleted;
    }

    this.logger.log(
      `Consolidación completa: ${totalTrips} recorridos procesados (${totalTripsCreated} nuevos), ` +
        `${totalStops} paradas nuevas, ${totalStopsUpdated} actualizadas, ${totalStopsDeleted} obsoletas removidas.`,
    );
    return { totalTrips, totalStops, totalTripsCreated, totalStopsUpdated, totalStopsDeleted };
  }

  /**
   * Lista los recorridos consolidados con filtros por fecha, vehículo y estado.
   */
  async getTrips(filters?: {
    date?: string;
    vehicleId?: number;
    estado?: string;
  }): Promise<TripSummary[]> {
    const pool = await this.database.pool;
    const req = pool.request();

    let queryStr = `
      SELECT r.id_recorrido AS idRecorrido,
             r.id_vehiculo AS idVehiculo,
             v.placa,
             r.id_sede AS idSede,
             s.nombre AS sedeNombre,
             r.fecha_inicio_utc AS fechaInicioUtc,
             r.fecha_fin_utc AS fechaFinUtc,
             r.duracion_segundos AS duracionSegundos,
             CONVERT(float, r.distancia_observada_m) AS distanciaObservadaM,
             r.cantidad_puntos AS cantidadPuntos,
             r.cantidad_intervalos_sin_datos AS cantidadGaps,
             CONVERT(float, r.cobertura_gps_pct) AS coberturaGpsPct,
             r.cantidad_paradas AS cantidadParadas,
             r.duracion_paradas_seg AS duracionParadasSeg,
             r.estado,
             r.version_algoritmo AS versionAlgoritmo,
             r.fecha_procesamiento_utc AS fechaProcesamientoUtc,
             CASE WHEN salida.estado IN ('OBSERVADO','CONFIRMADO') THEN 1 ELSE 0 END AS origenObservado
      FROM dbo.GPS_Recorridos r
      JOIN dbo.Vehiculos v ON v.id_vehiculo = r.id_vehiculo
      LEFT JOIN dbo.GPS_Sedes s ON s.id_sede = r.id_sede
      LEFT JOIN dbo.GPS_GeocercaEventos salida ON salida.id_evento = r.id_evento_salida
      WHERE 1=1
    `;

    if (filters?.vehicleId) {
      req.input('vId', sql.Int, filters.vehicleId);
      queryStr += ` AND r.id_vehiculo = @vId`;
    }

    if (filters?.estado) {
      req.input('estado', sql.VarChar(20), filters.estado);
      queryStr += ` AND r.estado = @estado`;
    }

    if (filters?.date) {
      req.input('targetDate', sql.VarChar(10), filters.date);
      // Filtra por fecha considerando el huso de Lima (UTC - 5)
      queryStr += ` AND CONVERT(varchar(10), DATEADD(hour, -5, r.fecha_inicio_utc), 120) = @targetDate`;
    }

    queryStr += ` ORDER BY r.fecha_inicio_utc DESC, r.id_recorrido DESC;`;

    const result = await req.query<TripSummary>(queryStr);
    return result.recordset.map((row) => ({
      ...row,
      idRecorrido: Number(row.idRecorrido),
      fechaInicioUtc: new Date(row.fechaInicioUtc).toISOString(),
      fechaFinUtc: row.fechaFinUtc ? new Date(row.fechaFinUtc).toISOString() : null,
      fechaProcesamientoUtc: new Date(row.fechaProcesamientoUtc).toISOString(),
      origenObservado: Boolean(row.origenObservado),
    }));
  }

  /**
   * Recupera las paradas de un recorrido con toda la evidencia y trazabilidad.
   */
  async getTripStops(tripId: number): Promise<{
    recorrido: TripSummary;
    paradas: TripStopRecord[];
  }> {
    const trips = await this.getTrips();
    const recorrido = trips.find((trip) => trip.idRecorrido === tripId);
    if (!recorrido) {
      throw new NotFoundException(`No existe el recorrido ${tripId}.`);
    }

    const pool = await this.database.pool;
    const result = await pool
      .request()
      .input('tripId', sql.BigInt, tripId)
      .query<{
        id_parada: number;
        id_recorrido: number | null;
        id_vehiculo: number;
        placa: string;
        fecha_inicio_utc: Date;
        fecha_fin_utc: Date;
        duracion_segundos: number;
        latitud: number;
        longitud: number;
        tipo_deteccion: string;
        tipo_ubicacion: string;
        nivel_confianza: string;
        motivo_confianza: string | null;
        criterio_deteccion: string;
        id_sede: number | null;
        version_algoritmo: string;
        id_posicion_inicio: number | null;
        id_posicion_fin: number | null;
        muestras_gps: number;
        coordenadas_distintas: number;
        timestamps_distintos: number;
        intervalo_maximo_seg: number;
        cobertura_temporal_pct: number;
        coordenadas_repetidas: boolean;
        estado_motor_dominante: string;
      }>(`
        SELECT p.id_parada, p.id_recorrido, p.id_vehiculo, v.placa,
               p.fecha_inicio_utc, p.fecha_fin_utc, p.duracion_segundos,
               CONVERT(float, p.latitud) AS latitud,
               CONVERT(float, p.longitud) AS longitud,
               p.tipo_deteccion, p.tipo_ubicacion, p.nivel_confianza,
               p.motivo_confianza, p.criterio_deteccion, p.id_sede, p.version_algoritmo,
               p.id_posicion_inicio, p.id_posicion_fin, p.muestras_gps,
               p.coordenadas_distintas, p.timestamps_distintos,
               p.intervalo_maximo_seg,
               CONVERT(float, p.cobertura_temporal_pct) AS cobertura_temporal_pct,
               p.coordenadas_repetidas, p.estado_motor_dominante
        FROM dbo.GPS_Paradas p
        JOIN dbo.Vehiculos v ON v.id_vehiculo = p.id_vehiculo
        WHERE p.id_recorrido = @tripId
        ORDER BY p.fecha_inicio_utc ASC;
      `);

    return {
      recorrido,
      paradas: result.recordset.map((row) => ({
        idParada: Number(row.id_parada),
        idRecorrido: row.id_recorrido === null ? null : Number(row.id_recorrido),
        idVehiculo: row.id_vehiculo,
        placa: row.placa,
        fechaInicioUtc: row.fecha_inicio_utc.toISOString(),
        fechaFinUtc: row.fecha_fin_utc.toISOString(),
        duracionSegundos: row.duracion_segundos,
        latitud: row.latitud,
        longitud: row.longitud,
        tipoDeteccion: row.tipo_deteccion,
        tipoUbicacion: row.tipo_ubicacion,
        nivelConfianza: row.nivel_confianza,
        motivoConfianza: row.motivo_confianza,
        criterioDeteccion: row.criterio_deteccion,
        idSede: row.id_sede,
        versionAlgoritmo: row.version_algoritmo,
        idPosicionInicio: row.id_posicion_inicio === null ? null : Number(row.id_posicion_inicio),
        idPosicionFin: row.id_posicion_fin === null ? null : Number(row.id_posicion_fin),
        muestrasGps: row.muestras_gps,
        coordenadasDistintas: row.coordenadas_distintas,
        timestampsDistintos: row.timestamps_distintos,
        intervaloMaximoSeg: row.intervalo_maximo_seg,
        coberturaTemporalPct: row.cobertura_temporal_pct,
        coordenadasRepetidas: Boolean(row.coordenadas_repetidas),
        estadoMotorDominante: row.estado_motor_dominante,
      })),
    };
  }

  /**
   * Devuelve una muestra estratificada por nivel de confianza para validación
   * manual contra controles de acceso o partes del conductor.
   */
  async getStopsSample(filters?: {
    date?: string;
    vehicleId?: number;
    perLevel?: number;
  }): Promise<StopManualSample[]> {
    const perLevel = Math.min(50, Math.max(1, filters?.perLevel ?? 5));
    const pool = await this.database.pool;
    const req = pool.request().input('perLevel', sql.Int, perLevel);

    let where = '1=1';
    if (filters?.date) {
      req.input('targetDate', sql.VarChar(10), filters.date);
      where += ` AND CONVERT(varchar(10), DATEADD(hour, -5, p.fecha_inicio_utc), 120) = @targetDate`;
    }
    if (filters?.vehicleId) {
      req.input('vId', sql.Int, filters.vehicleId);
      where += ` AND p.id_vehiculo = @vId`;
    }

    const result = await req.query<{
      id_parada: number;
      id_recorrido: number | null;
      id_vehiculo: number;
      placa: string;
      estado_recorrido: string | null;
      fecha_inicio_utc: Date;
      fecha_fin_utc: Date;
      duracion_segundos: number;
      latitud: number;
      longitud: number;
      tipo_deteccion: string;
      tipo_ubicacion: string;
      nivel_confianza: string;
      motivo_confianza: string | null;
      criterio_deteccion: string;
      version_algoritmo: string;
      id_posicion_inicio: number | null;
      id_posicion_fin: number | null;
      muestras_gps: number;
      coordenadas_distintas: number;
      timestamps_distintos: number;
      intervalo_maximo_seg: number;
      cobertura_temporal_pct: number;
    }>(`
      WITH ranked AS (
        SELECT p.id_parada, p.id_recorrido, p.id_vehiculo, v.placa,
               r.estado AS estado_recorrido,
               p.fecha_inicio_utc, p.fecha_fin_utc, p.duracion_segundos,
               CONVERT(float, p.latitud) AS latitud,
               CONVERT(float, p.longitud) AS longitud,
               p.tipo_deteccion, p.tipo_ubicacion, p.nivel_confianza,
               p.motivo_confianza, p.criterio_deteccion, p.version_algoritmo,
               p.id_posicion_inicio, p.id_posicion_fin, p.muestras_gps,
               p.coordenadas_distintas, p.timestamps_distintos,
               p.intervalo_maximo_seg,
               CONVERT(float, p.cobertura_temporal_pct) AS cobertura_temporal_pct,
               ROW_NUMBER() OVER (
                 PARTITION BY p.nivel_confianza
                 ORDER BY NEWID()
               ) AS rn
        FROM dbo.GPS_Paradas p
        JOIN dbo.Vehiculos v ON v.id_vehiculo = p.id_vehiculo
        LEFT JOIN dbo.GPS_Recorridos r ON r.id_recorrido = p.id_recorrido
        WHERE ${where}
      )
      SELECT id_parada, id_recorrido, id_vehiculo, placa, estado_recorrido,
             fecha_inicio_utc, fecha_fin_utc, duracion_segundos,
             latitud, longitud, tipo_deteccion, tipo_ubicacion,
             nivel_confianza, motivo_confianza, criterio_deteccion, version_algoritmo,
             id_posicion_inicio, id_posicion_fin, muestras_gps,
             coordenadas_distintas, timestamps_distintos,
             intervalo_maximo_seg, cobertura_temporal_pct
      FROM ranked
      WHERE rn <= @perLevel
      ORDER BY CASE nivel_confianza WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
               fecha_inicio_utc DESC;
    `);

    return result.recordset.map((row) => ({
      idParada: Number(row.id_parada),
      idRecorrido: row.id_recorrido === null ? null : Number(row.id_recorrido),
      idVehiculo: row.id_vehiculo,
      placa: row.placa,
      estadoRecorrido: row.estado_recorrido,
      fechaInicioUtc: row.fecha_inicio_utc.toISOString(),
      fechaFinUtc: row.fecha_fin_utc.toISOString(),
      duracionSegundos: row.duracion_segundos,
      latitud: row.latitud,
      longitud: row.longitud,
      tipoDeteccion: row.tipo_deteccion,
      tipoUbicacion: row.tipo_ubicacion,
      nivelConfianza: row.nivel_confianza,
      motivoConfianza: row.motivo_confianza,
      criterioDeteccion: row.criterio_deteccion,
      versionAlgoritmo: row.version_algoritmo,
      idPosicionInicio: row.id_posicion_inicio === null ? null : Number(row.id_posicion_inicio),
      idPosicionFin: row.id_posicion_fin === null ? null : Number(row.id_posicion_fin),
      muestrasGps: row.muestras_gps,
      coordenadasDistintas: row.coordenadas_distintas,
      timestampsDistintos: row.timestamps_distintos,
      intervaloMaximoSeg: row.intervalo_maximo_seg,
      coberturaTemporalPct: row.cobertura_temporal_pct,
      requiereValidacionFisica: true,
    }));
  }

  /**
   * Audita la integridad entre eventos, recorridos y paradas.
   * No corrige datos: sirve como tablero de control antes de usar el dataset.
   */
  async getIntegrityReport(): Promise<TripsIntegrityReport> {
    const pool = await this.database.pool;

    const totalsResult = await pool.request().query<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*) FROM dbo.GPS_Posiciones) AS posiciones,
        (SELECT COUNT(*) FROM dbo.GPS_GeocercaEventos WHERE estado <> 'DESCARTADO') AS eventosVigentes,
        (SELECT COUNT(*) FROM dbo.GPS_Recorridos) AS recorridos,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas) AS paradas
    `);

    const checksResult = await pool.request().query<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*) FROM dbo.GPS_Paradas WHERE id_recorrido IS NULL) AS paradasSinRecorrido,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas p
           JOIN dbo.GPS_Recorridos r ON r.id_recorrido = p.id_recorrido
          WHERE p.fecha_inicio_utc < r.fecha_inicio_utc
             OR (r.fecha_fin_utc IS NOT NULL AND p.fecha_fin_utc > r.fecha_fin_utc)) AS paradasFueraDeIntervalo,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas p
           JOIN dbo.GPS_Recorridos r ON r.id_recorrido = p.id_recorrido
          WHERE p.id_vehiculo <> r.id_vehiculo) AS paradasVehiculoInconsistente,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas
          WHERE id_posicion_inicio IS NULL OR id_posicion_fin IS NULL) AS paradasSinTrazabilidad,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas
          WHERE version_algoritmo IS NULL OR LTRIM(RTRIM(version_algoritmo)) = '') AS paradasSinVersion,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas
          WHERE tipo_ubicacion = 'SEDE' AND id_sede IS NULL) AS paradasSedeSinIdSede,
        (SELECT COUNT(*) FROM dbo.GPS_Paradas
          WHERE fecha_fin_utc < fecha_inicio_utc) AS paradasIntervaloInvalido,
        (SELECT COUNT(*) FROM (
           SELECT p.id_vehiculo, p.fecha_inicio_utc
           FROM dbo.GPS_Paradas p
           GROUP BY p.id_vehiculo, p.fecha_inicio_utc
           HAVING COUNT(*) > 1
         ) duplicadas) AS paradasDuplicadas,
        (SELECT COUNT(*) FROM (
           SELECT r.id_recorrido
           FROM dbo.GPS_Recorridos r
           LEFT JOIN dbo.GPS_Paradas p ON p.id_recorrido = r.id_recorrido
           GROUP BY r.id_recorrido, r.cantidad_paradas
           HAVING r.cantidad_paradas <> COUNT(p.id_parada)
         ) conteo) AS recorridosConConteoInconsistente,
        (SELECT COUNT(*) FROM (
           SELECT r.id_recorrido
           FROM dbo.GPS_Recorridos r
           LEFT JOIN dbo.GPS_Paradas p ON p.id_recorrido = r.id_recorrido
           GROUP BY r.id_recorrido, r.duracion_paradas_seg
           HAVING r.duracion_paradas_seg <> ISNULL(SUM(p.duracion_segundos), 0)
         ) duracion) AS recorridosConDuracionInconsistente,
        (SELECT COUNT(*) FROM dbo.GPS_Recorridos WHERE id_evento_salida IS NULL) AS recorridosSinEventoSalida,
        (SELECT COUNT(*) FROM dbo.GPS_Recorridos r
           JOIN dbo.GPS_GeocercaEventos e ON e.id_evento = r.id_evento_salida
          WHERE e.estado = 'DESCARTADO') AS recorridosConOrigenDescartado,
        (SELECT COUNT(*) FROM dbo.GPS_Recorridos
          WHERE version_algoritmo IS NULL OR LTRIM(RTRIM(version_algoritmo)) = '') AS recorridosSinVersion,
        (SELECT COUNT(*) FROM dbo.GPS_Recorridos r
          WHERE NOT EXISTS (
            SELECT 1 FROM dbo.GPS_Paradas p WHERE p.id_recorrido = r.id_recorrido
          )) AS recorridosSinParadas,
        (SELECT COUNT(*) FROM dbo.GPS_GeocercaEventos e
          WHERE e.tipo_evento = 'SALIDA' AND e.estado <> 'DESCARTADO'
            AND NOT EXISTS (
              SELECT 1 FROM dbo.GPS_GeocercaEventos x
              WHERE x.id_vehiculo = e.id_vehiculo
                AND x.tipo_evento = 'ENTRADA' AND x.estado <> 'DESCARTADO'
                AND x.fecha_gps_utc > e.fecha_gps_utc
                AND NOT EXISTS (
                  SELECT 1 FROM dbo.GPS_GeocercaEventos y
                  WHERE y.id_vehiculo = e.id_vehiculo
                    AND y.tipo_evento = 'SALIDA' AND y.estado <> 'DESCARTADO'
                    AND y.fecha_gps_utc > e.fecha_gps_utc
                    AND y.fecha_gps_utc < x.fecha_gps_utc
                )
            )) AS salidasSinRetorno,
        (SELECT COUNT(*) FROM dbo.GPS_GeocercaEventos e
          WHERE e.tipo_evento = 'ENTRADA' AND e.estado <> 'DESCARTADO'
            AND NOT EXISTS (
              SELECT 1 FROM dbo.GPS_GeocercaEventos x
              WHERE x.id_vehiculo = e.id_vehiculo
                AND x.tipo_evento = 'SALIDA' AND x.estado <> 'DESCARTADO'
                AND x.fecha_gps_utc < e.fecha_gps_utc
                AND NOT EXISTS (
                  SELECT 1 FROM dbo.GPS_GeocercaEventos y
                  WHERE y.id_vehiculo = e.id_vehiculo
                    AND y.tipo_evento = 'ENTRADA' AND y.estado <> 'DESCARTADO'
                    AND y.fecha_gps_utc > x.fecha_gps_utc
                    AND y.fecha_gps_utc < e.fecha_gps_utc
                )
            )) AS entradasSinSalida
    `);

    const distributionResult = await pool.request().query<{
      tipo: string;
      valor: string;
      cantidad: number;
    }>(`
      SELECT 'estado' AS tipo, estado AS valor, COUNT(*) AS cantidad
      FROM dbo.GPS_Recorridos GROUP BY estado
      UNION ALL
      SELECT 'confianza', nivel_confianza, COUNT(*)
      FROM dbo.GPS_Paradas GROUP BY nivel_confianza
      UNION ALL
      SELECT 'ubicacion', tipo_ubicacion, COUNT(*)
      FROM dbo.GPS_Paradas GROUP BY tipo_ubicacion
      UNION ALL
      SELECT 'version', ISNULL(version_algoritmo, '(sin versión)'), COUNT(*)
      FROM dbo.GPS_Recorridos GROUP BY version_algoritmo;
    `);

    const controls = checksResult.recordset[0] ?? {};
    const resumen = (totalsResult.recordset[0] ?? {
      posiciones: 0,
      eventosVigentes: 0,
      recorridos: 0,
      paradas: 0,
    }) as TripsIntegrityReport['resumen'];

    const incidencias: TripsIntegrityReport['incidencias'] = [];
    const addIncidence = (
      codigo: string,
      severidad: 'ERROR' | 'ADVERTENCIA' | 'INFO',
      descripcion: string,
      cantidad: number,
    ) => {
      if (cantidad > 0) incidencias.push({ codigo, severidad, descripcion, cantidad });
    };

    addIncidence(
      'PARADAS_SIN_RECORRIDO',
      'ERROR',
      'Paradas sin id_recorrido: no se pueden atribuir a un viaje.',
      controls.paradasSinRecorrido,
    );
    addIncidence(
      'PARADAS_FUERA_DE_INTERVALO',
      'ERROR',
      'Paradas cuya fecha no cae dentro del intervalo de su recorrido.',
      controls.paradasFueraDeIntervalo,
    );
    addIncidence(
      'PARADAS_VEHICULO_INCONSISTENTE',
      'ERROR',
      'Paradas cuyo vehículo no coincide con el del recorrido.',
      controls.paradasVehiculoInconsistente,
    );
    addIncidence(
      'PARADAS_DUPLICADAS',
      'ERROR',
      'Más de una parada del mismo vehículo con el mismo inicio.',
      controls.paradasDuplicadas,
    );
    addIncidence(
      'PARADAS_INTERVALO_INVALIDO',
      'ERROR',
      'Paradas con fecha de fin anterior a la fecha de inicio.',
      controls.paradasIntervaloInvalido,
    );
    addIncidence(
      'RECORRIDO_CON_CONTEO_INCONSISTENTE',
      'ADVERTENCIA',
      'cantidad_paradas difiere de las paradas realmente asociadas.',
      controls.recorridosConConteoInconsistente,
    );
    addIncidence(
      'RECORRIDO_CON_DURACION_INCONSISTENTE',
      'ADVERTENCIA',
      'duracion_paradas_seg difiere de la suma de sus paradas.',
      controls.recorridosConDuracionInconsistente,
    );
    addIncidence(
      'PARADAS_SIN_TRAZABILIDAD',
      'ADVERTENCIA',
      'Paradas sin id_posicion_inicio o id_posicion_fin.',
      controls.paradasSinTrazabilidad,
    );
    addIncidence(
      'PARADAS_SIN_VERSION',
      'ADVERTENCIA',
      'Paradas sin versión de algoritmo; no son comparables entre sí.',
      controls.paradasSinVersion,
    );
    addIncidence(
      'RECORRIDOS_SIN_VERSION',
      'ADVERTENCIA',
      'Recorridos sin versión de algoritmo.',
      controls.recorridosSinVersion,
    );
    addIncidence(
      'PARADAS_SEDE_SIN_ID',
      'ADVERTENCIA',
      'Paradas clasificadas como SEDE pero sin id_sede.',
      controls.paradasSedeSinIdSede,
    );
    addIncidence(
      'RECORRIDO_SIN_EVENTO_SALIDA',
      'ADVERTENCIA',
      'Recorridos sin evento de salida asociado.',
      controls.recorridosSinEventoSalida,
    );
    addIncidence(
      'RECORRIDO_ORIGEN_DESCARTADO',
      'ADVERTENCIA',
      'Recorridos cuyo evento de salida fue descartado.',
      controls.recorridosConOrigenDescartado,
    );
    addIncidence(
      'SALIDAS_SIN_RETORNO',
      'INFO',
      'Salidas observadas sin ENTRADA posterior; el viaje queda abierto o incompleto.',
      controls.salidasSinRetorno,
    );
    addIncidence(
      'ENTRADAS_SIN_SALIDA',
      'INFO',
      'Entradas observadas sin SALIDA previa; no se inventa el origen.',
      controls.entradasSinSalida,
    );
    addIncidence(
      'RECORRIDOS_SIN_PARADAS',
      'INFO',
      'Recorridos sin paradas detectadas (puede ser normal en viajes cortos).',
      controls.recorridosSinParadas,
    );

    const estado = incidencias.some((i) => i.severidad === 'ERROR')
      ? 'ERROR'
      : incidencias.some((i) => i.severidad === 'ADVERTENCIA')
        ? 'ADVERTENCIA'
        : 'OK';

    const distribution = (tipo: string) =>
      distributionResult.recordset
        .filter((row) => row.tipo === tipo)
        .map((row) => ({ valor: row.valor, cantidad: row.cantidad }));

    return {
      generadoEnUtc: new Date().toISOString(),
      estado,
      resumen,
      controles: controls,
      distribucion: {
        estados: distribution('estado'),
        confianza: distribution('confianza'),
        ubicacion: distribution('ubicacion'),
        versiones: distribution('version'),
      },
      incidencias,
    };
  }

  private resolveTripState(input: {
    isClosed: boolean;
    endReason: TripEndReason;
    gapCount: number;
    lastObservedAt: Date;
    now: number;
  }): TripSummary['estado'] {
    if (input.isClosed) {
      return input.gapCount > 3 ? 'PARCIAL' : 'FINALIZADO';
    }

    if (input.endReason === 'SIGUIENTE_SALIDA') {
      return 'INCOMPLETO';
    }

    const staleMs = OPEN_TRIP_STALE_HOURS * 60 * 60 * 1_000;
    if (input.now - input.lastObservedAt.getTime() > staleMs) {
      return 'INCOMPLETO';
    }

    return 'EN_CURSO';
  }

  private async loadGeofencesBySede(): Promise<Map<number, StoredGeofence[]>> {
    const geofences = await this.geofences.getActiveGeofences();
    const bySede = new Map<number, StoredGeofence[]>();
    for (const geofence of geofences) {
      const list = bySede.get(geofence.idSede) ?? [];
      list.push(geofence);
      bySede.set(geofence.idSede, list);
    }
    return bySede;
  }

  private resolveStopLocation(
    stop: DetectedGpsStop,
    geofencesBySede: Map<number, StoredGeofence[]>,
  ): { locationType: 'SEDE' | 'OTRA' | 'DESCONOCIDA'; idSede: number | null } {
    if (geofencesBySede.size === 0) {
      return { locationType: 'DESCONOCIDA', idSede: null };
    }

    for (const [idSede, geofences] of geofencesBySede) {
      const check = this.geofences.isInsideSede(
        { latitude: stop.latitude, longitude: stop.longitude },
        geofences,
        0,
      );
      if (check.inside) {
        return { locationType: 'SEDE', idSede };
      }
    }

    return { locationType: 'OTRA', idSede: null };
  }

  private async persistStops(input: {
    tripId: number;
    vehicleId: number;
    tripStart: Date;
    tripEnd: Date | null;
    stops: DetectedGpsStop[];
    geofencesBySede: Map<number, StoredGeofence[]>;
  }): Promise<{ created: number; updated: number; deleted: number }> {
    const pool = await this.database.pool;
    let created = 0;
    let updated = 0;

    for (const stop of input.stops) {
      const location = this.resolveStopLocation(stop, input.geofencesBySede);
      const stopUpsert = await pool
        .request()
        .input('recId', sql.BigInt, input.tripId)
        .input('vId', sql.Int, input.vehicleId)
        .input('start', sql.DateTime2(3), stop.startTime)
        .input('end', sql.DateTime2(3), stop.endTime)
        .input('lat', sql.Decimal(10, 7), stop.latitude)
        .input('lon', sql.Decimal(10, 7), stop.longitude)
        .input('durSec', sql.Int, stop.durationSeconds)
        .input('radio', sql.Decimal(10, 2), stop.radiusMeters)
        .input('tipoDet', sql.VarChar(20), stop.detectionType)
        .input('tipoUbic', sql.VarChar(20), location.locationType)
        .input('confianza', sql.VarChar(10), stop.confidence)
        .input('muestras', sql.Int, stop.samples)
        .input('coordsDist', sql.Int, stop.distinctCoordinates)
        .input('tsDist', sql.Int, stop.distinctGpsTimestamps)
        .input('maxGap', sql.Int, stop.maxGapSeconds)
        .input('cobertura', sql.Decimal(5, 2), stop.coverageRatioPct)
        .input('coordsRep', sql.Bit, stop.hasRepeatedCoordinates ? 1 : 0)
        .input('motor', sql.VarChar(20), stop.engineState)
        .input('idSede', sql.Int, location.idSede)
        .input('versionAlg', sql.VarChar(20), stop.algorithmVersion)
        .input('posInicio', sql.BigInt, stop.startPositionId ? Number(stop.startPositionId) : null)
        .input('posFin', sql.BigInt, stop.endPositionId ? Number(stop.endPositionId) : null)
        .input('motivo', sql.VarChar(255), stop.confidenceReason)
        .input('criterio', sql.VarChar(255), STOP_CRITERIA_LABEL)
        .query<{ inserted: number }>(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.GPS_Paradas WITH (UPDLOCK, HOLDLOCK)
            WHERE id_vehiculo = @vId AND fecha_inicio_utc = @start
          )
          BEGIN
            INSERT INTO dbo.GPS_Paradas (
              id_recorrido, id_vehiculo, fecha_inicio_utc, fecha_fin_utc,
              latitud, longitud, duracion_segundos, radio_observado_m,
              metodo, entrega_confirmada, tipo_deteccion, tipo_ubicacion,
              nivel_confianza, muestras_gps, coordenadas_distintas,
              timestamps_distintos, intervalo_maximo_seg, cobertura_temporal_pct,
              coordenadas_repetidas, estado_motor_dominante, id_sede,
              version_algoritmo, id_posicion_inicio, id_posicion_fin, motivo_confianza,
              criterio_deteccion
            )
            VALUES (
              @recId, @vId, @start, @end,
              @lat, @lon, @durSec, @radio,
              'OBSERVADA', 0, @tipoDet, @tipoUbic,
              @confianza, @muestras, @coordsDist,
              @tsDist, @maxGap, @cobertura,
              @coordsRep, @motor, @idSede,
              @versionAlg, @posInicio, @posFin, @motivo,
              @criterio
            );
            SELECT 1 AS inserted;
          END
          ELSE
          BEGIN
            UPDATE dbo.GPS_Paradas
            SET id_recorrido = @recId,
                fecha_fin_utc = @end,
                duracion_segundos = @durSec,
                radio_observado_m = @radio,
                tipo_deteccion = @tipoDet,
                tipo_ubicacion = @tipoUbic,
                nivel_confianza = @confianza,
                muestras_gps = @muestras,
                coordenadas_distintas = @coordsDist,
                timestamps_distintos = @tsDist,
                intervalo_maximo_seg = @maxGap,
                cobertura_temporal_pct = @cobertura,
                coordenadas_repetidas = @coordsRep,
                estado_motor_dominante = @motor,
                id_sede = @idSede,
                version_algoritmo = @versionAlg,
                id_posicion_inicio = @posInicio,
                id_posicion_fin = @posFin,
                motivo_confianza = @motivo,
                criterio_deteccion = @criterio,
                fecha_procesamiento_utc = SYSUTCDATETIME()
            WHERE id_vehiculo = @vId AND fecha_inicio_utc = @start;
            SELECT 0 AS inserted;
          END;
        `);

      if (Number(stopUpsert.recordset[0]?.inserted) === 1) created += 1;
      else updated += 1;
    }

    // Elimina paradas obsoletas del intervalo: si el detector actual ya no las
    // produce, no deben seguir contando como evidencia del recorrido.
    const deleteRequest = pool
      .request()
      .input('vId', sql.Int, input.vehicleId)
      .input('tripStart', sql.DateTime2(3), input.tripStart);

    let deleteSql = `DELETE FROM dbo.GPS_Paradas
                     WHERE id_vehiculo = @vId AND fecha_inicio_utc >= @tripStart`;

    if (input.tripEnd) {
      deleteRequest.input('tripEnd', sql.DateTime2(3), input.tripEnd);
      deleteSql += ` AND fecha_inicio_utc <= @tripEnd`;
    }

    if (input.stops.length > 0) {
      const placeholders = input.stops.map((stop, index) => {
        deleteRequest.input(`s${index}`, sql.DateTime2(3), stop.startTime);
        return `@s${index}`;
      });
      deleteSql += ` AND fecha_inicio_utc NOT IN (${placeholders.join(', ')})`;
    }

    const deleteResult = await deleteRequest.query(deleteSql);
    const deleted = deleteResult.rowsAffected[0] ?? 0;

    return { created, updated, deleted };
  }

  /**
   * Elimina los recorridos y paradas derivados de eventos de SALIDA que fueron
   * descartados. Son datos derivados: la fuente de verdad es el evento vigente.
   */
  private async pruneDiscardedTrips(vehicleId: number): Promise<void> {
    const pool = await this.database.pool;
    await pool
      .request()
      .input('vId', sql.Int, vehicleId)
      .query(`
        DELETE p
        FROM dbo.GPS_Paradas p
        JOIN dbo.GPS_Recorridos r ON r.id_recorrido = p.id_recorrido
        JOIN dbo.GPS_GeocercaEventos e ON e.id_evento = r.id_evento_salida
        WHERE r.id_vehiculo = @vId AND e.estado = 'DESCARTADO';

        DELETE r
        FROM dbo.GPS_Recorridos r
        JOIN dbo.GPS_GeocercaEventos e ON e.id_evento = r.id_evento_salida
        WHERE r.id_vehiculo = @vId AND e.estado = 'DESCARTADO';
      `);
  }

  /**
   * Reasigna cada parada al recorrido cuyo intervalo la contiene. Para viajes
   * abiertos se toma el recorrido más reciente, igual que en la consolidación.
   */
  private async reassignStopsToTrips(vehicleId: number): Promise<void> {
    const pool = await this.database.pool;
    await pool
      .request()
      .input('vId', sql.Int, vehicleId)
      .query(`
        UPDATE p
        SET id_recorrido = t.id_recorrido
        FROM dbo.GPS_Paradas p
        CROSS APPLY (
          SELECT TOP 1 r.id_recorrido
          FROM dbo.GPS_Recorridos r
          WHERE r.id_vehiculo = p.id_vehiculo
            AND p.fecha_inicio_utc >= r.fecha_inicio_utc
            AND (r.fecha_fin_utc IS NULL OR p.fecha_inicio_utc <= r.fecha_fin_utc)
          ORDER BY r.fecha_inicio_utc DESC
        ) t
        WHERE p.id_vehiculo = @vId
          AND (p.id_recorrido IS NULL OR p.id_recorrido <> t.id_recorrido);
      `);
  }

  private async refreshTripAggregates(vehicleId: number): Promise<void> {
    const pool = await this.database.pool;
    await pool
      .request()
      .input('vId', sql.Int, vehicleId)
      .input('version', sql.VarChar(20), STOP_ALGORITHM_VERSION)
      .query(`
        UPDATE r
        SET cantidad_paradas = ISNULL(x.cantidad, 0),
            duracion_paradas_seg = ISNULL(x.duracion, 0),
            version_algoritmo = ISNULL(r.version_algoritmo, @version)
        FROM dbo.GPS_Recorridos r
        OUTER APPLY (
          SELECT COUNT(*) AS cantidad,
                 ISNULL(SUM(p.duracion_segundos), 0) AS duracion
          FROM dbo.GPS_Paradas p
          WHERE p.id_recorrido = r.id_recorrido
        ) x
        WHERE r.id_vehiculo = @vId;
      `);
  }
}
