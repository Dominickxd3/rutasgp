import { Injectable, Logger } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface StoredGeofence {
  idGeocerca: string;
  idSede: number;
  sedeCodigo: string;
  sedeNombre: string;
  nombre: string;
  tipoForma: 'POLIGONO' | 'CIRCULO';
  vertices: LatLng[];
  radius?: number;
}

export interface GeofenceEventRecord {
  idEvento: number;
  idVehiculo: number;
  placa: string;
  idSede: number;
  sedeNombre: string;
  idGeocerca: string | null;
  geocercaNombre: string | null;
  tipoEvento: 'SALIDA' | 'ENTRADA';
  fechaGpsUtc: string;
  idPosicion: number;
  latitud: number;
  longitud: number;
  velocidadKmh: number;
  estado: string;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function polygonContains(point: LatLng, vertices: LatLng[]): boolean {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    const crosses = (a.latitude > point.latitude) !== (b.latitude > point.latitude);
    if (!crosses) continue;
    const lonAtLat =
      ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
        (b.latitude - a.latitude) +
      a.longitude;
    if (point.longitude < lonAtLat) inside = !inside;
  }
  return inside;
}

export function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const latMid = (toRadians(a.latitude) + toRadians(b.latitude)) / 2;
  const mPerLat = 111132.954;
  const mPerLon = 111412.84 * Math.cos(latMid);

  const px = (point.longitude - a.longitude) * mPerLon;
  const py = (point.latitude - a.latitude) * mPerLat;
  const bx = (b.longitude - a.longitude) * mPerLon;
  const by = (b.latitude - a.latitude) * mPerLat;

  const abLenSq = bx * bx + by * by;
  if (abLenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / abLenSq));
  const projX = t * bx;
  const projY = t * by;

  return Math.hypot(px - projX, py - projY);
}

export function distanceToPolygonMeters(point: LatLng, vertices: LatLng[]): number {
  if (polygonContains(point, vertices)) return 0;
  let minDistance = Infinity;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const d = distanceToSegmentMeters(point, vertices[j], vertices[i]);
    if (d < minDistance) minDistance = d;
  }
  return minDistance;
}

interface TransitionPoint {
  id: number;
  latitude: number;
  longitude: number;
  gpsDate: Date;
}

interface DetectionState {
  stable: boolean;
  candidate: boolean | null;
  confirmations: number;
  lastMatchingGeofence: string | null;
  lastGpsDate?: Date;
  lastInsidePoint?: TransitionPoint;
  firstCandidatePoint?: TransitionPoint;
  candidateMatchingGeofence?: string | null;
}

@Injectable()
export class GeofencesService {
  private readonly logger = new Logger(GeofencesService.name);
  private cachedGeofences: StoredGeofence[] | null = null;
  private lastCacheTime = 0;
  private readonly stateCache = new Map<string, DetectionState>();

  constructor(private readonly database: DatabaseService) {}

  private async getOrInitState(
    vehicleId: number,
    idSede: number,
    firstPoint: LatLng,
    geofencesOfSede: StoredGeofence[],
  ): Promise<DetectionState> {
    const key = `${vehicleId}-${idSede}`;
    const cached = this.stateCache.get(key);
    if (cached) return cached;

    const pool = await this.database.pool;
    const lastEventResult = await pool
      .request()
      .input('vId', sql.Int, vehicleId)
      .input('sId', sql.Int, idSede)
      .query<{ tipo_evento: string; fecha_gps_utc: Date; id_geocerca: string | null }>(`
        SELECT TOP 1 tipo_evento, fecha_gps_utc, id_geocerca
        FROM dbo.GPS_GeocercaEventos
        WHERE id_vehiculo = @vId AND id_sede = @sId
          AND estado <> 'DESCARTADO'
        ORDER BY fecha_gps_utc DESC;
      `);

    let state: DetectionState;
    if (lastEventResult.recordset.length > 0) {
      const row = lastEventResult.recordset[0];
      state = {
        stable: row.tipo_evento === 'ENTRADA',
        candidate: null,
        confirmations: 0,
        lastMatchingGeofence: row.id_geocerca,
        lastGpsDate: row.fecha_gps_utc,
      };
    } else {
      // Si no existe evento previo, inicializamos con su ubicación observada sin generar evento
      const check = this.isInsideSede(firstPoint, geofencesOfSede, 0);
      state = {
        stable: check.inside,
        candidate: null,
        confirmations: 0,
        lastMatchingGeofence: check.matchingGeofenceId,
      };
    }

    this.stateCache.set(key, state);
    return state;
  }

  async getActiveGeofences(): Promise<StoredGeofence[]> {
    const now = Date.now();
    if (this.cachedGeofences && now - this.lastCacheTime < 30_000) {
      return this.cachedGeofences;
    }

    try {
      const pool = await this.database.pool;
      const result = await pool.request().query<{
        id_geocerca: string;
        id_sede: number;
        codigo_sede: string;
        sede_nombre: string;
        nombre: string;
        tipo_forma: string;
        geometria_json: string;
      }>(`
        SELECT g.id_geocerca, g.id_sede, s.codigo_sede, s.nombre AS sede_nombre,
               g.nombre, g.tipo_forma, g.geometria_json
        FROM dbo.GPS_Geocercas g
        JOIN dbo.GPS_Sedes s ON s.id_sede = g.id_sede
        WHERE g.activo = 1 AND s.activo = 1
        ORDER BY s.id_sede, g.nombre;
      `);

      this.cachedGeofences = result.recordset.map((row) => {
        let vertices: LatLng[] = [];
        let radius: number | undefined;
        try {
          const parsed = JSON.parse(row.geometria_json) as {
            vertices?: LatLng[];
            radius?: number;
          };
          if (Array.isArray(parsed.vertices)) {
            vertices = parsed.vertices;
          }
          if (typeof parsed.radius === 'number') {
            radius = parsed.radius;
          }
        } catch {
          // fallback
        }
        return {
          idGeocerca: row.id_geocerca,
          idSede: row.id_sede,
          sedeCodigo: row.codigo_sede,
          sedeNombre: row.sede_nombre,
          nombre: row.nombre,
          tipoForma: row.tipo_forma as 'POLIGONO' | 'CIRCULO',
          vertices,
          radius,
        };
      });

      this.lastCacheTime = now;
      return this.cachedGeofences;
    } catch (error) {
      this.logger.warn(`No se pudieron cargar las geocercas desde BD: ${error}`);
      return [];
    }
  }

  /**
   * Evalúa si un punto se encuentra en la sede compuesta por múltiples geocercas.
   * Aplica tolerancia de 20 metros (histéresis espacial) cuando el estado previo es 'dentro'.
   */
  isInsideSede(
    location: LatLng,
    geofencesOfSede: StoredGeofence[],
    toleranceMeters: number,
  ): { inside: boolean; matchingGeofenceId: string | null } {
    for (const geofence of geofencesOfSede) {
      if (geofence.tipoForma === 'POLIGONO') {
        if (polygonContains(location, geofence.vertices)) {
          return { inside: true, matchingGeofenceId: geofence.idGeocerca };
        }
        if (
          toleranceMeters > 0 &&
          distanceToPolygonMeters(location, geofence.vertices) <= toleranceMeters
        ) {
          return { inside: true, matchingGeofenceId: geofence.idGeocerca };
        }
      }
    }
    return { inside: false, matchingGeofenceId: null };
  }

  /**
   * Procesa cronológicamente una secuencia de posiciones de un vehículo
   * e inserta de forma idempotente eventos de SALIDA y ENTRADA en dbo.GPS_GeocercaEventos.
   */
  async evaluatePositions(
    vehicleId: number,
    points: Array<{
      id: number;
      latitude: number;
      longitude: number;
      gpsDate: Date;
    }>,
  ): Promise<number> {
    if (points.length === 0) return 0;

    const geofences = await this.getActiveGeofences();
    if (geofences.length === 0) return 0;

    // Agrupar geocercas por sede (ej. Grupo Pecuario S.A.C.)
    const sedeMap = new Map<number, StoredGeofence[]>();
    for (const g of geofences) {
      const list = sedeMap.get(g.idSede) ?? [];
      list.push(g);
      sedeMap.set(g.idSede, list);
    }

    const pool = await this.database.pool;
    let eventsCreated = 0;

    // Ordenar puntos cronológicamente
    const sortedPoints = [...points].sort((a, b) => a.gpsDate.getTime() - b.gpsDate.getTime());

    for (const [idSede, geofencesOfSede] of sedeMap.entries()) {
      const state = await this.getOrInitState(
        vehicleId,
        idSede,
        { latitude: sortedPoints[0].latitude, longitude: sortedPoints[0].longitude },
        geofencesOfSede,
      );

      if (state.stable && !state.lastInsidePoint && sortedPoints.length > 0) {
        const firstCheck = this.isInsideSede(
          { latitude: sortedPoints[0].latitude, longitude: sortedPoints[0].longitude },
          geofencesOfSede,
          20,
        );
        if (firstCheck.inside) {
          state.lastInsidePoint = sortedPoints[0];
        }
      }

      for (const point of sortedPoints) {
        // Ignorar lecturas duplicadas o desordenadas en el tiempo
        if (state.lastGpsDate && point.gpsDate.getTime() <= state.lastGpsDate.getTime()) {
          continue;
        }

        const location: LatLng = { latitude: point.latitude, longitude: point.longitude };
        const tolerance = state.stable ? 20 : 0;
        const check = this.isInsideSede(location, geofencesOfSede, tolerance);

        if (check.matchingGeofenceId) {
          state.lastMatchingGeofence = check.matchingGeofenceId;
        }

        state.lastGpsDate = point.gpsDate;

        if (check.inside === state.stable) {
          state.candidate = null;
          state.confirmations = 0;
          state.firstCandidatePoint = undefined;
          if (state.stable) {
            state.lastInsidePoint = point;
          }
          continue;
        }

        if (state.candidate !== check.inside) {
          state.candidate = check.inside;
          state.confirmations = 1;
          state.firstCandidatePoint = point;
          state.candidateMatchingGeofence = check.matchingGeofenceId ?? state.lastMatchingGeofence;
        } else {
          state.confirmations += 1;
        }

        if (state.confirmations >= 3) {
          state.stable = check.inside;
          state.candidate = null;
          state.confirmations = 0;
          const tipoEvento = state.stable ? 'ENTRADA' : 'SALIDA';

          // El punto de transición representativo:
          // SALIDA: último punto observado dentro de la sede (o primer candidato en la salida)
          // ENTRADA: primer punto observado al cruzar hacia adentro de la sede
          const eventPoint = tipoEvento === 'SALIDA'
            ? (state.lastInsidePoint ?? state.firstCandidatePoint ?? point)
            : (state.firstCandidatePoint ?? point);

          // Una salida requiere evidencia observada dentro de la sede en esta
          // secuencia. Si la primera señal ya llegó desde una avenida, solo
          // estabilizamos el estado como "fuera" y dejamos el origen desconocido.
          if (tipoEvento === 'SALIDA' && !state.lastInsidePoint) {
            this.logger.warn(
              `Vehículo ${vehicleId}: origen no observado para sede ${idSede}; ` +
              'no se registra una SALIDA ficticia.',
            );
            state.firstCandidatePoint = undefined;
            continue;
          }

          const eventGeofence = tipoEvento === 'SALIDA'
            ? state.lastMatchingGeofence
            : (state.candidateMatchingGeofence ?? state.lastMatchingGeofence);

          state.firstCandidatePoint = undefined;
          if (state.stable) {
            state.lastInsidePoint = point;
          }

          // Inserción idempotente en SQL Server
          const insertResult = await pool
            .request()
            .input('vehicleId', sql.Int, vehicleId)
            .input('sedeId', sql.Int, idSede)
            .input('geofenceId', sql.VarChar(50), eventGeofence)
            .input('tipoEvento', sql.VarChar(20), tipoEvento)
            .input('gpsDate', sql.DateTime2(3), eventPoint.gpsDate)
            .input('positionId', sql.BigInt, eventPoint.id)
            .query<{ inserted: number }>(`
              IF NOT EXISTS (
                SELECT 1 FROM dbo.GPS_GeocercaEventos WITH (UPDLOCK, HOLDLOCK)
                WHERE id_vehiculo = @vehicleId 
                  AND id_sede = @sedeId 
                  AND tipo_evento = @tipoEvento 
                  AND fecha_gps_utc = @gpsDate
              )
              BEGIN
                INSERT INTO dbo.GPS_GeocercaEventos 
                  (id_vehiculo, id_sede, id_geocerca, tipo_evento, fecha_gps_utc, id_posicion, estado)
                VALUES 
                  (@vehicleId, @sedeId, @geofenceId, @tipoEvento, @gpsDate, @positionId, 'OBSERVADO');
                SELECT 1 AS inserted;
              END
              ELSE
                SELECT 0 AS inserted;
            `);

          if (insertResult.recordset[0]?.inserted === 1) {
            eventsCreated += 1;
            this.logger.log(
              `Evento de Geocerca: Vehículo ${vehicleId} confirmó ${tipoEvento} en sede ${idSede} el ${eventPoint.gpsDate.toISOString()} (pos ${eventPoint.id})`,
            );
          }
        }
      }
    }

    return eventsCreated;
  }

  /**
   * Sincroniza retroactivamente los eventos de geocercas para las posiciones históricas.
   */
  async syncHistoricalEvents(vehicleId?: number): Promise<{ totalEvents: number }> {
    const pool = await this.database.pool;
    const vehicleRequest = pool.request();
    if (vehicleId) {
      vehicleRequest.input('vehicleId', sql.Int, vehicleId);
    }
    const vehiclesResult = await vehicleRequest.query<{ id_vehiculo: number }>(`
      SELECT id_vehiculo FROM dbo.Vehiculos
      ${vehicleId ? 'WHERE id_vehiculo = @vehicleId' : ''}
      ORDER BY id_vehiculo;
    `);

    let totalEvents = 0;

    for (const row of vehiclesResult.recordset) {
      const positionsResult = await pool
        .request()
        .input('vId', sql.Int, row.id_vehiculo)
        .query<{ id: number; latitude: number; longitude: number; gpsDate: Date }>(`
          SELECT id_posicion AS id, 
                 CONVERT(float, latitud) AS latitude, 
                 CONVERT(float, longitud) AS longitude, 
                 fecha_gps_utc AS gpsDate
          FROM dbo.GPS_Posiciones
          WHERE id_vehiculo = @vId
          ORDER BY fecha_gps_utc, id_posicion;
        `);

      const events = await this.evaluatePositions(row.id_vehiculo, positionsResult.recordset);
      totalEvents += events;
    }

    return { totalEvents };
  }

  /**
   * Consulta los eventos registrados en dbo.GPS_GeocercaEventos.
   */
  async getEvents(
    vehicleId?: number,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<GeofenceEventRecord[]> {
    const pool = await this.database.pool;
    const req = pool.request().input('limit', sql.Int, Math.min(Math.max(1, limit), 1000));

    let whereClause = '1=1';
    if (vehicleId) {
      req.input('vehicleId', sql.Int, vehicleId);
      whereClause += ' AND e.id_vehiculo = @vehicleId';
    }
    if (from) {
      req.input('from', sql.DateTime2(3), from);
      whereClause += ' AND e.fecha_gps_utc >= @from';
    }
    if (to) {
      req.input('to', sql.DateTime2(3), to);
      whereClause += ' AND e.fecha_gps_utc <= @to';
    }

    const result = await req.query<{
      id_evento: number;
      id_vehiculo: number;
      placa: string;
      id_sede: number;
      sede_nombre: string;
      id_geocerca: string | null;
      geocerca_nombre: string | null;
      tipo_evento: string;
      fecha_gps_utc: Date;
      id_posicion: number;
      latitud: number;
      longitud: number;
      velocidad_kmh: number;
      estado: string;
    }>(`
      SELECT TOP (@limit)
        e.id_evento, e.id_vehiculo, v.placa, e.id_sede, s.nombre AS sede_nombre,
        e.id_geocerca, g.nombre AS geocerca_nombre, e.tipo_evento, e.fecha_gps_utc,
        e.id_posicion, CONVERT(float, p.latitud) AS latitud, 
        CONVERT(float, p.longitud) AS longitud,
        CONVERT(float, p.velocidad_kmh) AS velocidad_kmh, e.estado
      FROM dbo.GPS_GeocercaEventos e
      JOIN dbo.Vehiculos v ON v.id_vehiculo = e.id_vehiculo
      JOIN dbo.GPS_Sedes s ON s.id_sede = e.id_sede
      LEFT JOIN dbo.GPS_Geocercas g ON g.id_geocerca = e.id_geocerca
      JOIN dbo.GPS_Posiciones p ON p.id_posicion = e.id_posicion
      WHERE ${whereClause}
      ORDER BY e.fecha_gps_utc DESC;
    `);

    return result.recordset.map((row) => ({
      idEvento: Number(row.id_evento),
      idVehiculo: row.id_vehiculo,
      placa: row.placa,
      idSede: row.id_sede,
      sedeNombre: row.sede_nombre,
      idGeocerca: row.id_geocerca,
      geocercaNombre: row.geocerca_nombre,
      tipoEvento: row.tipo_evento as 'SALIDA' | 'ENTRADA',
      fechaGpsUtc: row.fecha_gps_utc.toISOString(),
      idPosicion: Number(row.id_posicion),
      latitud: row.latitud,
      longitud: row.longitud,
      velocidadKmh: row.velocidad_kmh,
      estado: row.estado,
    }));
  }
}
