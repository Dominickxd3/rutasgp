import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeFleet } from './fleet.mapper';
import {
  FleetSnapshot,
  RawFleetUnit,
} from './interfaces/fleet.interface';

interface CachedSnapshot {
  snapshot: FleetSnapshot;
  fetchedAt: number;
}

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name);
  private readonly clientByUnit = new Map<string, string>();
  private cache: CachedSnapshot | null = null;
  private inFlight: Promise<FleetSnapshot> | null = null;
  private lastAttemptAt = 0;

  constructor(private readonly config: ConfigService) {}

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

  private async refresh(): Promise<FleetSnapshot> {
    this.lastAttemptAt = Date.now();

    try {
      const [rawUnits, liveUnits] = await Promise.all([
        this.fetchJson('fleet.sourceUrl', 'FLEET_SOURCE_URL'),
        this.fetchLiveUnits(),
      ]);

      this.rememberClients(liveUnits);

      const units = normalizeFleet(rawUnits, this.clientByUnit);
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

    if (!response.ok) {
      throw new Error(`el proveedor respondió HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error('la respuesta del proveedor no es un arreglo JSON');
    }

    return payload as RawFleetUnit[];
  }
}
