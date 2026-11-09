import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OsrmPoint {
  id?: number;
  latitude: number;
  longitude: number;
  gpsDate?: Date;
}

export interface RoadSegment {
  coordinates: [number, number][];
  kind: 'matched' | 'estimated';
  confidence: number | null;
  role?: 'junction-estimate';
  evidence?: { version:string; inputPositionIds: Array<number|null>; discardedPositionIds:Array<number|null>; parameters:unknown; response:unknown; status:string };
}

interface OsrmGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

interface MatchResponse {
  code: string;
  tracepoints?: Array<{matchings_index:number} | null>;
  data_version?: string;
  matchings?: Array<{ confidence?: number; geometry?: OsrmGeometry }>;
}

interface RouteResponse {
  code: string;
  routes?: Array<{ geometry?: OsrmGeometry }>;
}

@Injectable()
export class OsrmService {
  private readonly logger = new Logger(OsrmService.name);
  private readonly cache = new Map<string, { expiresAt: number; payload: unknown }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private activeRequests = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly config: ConfigService) {}

  async matchSegments(segments: OsrmPoint[][]): Promise<RoadSegment[]> {
    const results = await Promise.all(segments.map((segment) => this.matchSegment(segment)));
    return results.flat();
  }

  private async matchSegment(rawSegment: OsrmPoint[]): Promise<RoadSegment[]> {
      if (rawSegment.length < 2) return [];

      // Filtrar puntos estacionarios contiguos muy cercanos (< 8 metros)
      // para evitar saturar OSRM match con coordenadas idénticas y evitar "confidence: 0"
      const segment: OsrmPoint[] = [];
      for (const pt of rawSegment) {
        const last = segment[segment.length - 1];
        if (
          !last ||
          Math.abs(last.latitude - pt.latitude) > 0.00008 ||
          Math.abs(last.longitude - pt.longitude) > 0.00008
        ) {
          segment.push(pt);
        }
      }

      if (segment.length < 2) {
        // Si todos los puntos eran estacionarios en un solo lugar
        return [{
          coordinates: rawSegment.map((p) => [p.longitude, p.latitude]),
          kind: 'estimated',
          confidence: null,
        }];
      }

      const chunks = this.chunkWithOverlap(segment, this.config.get<number>('osrm.maxPoints', 10));
      const chunkResults = await Promise.all(
        chunks.map(async (chunk): Promise<RoadSegment[]> => {
          const matched = await this.matchChunk(chunk);
          if (matched.length > 0) return matched;
          return [{
            coordinates: chunk.map((point) => [point.longitude, point.latitude]),
            kind: 'estimated',
            confidence: null,
          }];
        }),
      );
      const chunkSegments = chunkResults.flat();

      // Solo empalmar subtrazas del MISMO intervalo GPS continuo. La conexión
      // se devuelve separada y estimada, sin elevar su confianza a observada.
      const bridges = await Promise.all(chunkSegments.slice(1).map(async (next,index):Promise<RoadSegment|null> => {
        const previous=chunkSegments[index];
        const from=previous.coordinates.at(-1);
        const to=next.coordinates[0];
        if(!from || !to || (from[0]===to[0] && from[1]===to[1])) return null;
        const coordinates=await this.estimateRoute(
          {longitude:from[0],latitude:from[1]},
          {longitude:to[0],latitude:to[1]},
        );
        if(!coordinates || coordinates.length<2) return null;
        return {coordinates,kind:'estimated',confidence:null,role:'junction-estimate',
          evidence:{version:'junction-v1',inputPositionIds:rawSegment.map(p=>p.id??null),
            discardedPositionIds:[],parameters:{from,to,service:'route'},
            response:{coordinates},status:'ESTIMATED_NOT_OBSERVED'}};
      }));
      const output:RoadSegment[]=[];
      chunkSegments.forEach((part,index)=>{
        if(index>0 && bridges[index-1]) output.push(bridges[index-1]!);
        output.push(part);
      });
      return output;
  }

  async estimateRoute(
    from: Pick<OsrmPoint, 'latitude' | 'longitude'>,
    to: Pick<OsrmPoint, 'latitude' | 'longitude'>,
  ): Promise<[number, number][] | null> {
    if (!this.config.get<boolean>('osrm.enabled', true)) return null;
    const baseUrl = this.config.get<string>('osrm.baseUrl', '').replace(/\/$/, '');
    if (!baseUrl) return null;
    const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const url = `${baseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
    try {
      const payload = await this.fetchJson<RouteResponse>(url);
      return payload.code === 'Ok' ? payload.routes?.[0]?.geometry?.coordinates ?? null : null;
    } catch (error) {
      this.logger.warn(`No se pudo estimar la ruta vial con OSRM: ${this.message(error)}`);
      return null;
    }
  }

  private async matchChunk(points: OsrmPoint[]): Promise<RoadSegment[]> {
    if (!this.config.get<boolean>('osrm.enabled', true)) return [];
    const baseUrl = this.config.get<string>('osrm.baseUrl', '').replace(/\/$/, '');
    if (!baseUrl) return [];
    const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const radius = this.config.get<number>('osrm.gpsRadiusMeters', 35);
    const timestamps = points
      .map((point) => (point.gpsDate ? Math.floor(point.gpsDate.getTime() / 1_000) : 0))
      .join(';');
    const radiuses = points.map(() => radius).join(';');
    const hasTimestamps = points.every((p) => p.gpsDate);
    const url =
      `${baseUrl}/match/v1/driving/${coordinates}` +
      (hasTimestamps ? `?timestamps=${timestamps}&` : '?') +
      `radiuses=${radiuses}&gaps=ignore&tidy=true&geometries=geojson&overview=full`;
    try {
      const payload = await this.fetchJson<MatchResponse>(url);
      if (payload.code !== 'Ok') return [];
      const minimumConfidence = this.config.get<number>('osrm.minimumConfidence', 0.35);
      return (payload.matchings ?? [])
        .filter((matching) => matching.geometry?.coordinates?.length)
        .map((matching) => ({
          coordinates: matching.geometry!.coordinates,
          kind: (matching.confidence ?? 0) >= minimumConfidence ? ('matched' as const) : ('estimated' as const),
          confidence: matching.confidence ?? null,
          evidence: {
            version:'osrm-adapter-v2',
            inputPositionIds:points.map(point=>point.id??null),
            discardedPositionIds:points.filter((_,index)=>payload.tracepoints?.[index]===null).map(point=>point.id??null),
            parameters:{radius,minimumConfidence,gaps:'ignore',tidy:true,baseUrl},
            response:payload,
            status:(matching.confidence??0)>=minimumConfidence?'MATCHED_UNCORROBORATED':'UNCERTAIN',
          },
        }));
    } catch (error) {
      this.logger.warn(`Map matching OSRM no disponible: ${this.message(error)}`);
      return [];
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.payload as T;
    const existing = this.inFlight.get(url);
    if (existing) return existing as Promise<T>;

    const operation = this.fetchUncached<T>(url);
    this.inFlight.set(url, operation);
    try {
      const payload = await operation;
      const ttlMs = this.config.get<number>('osrm.cacheTtlMs', 600_000);
      this.cache.set(url, { expiresAt: Date.now() + ttlMs, payload });
      if (this.cache.size > 500) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (oldest) this.cache.delete(oldest);
      }
      return payload;
    } finally {
      this.inFlight.delete(url);
    }
  }

  private async fetchUncached<T>(url: string): Promise<T> {
    await this.acquireSlot();
    const timeoutMs = this.config.get<number>('osrm.timeoutMs', 8_000);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GrupoPecuario-Distribucion/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<T>;
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    const maximum = this.config.get<number>('osrm.concurrency', 3);
    if (this.activeRequests < maximum) {
      this.activeRequests += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeRequests += 1;
  }

  private releaseSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.waiters.shift()?.();
  }

  private chunkWithOverlap(points: OsrmPoint[], maximum: number): OsrmPoint[][] {
    const size = Math.max(2, maximum);
    const chunks: OsrmPoint[][] = [];
    for (let start = 0; start < points.length - 1; start += size - 1) {
      chunks.push(points.slice(start, start + size));
    }
    return chunks;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
