import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import { GeofencesService } from '../geofences/geofences.service';
import { sqlRequest } from '../database/sql-request';
import type {
  LiveStop,
  LiveTrack,
  LiveTrackPoint,
  MobileDeviceConfig,
  MobileDeviceRow,
  MobileEventBatch,
  MobileEventBatchResult,
  MobileLiveResult,
} from './mobile-device.types';
import { OsrmService } from '../history/osrm.service';
import {
  compareTracks, downsample, phoneVehicleIdentity, segmentsForMatching, trackKm, type TrackPoint,
} from './track-comparison';

/** Tiempo máximo que la consulta en vivo espera al ajuste a calles. */
const ROAD_WAIT_MS = 12_000;

interface AssignedVehicleRow {
  id_vehiculo: number | null;
  id_unidad_proveedor: number | null;
  placa: string | null;
}

@Injectable()
export class MobileDeviceService {
  private readonly logger = new Logger(MobileDeviceService.name);

  /** Último recorrido ajustado a calles por vehículo, para no repetir OSRM en cada consulta. */
  private readonly roadMemo = new Map<number, { key: string; road: LiveTrack['road']; pending: Promise<void> | null }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly geofences: GeofencesService,
    private readonly osrm: OsrmService,
  ) {}

  /**
   * Ajusta el recorrido a las calles con OSRM (mismo servicio que Historial).
   * Espera como máximo ROAD_WAIT_MS: si OSRM tarda, devuelve el último trazado
   * ya calculado y termina en segundo plano para la siguiente consulta.
   */
  private async roadFor(vehicleId: number, points: TrackPoint[]): Promise<LiveTrack['road']> {
    const segments = segmentsForMatching(points);
    // Vehículo quieto (solo deriva del GPS): no hay recorrido que dibujar
    if (segments.length === 0) return [];
    // Mientras OSRM no responde: tramos depurados (sin la deriva), marcados como estimados
    const cleaned = segments.map((segment) => ({
      coordinates: segment.map((pt) => [pt.longitude, pt.latitude] as [number, number]),
      kind: 'estimated' as const,
    }));
    const lastSegment = segments.at(-1)!;
    const key = `${segments.length}:${segments.reduce((n, s) => n + s.length, 0)}:${lastSegment.at(-1)!.time}`;
    const memo = this.roadMemo.get(vehicleId);
    if (memo?.key === key && memo.road) return memo.road;

    if (!memo?.pending) {
      const pending = this.osrm
        .matchSegments(segments.map((segment) => segment.map((pt) => ({
          latitude: pt.latitude,
          longitude: pt.longitude,
          gpsDate: new Date(pt.time),
        }))))
        .then((result) => {
          this.roadMemo.set(vehicleId, {
            key,
            road: result.map((part) => ({ coordinates: part.coordinates, kind: part.kind })),
            pending: null,
          });
        })
        .catch((error: unknown) => {
          this.logger.warn(`No se pudo ajustar a calles el recorrido ${vehicleId}: ${error instanceof Error ? error.message : error}`);
          const current = this.roadMemo.get(vehicleId);
          if (current) current.pending = null;
        });
      this.roadMemo.set(vehicleId, { key: memo?.key ?? '', road: memo?.road ?? null, pending });
    }
    const waiting = this.roadMemo.get(vehicleId)!.pending;
    if (waiting) await Promise.race([waiting, new Promise((resolve) => setTimeout(resolve, ROAD_WAIT_MS))]);
    return this.roadMemo.get(vehicleId)?.road ?? cleaned;
  }

  /**
   * Registra el contacto del celular (si es nuevo queda "pendiente de asignar")
   * y devuelve el camión asignado desde la web y las geocercas activas.
   */
  async config(deviceId: string, username: string | null, model: string | null): Promise<MobileDeviceConfig> {
    const pool = await this.database.pool;
    const result = await pool.request()
      .input('deviceId', sql.VarChar(128), deviceId)
      .input('username', sql.VarChar(50), username)
      .input('model', sql.NVarChar(120), model)
      .query<AssignedVehicleRow>(`
        MERGE dbo.GPS_DispositivosMoviles WITH (HOLDLOCK) AS d
        USING (SELECT @deviceId AS device_id) AS s ON d.device_id = s.device_id
        WHEN MATCHED THEN UPDATE SET
          ultimo_contacto_utc = sysutcdatetime(),
          ultimo_usuario = COALESCE(@username, d.ultimo_usuario),
          modelo = COALESCE(@model, d.modelo)
        WHEN NOT MATCHED THEN INSERT (device_id, modelo, ultimo_usuario)
          VALUES (@deviceId, @model, @username);

        SELECT v.id_vehiculo, v.id_unidad_proveedor, v.placa
        FROM dbo.GPS_DispositivosMoviles d
        LEFT JOIN dbo.Vehiculos v ON v.id_vehiculo = d.id_vehiculo AND v.activo = 1
        WHERE d.device_id = @deviceId AND d.activo = 1;
      `);

    const row = result.recordset[0];
    const vehicle = row?.id_vehiculo && row.id_unidad_proveedor && row.placa
      ? { providerUnitId: Number(row.id_unidad_proveedor), plate: row.placa.trim(), name: row.placa.trim() }
      : null;

    // Las geocercas de la web son las sedes de la empresa (almacenes): tipo BASE.
    const stored = await this.geofences.getActiveGeofences();
    const geofences = stored
      .filter((g) => g.tipoForma === 'POLIGONO' && g.vertices.length >= 3)
      .map((g) => ({
        id: g.idGeocerca,
        name: g.nombre === g.sedeNombre ? g.nombre : `${g.sedeNombre} - ${g.nombre}`,
        type: 'BASE' as const,
        shape: 'polygon' as const,
        points: g.vertices.map((v) => [v.latitude, v.longitude] as [number, number]),
      }));

    return {
      assigned: vehicle !== null,
      configVersion: new Date().toISOString(),
      vehicle,
      // La web aún no guarda coordenadas de clientes, por eso no hay paradas de ruta.
      route: null,
      geofences,
    };
  }

  /** Guarda de forma idempotente los eventos de paradas y geocercas del celular. */
  async ingestEvents(batch: MobileEventBatch): Promise<MobileEventBatchResult> {
    const pool = await this.database.pool;
    const transaction = new sql.Transaction(pool);
    const processedIds: string[] = [];
    let inserted = 0;
    let duplicates = 0;

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      for (const ev of batch.events) {
        const result = await new sql.Request(transaction)
          .input('id', sql.UniqueIdentifier, ev.id)
          .input('deviceId', sql.VarChar(128), batch.deviceId)
          .input('providerId', sql.Int, batch.providerUnitId)
          .input('plate', sql.VarChar(15), batch.plate)
          .input('type', sql.VarChar(20), ev.type)
          .input('stopType', sql.VarChar(20), ev.stopType)
          .input('gpsDate', sql.DateTime2(3), new Date(ev.timestamp))
          .input('start', sql.DateTime2(3), ev.startTimestamp === null ? null : new Date(ev.startTimestamp))
          .input('end', sql.DateTime2(3), ev.endTimestamp === null ? null : new Date(ev.endTimestamp))
          .input('duration', sql.Int, ev.durationSeconds)
          .input('latitude', sql.Decimal(10, 7), ev.latitude)
          .input('longitude', sql.Decimal(10, 7), ev.longitude)
          .input('routeId', sql.BigInt, ev.routeId)
          .input('routeStopId', sql.BigInt, ev.routeStopId)
          .input('geofenceId', sql.NVarChar(64), ev.geofenceId)
          .input('geofenceType', sql.VarChar(20), ev.geofenceType)
          .input('placeName', sql.NVarChar(150), ev.placeName)
          .input('offline', sql.Bit, ev.recordedOffline)
          .query<{ inserted: number }>(`
            IF NOT EXISTS (SELECT 1 FROM dbo.GPS_EventosMovil WITH (UPDLOCK, HOLDLOCK) WHERE id_evento = @id)
            BEGIN
              INSERT dbo.GPS_EventosMovil
                (id_evento, device_id, id_unidad_proveedor, placa, tipo, tipo_parada, fecha_gps_utc,
                 inicio_utc, fin_utc, duracion_s, latitud, longitud, id_ruta, id_parada_ruta,
                 id_geocerca, tipo_geocerca, nombre_lugar, registrado_sin_senal)
              VALUES
                (@id, @deviceId, @providerId, @plate, @type, @stopType, @gpsDate,
                 @start, @end, @duration, @latitude, @longitude, @routeId, @routeStopId,
                 @geofenceId, @geofenceType, @placeName, @offline);
              SELECT 1 AS inserted;
            END
            ELSE SELECT 0 AS inserted;
          `);
        processedIds.push(ev.id);
        if (Number(result.recordset[0]?.inserted) === 1) inserted += 1;
        else duplicates += 1;
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    await pool.request()
      .input('deviceId', sql.VarChar(128), batch.deviceId)
      .query('UPDATE dbo.GPS_DispositivosMoviles SET ultimo_contacto_utc = sysutcdatetime() WHERE device_id = @deviceId;')
      .catch(() => undefined);
    this.logger.log(`Móvil ${batch.deviceId}: ${inserted} eventos nuevos, ${duplicates} repetidos.`);
    return { processedIds, inserted, duplicates };
  }

  /** Celulares que han contactado la API, con su camión asignado. */
  async list(): Promise<MobileDeviceRow[]> {
    const pool = await this.database.pool;
    const result = await pool.request().query<MobileDeviceRow>(`
      SELECT d.device_id AS deviceId, d.modelo AS model, d.ultimo_usuario AS lastUser,
             d.primer_contacto_utc AS firstSeenAt, d.ultimo_contacto_utc AS lastSeenAt,
             d.id_vehiculo AS vehicleId, v.placa AS plate, v.id_unidad_proveedor AS providerUnitId,
             d.asignado_por AS assignedBy, d.fecha_asignacion_utc AS assignedAt,
             CONVERT(bit, d.activo) AS active
      FROM dbo.GPS_DispositivosMoviles d
      LEFT JOIN dbo.Vehiculos v ON v.id_vehiculo = d.id_vehiculo
      ORDER BY d.ultimo_contacto_utc DESC;
    `);
    return result.recordset;
  }

  /**
   * Recorrido de cada celular en el periodo, el de su camión asignado y la
   * comparación entre ambos. Ambos salen de dbo.GPS_Posiciones: el celular como
   * su propio vehículo CEL-xxxx y el camión como lo guarda el recolector GPS.
   */
  async live(
    from: Date,
    to: Date,
    /**
     * Para ver un solo celular comparado con un camión elegido en la web, sin
     * cambiar su asignación. compareVehicleId: número = ese camión; null = solo
     * el celular; undefined = el camión asignado.
     */
    options: { deviceId?: string; compareVehicleId?: number | null } = {},
  ): Promise<MobileLiveResult> {
    const pool = await this.database.pool;
    const deviceRequest = pool.request();
    if (options.deviceId) deviceRequest.input('deviceId', sql.VarChar(128), options.deviceId);
    const rows = (await deviceRequest.query<{
      device_id: string; modelo: string | null; ultimo_usuario: string | null; ultimo_contacto_utc: Date;
      id_vehiculo: number | null; placa: string | null;
    }>(`
      SELECT d.device_id, d.modelo, d.ultimo_usuario, d.ultimo_contacto_utc, d.id_vehiculo, v.placa
      FROM dbo.GPS_DispositivosMoviles d
      LEFT JOIN dbo.Vehiculos v ON v.id_vehiculo = d.id_vehiculo
      WHERE d.activo = 1 ${options.deviceId ? 'AND d.device_id = @deviceId' : ''}
      ORDER BY d.ultimo_contacto_utc DESC;
    `)).recordset;
    if (rows.length === 0) return { from: from.toISOString(), to: to.toISOString(), devices: [] };

    // Camión con el que se compara (por defecto, el asignado)
    let comparePlate: string | null = null;
    if (typeof options.compareVehicleId === 'number') {
      const found = (await pool.request()
        .input('vehicleId', sql.Int, options.compareVehicleId)
        .query<{ placa: string }>('SELECT placa FROM dbo.Vehiculos WHERE id_vehiculo = @vehicleId;')).recordset[0];
      if (!found) throw new BadRequestException('El camión a comparar no existe.');
      comparePlate = found.placa.trim();
    }
    const devices = rows.map((row) => ({
      ...row,
      assignedVehicleId: row.id_vehiculo === null ? null : Number(row.id_vehiculo),
      assignedPlate: row.placa?.trim() ?? null,
      ...(options.compareVehicleId === undefined
        ? {}
        : { id_vehiculo: options.compareVehicleId, placa: comparePlate }),
    }));

    // Vehículo propio de cada celular (CEL-xxxx)
    const identities = devices.map((d) => phoneVehicleIdentity(d.device_id));
    const phoneRequest = pool.request();
    // El driver ODBC genera parámetros internos @pN. Usa nombres propios.
    const phoneParameters = identities.map((identity, index) => {
      const name = `mobileUnit${index}`;
      phoneRequest.input(name, sql.Int, identity.providerUnitId);
      return `@${name}`;
    });
    const phoneVehicles = new Map<number, number>(); // providerUnitId -> id_vehiculo
    (await phoneRequest.query<{ id_vehiculo: number; id_unidad_proveedor: number }>(`
      SELECT id_vehiculo, id_unidad_proveedor FROM dbo.Vehiculos
      WHERE id_unidad_proveedor IN (${phoneParameters.join(',')});
    `)).recordset.forEach((row) => phoneVehicles.set(Number(row.id_unidad_proveedor), Number(row.id_vehiculo)));

    const vehicleIds = new Set<number>();
    identities.forEach((identity) => {
      const id = phoneVehicles.get(identity.providerUnitId);
      if (id) vehicleIds.add(id);
    });
    devices.forEach((d) => { if (d.id_vehiculo) vehicleIds.add(Number(d.id_vehiculo)); });

    // Posiciones del periodo de todos esos vehículos
    const tracks = new Map<number, TrackPoint[]>();
    if (vehicleIds.size > 0) {
      const posRequest = sqlRequest(pool, 30_000).input('from', sql.DateTime2(3), from).input('to', sql.DateTime2(3), to);
      const ids = [...vehicleIds];
      ids.forEach((id, i) => posRequest.input(`v${i}`, sql.Int, id));
      const rows = (await posRequest.query<{
        id_vehiculo: number; latitud: number; longitud: number; velocidad_kmh: number | null; fecha_gps_utc: Date;
      }>(`
        SELECT id_vehiculo, latitud, longitud, velocidad_kmh, fecha_gps_utc
        FROM dbo.GPS_Posiciones
        WHERE id_vehiculo IN (${ids.map((_, i) => `@v${i}`).join(',')})
          AND fecha_gps_utc >= @from AND fecha_gps_utc <= @to
        ORDER BY id_vehiculo, fecha_gps_utc;
      `)).recordset;
      for (const row of rows) {
        const list = tracks.get(Number(row.id_vehiculo)) ?? [];
        list.push({
          latitude: Number(row.latitud),
          longitude: Number(row.longitud),
          time: new Date(row.fecha_gps_utc).getTime(),
          speedKmh: row.velocidad_kmh === null ? null : Number(row.velocidad_kmh),
        });
        tracks.set(Number(row.id_vehiculo), list);
      }
    }

    // Paradas detectadas por cada celular en el periodo
    const stops = new Map<string, Record<string, number>>();
    (await pool.request()
      .input('from', sql.DateTime2(3), from)
      .input('to', sql.DateTime2(3), to)
      .query<{ device_id: string; tipo_parada: string; total: number }>(`
        SELECT device_id, tipo_parada, COUNT(*) AS total
        FROM dbo.GPS_EventosMovil
        WHERE tipo = 'STOP_END' AND tipo_parada IS NOT NULL
          AND fecha_gps_utc >= @from AND fecha_gps_utc <= @to
        GROUP BY device_id, tipo_parada;
      `)).recordset.forEach((row) => {
      const byType = stops.get(row.device_id) ?? {};
      byType[row.tipo_parada] = Number(row.total);
      stops.set(row.device_id, byType);
    });

    // Ubicación de cada parada del celular, para marcarlas en el mapa
    const stopLists = new Map<string, LiveStop[]>();
    (await pool.request()
      .input('from', sql.DateTime2(3), from)
      .input('to', sql.DateTime2(3), to)
      .query<{
        device_id: string; tipo_parada: string; latitud: number; longitud: number;
        inicio_utc: Date | null; duracion_s: number | null; nombre_lugar: string | null;
      }>(`
        SELECT TOP (1000) device_id, tipo_parada, latitud, longitud, inicio_utc, duracion_s, nombre_lugar
        FROM dbo.GPS_EventosMovil
        WHERE tipo = 'STOP_END' AND tipo_parada IS NOT NULL
          AND fecha_gps_utc >= @from AND fecha_gps_utc <= @to
        ORDER BY fecha_gps_utc;
      `)).recordset.forEach((row) => {
      const list = stopLists.get(row.device_id) ?? [];
      list.push({
        latitude: Number(row.latitud),
        longitude: Number(row.longitud),
        type: row.tipo_parada,
        start: row.inicio_utc ? new Date(row.inicio_utc).toISOString() : null,
        durationSeconds: row.duracion_s === null ? null : Number(row.duracion_s),
        place: row.nombre_lugar,
      });
      stopLists.set(row.device_id, list);
    });

    const toLive = async (vehicleId: number | undefined, plate: string): Promise<LiveTrack | null> => {
      if (!vehicleId) return null;
      const points = tracks.get(vehicleId) ?? [];
      const last = points.at(-1);
      return {
        vehicleId,
        plate,
        last: last
          ? { latitude: last.latitude, longitude: last.longitude, time: new Date(last.time).toISOString(), speedKmh: last.speedKmh }
          : null,
        // Solo lecturas con avance real (sin la deriva del GPS de un vehículo quieto)
        trail: downsample(segmentsForMatching(points).flat(), 1500)
          .map((pt) => [pt.longitude, pt.latitude, pt.time] as LiveTrackPoint),
        road: await this.roadFor(vehicleId, points),
      };
    };

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      devices: await Promise.all(devices.map(async (d, i) => {
        const phoneVehicleId = phoneVehicles.get(identities[i].providerUnitId);
        const phonePoints = phoneVehicleId ? tracks.get(phoneVehicleId) ?? [] : [];
        const truckPoints = d.id_vehiculo ? tracks.get(Number(d.id_vehiculo)) ?? [] : [];
        const [phone, truck] = await Promise.all([
          toLive(phoneVehicleId, identities[i].plate),
          d.id_vehiculo ? toLive(Number(d.id_vehiculo), d.placa?.trim() ?? '') : Promise.resolve(null),
        ]);
        return {
          deviceId: d.device_id,
          model: d.modelo,
          lastUser: d.ultimo_usuario,
          lastSeenAt: new Date(d.ultimo_contacto_utc).toISOString(),
          assignedVehicleId: d.assignedVehicleId,
          assignedPlate: d.assignedPlate,
          phone,
          truck,
          comparison: d.id_vehiculo ? compareTracks(phonePoints, truckPoints) : null,
          phoneKm: trackKm(phonePoints),
          stops: stops.get(d.device_id) ?? {},
          stopList: stopLists.get(d.device_id) ?? [],
        };
      })),
    };
  }

  /** Asigna (o quita con null) el camión de un celular. */
  async assignVehicle(deviceId: string, vehicleId: number | null, assignedBy: string | null): Promise<MobileDeviceRow> {
    const pool = await this.database.pool;
    if (vehicleId !== null) {
      const exists = await pool.request()
        .input('vehicleId', sql.Int, vehicleId)
        .query<{ ok: number }>('SELECT 1 AS ok FROM dbo.Vehiculos WHERE id_vehiculo = @vehicleId AND activo = 1;');
      if (exists.recordset.length === 0) throw new BadRequestException('El vehículo no existe o está inactivo.');
    }
    const updated = await pool.request()
      .input('deviceId', sql.VarChar(128), deviceId)
      .input('vehicleId', sql.Int, vehicleId)
      .input('assignedBy', sql.VarChar(50), assignedBy)
      .query(`
        UPDATE dbo.GPS_DispositivosMoviles
        SET id_vehiculo = @vehicleId, asignado_por = @assignedBy, fecha_asignacion_utc = sysutcdatetime()
        WHERE device_id = @deviceId;
      `);
    if ((updated.rowsAffected[0] ?? 0) === 0) {
      throw new NotFoundException('El celular aún no se ha conectado a la web.');
    }
    const row = (await this.list()).find((item) => item.deviceId === deviceId);
    if (!row) throw new NotFoundException('El celular aún no se ha conectado a la web.');
    return row;
  }
}
