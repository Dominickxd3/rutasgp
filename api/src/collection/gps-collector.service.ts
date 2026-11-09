import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql, { Transaction } from 'mssql/msnodesqlv8';

import { DatabaseService } from '../database/database.service';
import { FleetService } from '../fleet/fleet.service';
import type { FleetUnit } from '../fleet/interfaces/fleet.interface';
import { GeofencesService } from '../geofences/geofences.service';
import { TripsService } from '../trips/trips.service';
import { parseProviderDate } from './gps-date';

interface Counters {
  received: number;
  inserted: number;
  duplicates: number;
  invalid: number;
}

interface NewPosition {
  vehicleId: number;
  positionId: number;
  latitude: number;
  longitude: number;
  gpsDate: Date;
}

@Injectable()
export class GpsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpsCollectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private localRun: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly fleet: FleetService,
    private readonly geofences: GeofencesService,
    private readonly trips: TripsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('collection.enabled', true)) {
      this.logger.warn('Recolector GPS deshabilitado por configuración.');
      return;
    }

    const seconds = this.config.get<number>('collection.intervalSeconds', 30);
    this.timer = setInterval(() => void this.trigger(), seconds * 1_000);
    this.timer.unref();
    void this.trigger();
    this.logger.log(`Recolector GPS activo cada ${seconds} segundos.`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.localRun;
  }

  private async trigger(): Promise<void> {
    if (this.localRun) {
      this.logger.warn('Recolección local anterior todavía en curso; se omite el ciclo.');
      return;
    }

    this.localRun = this.collect().finally(() => {
      this.localRun = null;
    });
    await this.localRun;
  }

  private async collect(): Promise<void> {
    let transaction: Transaction | null = null;
    let collectionId: number | null = null;
    let transactionOpen = false;

    try {
      const pool = await this.database.pool;
      transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      transactionOpen = true;
      const lock = await new sql.Request(transaction)
        .input('timeout', sql.Int, this.config.get<number>('collection.lockTimeoutMs', 0))
        .query<{ result: number }>(`
          DECLARE @result int;
          EXEC @result = sys.sp_getapplock
            @Resource = N'DB_GP_DistribucionML.GPS_COLLECTION',
            @LockMode = N'Exclusive', @LockOwner = N'Transaction',
            @LockTimeout = @timeout;
          SELECT @result AS result;
        `);

      if ((lock.recordset[0]?.result ?? -999) < 0) {
        await transaction.rollback();
        transactionOpen = false;
        this.logger.debug('Otra instancia ejecuta la recolección; ciclo omitido.');
        return;
      }

      const start = await new sql.Request(transaction).query<{ id: number }>(`
        INSERT dbo.GPS_Recolecciones (estado) VALUES ('INICIADO');
        SELECT CONVERT(bigint, SCOPE_IDENTITY()) AS id;
      `);
      collectionId = Number(start.recordset[0].id);

      const provider = await this.fleet.getProviderFleet();
      const counters: Counters = {
        received: provider.received,
        inserted: 0,
        duplicates: 0,
        invalid: provider.invalid,
      };

      const newPositions: NewPosition[] = [];

      for (const unit of provider.units) {
        const item = await this.persistUnit(transaction, unit, counters);
        if (item) {
          newPositions.push(item);
        }
      }

      await new sql.Request(transaction)
        .input('id', sql.BigInt, collectionId)
        .input('received', sql.Int, counters.received)
        .input('inserted', sql.Int, counters.inserted)
        .input('duplicates', sql.Int, counters.duplicates)
        .input('invalid', sql.Int, counters.invalid)
        .query(`
          UPDATE dbo.GPS_Recolecciones
          SET fecha_fin_utc = SYSUTCDATETIME(), vehiculos_recibidos = @received,
              posiciones_nuevas = @inserted, registros_repetidos = @duplicates,
              registros_invalidos = @invalid, estado = 'COMPLETADO', mensaje_error = NULL
          WHERE id_recoleccion = @id;
        `);

      await transaction.commit();
      transactionOpen = false;

      // Evaluar eventos de geocercas para los vehículos que reportaron nueva posición
      if (newPositions.length > 0) {
        const byVehicle = new Map<number, NewPosition[]>();
        for (const pos of newPositions) {
          const list = byVehicle.get(pos.vehicleId) ?? [];
          list.push(pos);
          byVehicle.set(pos.vehicleId, list);
        }
        for (const [vId, pList] of byVehicle.entries()) {
          const eventsCreated = await this.geofences
            .evaluatePositions(
              vId,
              pList.map((p) => ({
                id: p.positionId,
                latitude: p.latitude,
                longitude: p.longitude,
                gpsDate: p.gpsDate,
              })),
            )
            .catch((err) => {
              this.logger.warn(
                `Error evaluando geocercas para vehículo ${vId}: ${err instanceof Error ? err.message : err}`,
              );
              return 0;
            });

          // Si hubo cambio de estado en geocercas (SALIDA o RETORNO), consolidar el viaje de inmediato
          if (eventsCreated > 0) {
            await this.trips
              .consolidateVehicle(vId)
              .catch((err) =>
                this.logger.warn(
                  `Error consolidando recorrido para vehículo ${vId}: ${err instanceof Error ? err.message : err}`,
                ),
              );
          }
        }
      }

      this.logger.log(
        `Recolección ${collectionId}: ${counters.inserted} nuevas, ${counters.duplicates} repetidas, ${counters.invalid} inválidas.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      if (transactionOpen && transaction) {
        await transaction.rollback().catch(() => undefined);
      }
      this.logger.error(`Falló la recolección GPS: ${message}`);
      await this.recordFailure(collectionId, message);
    }
  }

  private async persistUnit(
    transaction: Transaction,
    unit: FleetUnit,
    counters: Counters,
  ): Promise<NewPosition | null> {
    const providerId = Number(unit.idUnidad);
    const gpsDate = parseProviderDate(unit.fecha);

    if (!Number.isSafeInteger(providerId) || !gpsDate) {
      counters.invalid += 1;
      return null;
    }

    const request = new sql.Request(transaction)
      .input('providerId', sql.Int, providerId)
      .input('plate', sql.VarChar(15), unit.placa)
      .input('latitude', sql.Decimal(10, 7), unit.latitud)
      .input('longitude', sql.Decimal(10, 7), unit.longitud)
      .input('speed', sql.Decimal(8, 2), unit.velocidadOriginal)
      .input('engine', sql.VarChar(30), unit.estadoMotor)
      .input('heading', sql.SmallInt, unit.orientacionOriginal === null ? null : Math.round(((unit.orientacionOriginal % 360) + 360) % 360))
      .input('mileage', sql.Decimal(14, 3), unit.kilometraje)
      .input('battery', sql.Decimal(8, 2), unit.bateria)
      .input('gpsDate', sql.DateTime2(3), gpsDate);

    const result = await request.query<{ inserted: number; positionId?: number; vehicleId?: number }>(`
      DECLARE @vehicleId int;
      SELECT @vehicleId = id_vehiculo FROM dbo.Vehiculos WITH (UPDLOCK, HOLDLOCK)
      WHERE id_unidad_proveedor = @providerId;

      IF @vehicleId IS NULL
      BEGIN
        INSERT dbo.Vehiculos (id_unidad_proveedor, placa) VALUES (@providerId, @plate);
        SET @vehicleId = CONVERT(int, SCOPE_IDENTITY());
      END
      ELSE
        UPDATE dbo.Vehiculos SET placa = @plate, activo = 1 WHERE id_vehiculo = @vehicleId;

      IF NOT EXISTS (
        SELECT 1 FROM dbo.GPS_Posiciones WITH (UPDLOCK, HOLDLOCK)
        WHERE id_vehiculo = @vehicleId AND fecha_gps_utc = @gpsDate
      )
      BEGIN
        INSERT dbo.GPS_Posiciones
          (id_vehiculo, latitud, longitud, velocidad_kmh, estado_motor,
           orientacion, kilometraje, bateria, fecha_gps_utc)
        VALUES
          (@vehicleId, @latitude, @longitude, @speed, @engine,
           @heading, @mileage, @battery, @gpsDate);
        SELECT 1 AS inserted, CONVERT(bigint, SCOPE_IDENTITY()) AS positionId, @vehicleId AS vehicleId;
      END
      ELSE SELECT 0 AS inserted, NULL AS positionId, @vehicleId AS vehicleId;
    `);

    if (result.recordset[0]?.inserted === 1) {
      counters.inserted += 1;
      return {
        vehicleId: Number(result.recordset[0].vehicleId),
        positionId: Number(result.recordset[0].positionId),
        latitude: unit.latitud,
        longitude: unit.longitud,
        gpsDate,
      };
    } else {
      counters.duplicates += 1;
      return null;
    }
  }

  private async recordFailure(collectionId: number | null, message: string): Promise<void> {
    try {
      const pool = await this.database.pool;
      const request = pool.request()
        .input('id', sql.BigInt, collectionId)
        .input('message', sql.NVarChar(2000), message.slice(0, 2000));
      await request.query(`
        IF @id IS NULL
          INSERT dbo.GPS_Recolecciones (fecha_fin_utc, estado, mensaje_error)
          VALUES (SYSUTCDATETIME(), 'ERROR', @message);
        ELSE
        BEGIN
          UPDATE dbo.GPS_Recolecciones SET fecha_fin_utc = SYSUTCDATETIME(),
            estado = 'ERROR', mensaje_error = @message WHERE id_recoleccion = @id;
          IF @@ROWCOUNT = 0
            INSERT dbo.GPS_Recolecciones (fecha_fin_utc, estado, mensaje_error)
            VALUES (SYSUTCDATETIME(), 'ERROR', @message);
        END
      `);
    } catch (loggingError) {
      const detail = loggingError instanceof Error ? loggingError.message : 'desconocido';
      this.logger.error(`Tampoco se pudo registrar el error de recolección: ${detail}`);
    }
  }
}
