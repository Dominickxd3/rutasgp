import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import { GeofencesService } from '../geofences/geofences.service';
import type {
  MobileDeviceConfig,
  MobileDeviceRow,
  MobileEventBatch,
  MobileEventBatchResult,
} from './mobile-device.types';

interface AssignedVehicleRow {
  id_vehiculo: number | null;
  id_unidad_proveedor: number | null;
  placa: string | null;
}

@Injectable()
export class MobileDeviceService {
  private readonly logger = new Logger(MobileDeviceService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly geofences: GeofencesService,
  ) {}

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
