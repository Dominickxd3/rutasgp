import { Injectable, Logger } from '@nestjs/common';
import sql, { Transaction } from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import { GeofencesService } from '../geofences/geofences.service';
import { phoneVehicleIdentity } from '../mobile-device/track-comparison';
import { TripsService } from '../trips/trips.service';
import type {
  MobilePositionBatch,
  MobilePositionBatchResult,
} from './mobile-position.types';

interface InsertedPosition {
  id: number;
  latitude: number;
  longitude: number;
  gpsDate: Date;
}

@Injectable()
export class MobilePositionService {
  private readonly logger = new Logger(MobilePositionService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly geofences: GeofencesService,
    private readonly trips: TripsService,
  ) {}

  async ingest(batch: MobilePositionBatch): Promise<MobilePositionBatchResult> {
    const pool = await this.database.pool;
    const transaction = new sql.Transaction(pool);
    const processedIds: string[] = [];
    const insertedPositions: InsertedPosition[] = [];
    let inserted = 0;
    let duplicates = 0;
    let rejected = 0;
    let vehicleId = 0;

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      // El recorrido pertenece al celular (su propio vehículo CEL-xxxx), tenga o no
      // camión asignado: así nunca se mezcla con el GPS del camión y se pueden comparar.
      const phone = phoneVehicleIdentity(batch.deviceId);
      const vehicle = await new sql.Request(transaction)
        .input('providerId', sql.Int, phone.providerUnitId)
        .input('plate', sql.VarChar(15), phone.plate)
        .query<{ id: number }>(`
          DECLARE @id int;
          SELECT @id = id_vehiculo FROM dbo.Vehiculos WITH (UPDLOCK, HOLDLOCK)
          WHERE id_unidad_proveedor = @providerId;
          IF @id IS NULL
          BEGIN
            INSERT dbo.Vehiculos (id_unidad_proveedor, placa)
            VALUES (@providerId, @plate);
            SET @id = CONVERT(int, SCOPE_IDENTITY());
          END
          ELSE UPDATE dbo.Vehiculos SET placa = @plate, activo = 1 WHERE id_vehiculo = @id;
          SELECT @id AS id;
        `);
      vehicleId = Number(vehicle.recordset[0].id);

      for (const point of batch.points) {
        processedIds.push(point.id);
        if (point.mock) {
          rejected += 1;
          continue;
        }
        const gpsDate = new Date(point.gpsTimestamp);
        const result = await new sql.Request(transaction)
          .input('vehicleId', sql.Int, vehicleId)
          .input('latitude', sql.Decimal(10, 7), point.latitude)
          .input('longitude', sql.Decimal(10, 7), point.longitude)
          .input('speed', sql.Decimal(8, 2), point.speedMetersPerSecond === null ? null : point.speedMetersPerSecond * 3.6)
          .input('gpsDate', sql.DateTime2(3), gpsDate)
          .query<{ inserted: number; id: number | null }>(`
            IF NOT EXISTS (
              SELECT 1 FROM dbo.GPS_Posiciones WITH (UPDLOCK, HOLDLOCK)
              WHERE id_vehiculo = @vehicleId AND fecha_gps_utc = @gpsDate
            )
            BEGIN
              INSERT dbo.GPS_Posiciones
                (id_vehiculo, latitud, longitud, velocidad_kmh, estado_motor,
                 orientacion, kilometraje, bateria, fecha_gps_utc)
              VALUES
                (@vehicleId, @latitude, @longitude, @speed, 'Sin dato',
                 NULL, NULL, NULL, @gpsDate);
              SELECT 1 AS inserted, CONVERT(bigint, SCOPE_IDENTITY()) AS id;
            END
            ELSE SELECT 0 AS inserted, NULL AS id;
          `);
        if (Number(result.recordset[0]?.inserted) === 1) {
          inserted += 1;
          insertedPositions.push({
            id: Number(result.recordset[0].id),
            latitude: point.latitude,
            longitude: point.longitude,
            gpsDate,
          });
        } else {
          duplicates += 1;
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    // "Último contacto" en la web = último lote recibido (no solo la consulta de configuración)
    await pool.request()
      .input('deviceId', sql.VarChar(128), batch.deviceId)
      .query('UPDATE dbo.GPS_DispositivosMoviles SET ultimo_contacto_utc = sysutcdatetime() WHERE device_id = @deviceId;')
      .catch((error: unknown) =>
        this.logger.warn(`No se pudo registrar el contacto del celular: ${error instanceof Error ? error.message : error}`));

    if (insertedPositions.length > 0) {
      const events = await this.geofences.evaluatePositions(
        vehicleId,
        insertedPositions.map((position) => ({
          id: position.id,
          latitude: position.latitude,
          longitude: position.longitude,
          gpsDate: position.gpsDate,
        })),
      ).catch((error: unknown) => {
        this.logger.warn(`No se pudieron evaluar geocercas del móvil: ${error instanceof Error ? error.message : error}`);
        return 0;
      });
      if (events > 0) {
        await this.trips.consolidateVehicle(vehicleId).catch((error: unknown) =>
          this.logger.warn(`No se pudo consolidar el recorrido móvil: ${error instanceof Error ? error.message : error}`),
        );
      }
    }

    this.logger.log(`Móvil ${batch.deviceId}: ${inserted} nuevas, ${duplicates} repetidas, ${rejected} simuladas.`);
    return { processedIds, inserted, duplicates, rejected };
  }
}
