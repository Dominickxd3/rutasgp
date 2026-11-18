import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeFleet } from './fleet.mapper';
import { ProviderEvidenceService } from './provider-evidence.service';
import { DatabaseService } from '../database/database.service';
import {
  FleetSnapshot,
  RawFleetUnit,
} from './interfaces/fleet.interface';

interface CachedSnapshot {
  snapshot: FleetSnapshot;
  fetchedAt: number;
}

export interface ProviderFleetResult {
  units: FleetSnapshot['units'];
  received: number;
  invalid: number;
}

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name);
  private readonly clientByUnit = new Map<string, string>();
  private cache: CachedSnapshot | null = null;
  private inFlight: Promise<FleetSnapshot> | null = null;
  private lastAttemptAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly evidence: ProviderEvidenceService,
    private readonly database: DatabaseService,
  ) {}

  async getFleet(forceRefresh = false): Promise<FleetSnapshot> {
    const now = Date.now();
    const cacheTtlMs = this.config.get<number>('fleet.cacheTtlMs', 4_000);
    const minIntervalMs = this.config.get<number>(
      'fleet.pollMinIntervalMs',
      1_500,
    );

    if (this.cache && !forceRefresh && now - this.cache.fetchedAt < cacheTtlMs) {
      return this.cache.snapshot;
    }

    if (
      this.cache &&
      forceRefresh &&
      now - this.lastAttemptAt < minIntervalMs
    ) {
      return this.cache.snapshot;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.refresh().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  async getProviderFleet(): Promise<ProviderFleetResult> {
    const [rawUnits, liveUnits] = await Promise.all([
      this.fetchJson('fleet.sourceUrl', 'FLEET_SOURCE_URL'),
      this.fetchLiveUnits(),
    ]);

    this.rememberClients(liveUnits);
    const units = normalizeFleet(rawUnits, this.clientByUnit);

    return {
      units,
      received: rawUnits.length,
      invalid: Math.max(0, rawUnits.length - units.length),
    };
  }

  private async refresh(): Promise<FleetSnapshot> {
    this.lastAttemptAt = Date.now();

    try {
      const provider = await this.getProviderFleet();
      const units = await this.mergeStoredPositions(provider.units);
      const moving = units.filter((unit) => unit.velocidad > 0).length;

      const snapshot: FleetSnapshot = {
        units,
        total: units.length,
        moving,
        stopped: units.length - moving,
        updatedAt: new Date().toISOString(),
        stale: false,
      };

      this.cache = { snapshot, fetchedAt: Date.now() };

      return snapshot;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';

      this.logger.error(`No se pudo consultar el feed GPS: ${message}`);

      if (this.cache) {
        const staleSnapshot: FleetSnapshot = {
          ...this.cache.snapshot,
          stale: true,
          warning:
            'El proveedor GPS no responde. Se muestra la última posición conocida.',
        };

        // Conservamos el fetchedAt original para reintentar al vencer el TTL.
        this.cache = { ...this.cache, snapshot: staleSnapshot };

        return staleSnapshot;
      }

      throw new ServiceUnavailableException(
        'No se pudo obtener la flota desde el proveedor GPS.',
      );
    }
  }

  private async mergeStoredPositions(providerUnits: FleetSnapshot['units']): Promise<FleetSnapshot['units']> {
    try {
      const pool = await this.database.pool;
      const result = await pool.request().query<{
        providerId: number;
        plate: string;
        latitude: number;
        longitude: number;
        speed: number | null;
        engine: string | null;
        heading: number | null;
        mileage: number | null;
        battery: number | null;
        gpsDate: Date;
      }>(`
        WITH latest AS (
          SELECT p.*, ROW_NUMBER() OVER (
            PARTITION BY p.id_vehiculo
            ORDER BY p.fecha_gps_utc DESC, p.id_posicion DESC
          ) AS rn
          FROM dbo.GPS_Posiciones p
        )
        SELECT v.id_unidad_proveedor AS providerId, v.placa AS plate,
               p.latitud AS latitude, p.longitud AS longitude,
               p.velocidad_kmh AS speed, p.estado_motor AS engine,
               p.orientacion AS heading, p.kilometraje AS mileage,
               p.bateria AS battery, p.fecha_gps_utc AS gpsDate
        FROM dbo.Vehiculos v
        JOIN latest p ON p.id_vehiculo = v.id_vehiculo AND p.rn = 1
        WHERE v.activo = 1
          -- Los celulares GPSCamiones (800.000.000 en adelante) no son camiones:
          -- se muestran con su propio ícono en la capa de celulares.
          AND v.id_unidad_proveedor < 800000000;
      `);
      const byId = new Map(providerUnits.map((unit) => [unit.idUnidad, unit]));
      const providerTimestamp = (value: string | null): number => {
        if (!value) return 0;
        const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
          ? value
          : `${value.trim().replace(' ', 'T')}-05:00`;
        const parsed = Date.parse(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      for (const row of result.recordset) {
        const id = String(row.providerId);
        const previous = byId.get(id);
        const storedAt = row.gpsDate.getTime();
        if (previous && providerTimestamp(previous.fecha) >= storedAt) continue;
        const speed = Math.max(0, Number(row.speed ?? 0));
        const engine = row.engine?.trim() || 'Sin dato';
        const normalizedEngine = engine.toLowerCase();
        byId.set(id, {
          idUnidad: id,
          placa: row.plate,
          cliente: previous?.cliente ?? null,
          estadoMotor: engine,
          motorEncendido: normalizedEngine.includes('encend') || normalizedEngine.includes('activo') || normalizedEngine === 'on',
          velocidad: Math.round(speed),
          velocidadOriginal: speed,
          orientacionOriginal: row.heading === null ? null : Number(row.heading),
          latitud: Number(row.latitude),
          longitud: Number(row.longitude),
          orientacion: row.heading === null ? 0 : ((Number(row.heading) % 360) + 360) % 360,
          bateria: row.battery === null ? null : Number(row.battery),
          kilometraje: row.mileage === null ? null : Number(row.mileage),
          fecha: row.gpsDate.toISOString(),
          modulo: previous?.modulo ?? 'GPSCamiones',
        });
      }
      return [...byId.values()].sort((a, b) => a.placa.localeCompare(b.placa, 'es', { numeric: true }));
    } catch (error) {
      this.logger.warn(`No se pudo combinar la posición almacenada: ${error instanceof Error ? error.message : error}`);
      return providerUnits;
    }
  }

  /**
   * El feed principal no trae "cliente". El feed de posiciones actuales sí,
   * pero solo para unidades que reportaron recientemente. Guardamos ese
   * mapeo en memoria para ir enriqueciendo el listado completo.
   */
  private rememberClients(rawUnits: RawFleetUnit[]): void {
    for (const raw of rawUnits) {
      const idUnidad =
        typeof raw.id_unidad === 'string'
          ? raw.id_unidad.trim()
          : String(raw.id_unidad ?? '').trim();
      const cliente =
        typeof raw.cliente === 'string' ? raw.cliente.trim() : '';

      if (idUnidad && cliente) {
        this.clientByUnit.set(idUnidad, cliente);
      }
    }
  }

  private async fetchLiveUnits(): Promise<RawFleetUnit[]> {
    const sourceUrl = this.config.get<string>('fleet.sourceUrl');
    const liveSourceUrl = this.config.get<string>('fleet.liveSourceUrl');

    if (!liveSourceUrl || liveSourceUrl === sourceUrl) {
      return [];
    }

    try {
      return await this.fetchJson('fleet.liveSourceUrl', 'FLEET_LIVE_SOURCE_URL');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';

      this.logger.warn(`No se pudo enriquecer el cliente: ${message}`);

      return [];
    }
  }

  private async fetchJson(
    configKey: string,
    envName: string,
  ): Promise<RawFleetUnit[]> {
    const sourceUrl = this.config.get<string>(configKey);
    const timeoutMs = this.config.get<number>('fleet.timeoutMs', 10_000);

    if (!sourceUrl) {
      throw new Error(`${envName} no está configurada`);
    }

    const response = await fetch(sourceUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const receivedAt = new Date();
    const body = await response.text();
    await this.evidence.preserve(body, receivedAt, response.status);
    if (!response.ok) {
      throw new Error(`el proveedor respondió HTTP ${response.status}`);
    }

    const payload: unknown = JSON.parse(body);

    if (!Array.isArray(payload)) {
      throw new Error('la respuesta del proveedor no es un arreglo JSON');
    }

    return payload as RawFleetUnit[];
  }
}
