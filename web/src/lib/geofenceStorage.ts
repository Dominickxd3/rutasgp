import {
  clampGeofenceRadius,
  MIN_POLYGON_VERTICES,
  type LatLng,
} from './geo';
import type { Geofence, GeofenceRecord } from '../features/sede/types/geofence.types';
import { validGeofenceColor } from '../features/sede/utils/geofence-appearance.utils';

const STORAGE_KEY = 'fleetmap.geofences.v2';
const LEGACY_STORAGE_KEY = 'fleetmap.geofence.v1';
const MAX_STORED_VERTICES = 200;

function isLatitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isLongitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function parseVertices(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length > MAX_STORED_VERTICES) {
    return null;
  }

  const vertices: LatLng[] = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }

    const candidate = entry as Record<string, unknown>;

    if (
      !isLatitude(candidate.latitude) ||
      !isLongitude(candidate.longitude)
    ) {
      return null;
    }

    vertices.push({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    });
  }

  return vertices.length >= MIN_POLYGON_VERTICES ? vertices : null;
}

function parseGeofence(value: unknown): Geofence | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.shape === 'polygon') {
    const vertices = parseVertices(candidate.vertices);

    return vertices ? { shape: 'polygon', vertices } : null;
  }

  // Formato circular actual y formato anterior sin `shape`.
  const { latitude, longitude, radius } = candidate;

  if (
    !isLatitude(latitude) ||
    !isLongitude(longitude) ||
    typeof radius !== 'number' ||
    !Number.isFinite(radius)
  ) {
    return null;
  }

  return {
    shape: 'circle',
    latitude,
    longitude,
    radius: clampGeofenceRadius(radius),
  };
}

export const DEFAULT_GRUPO_PECUARIO_GEOFENCES: GeofenceRecord[] = [
  {
    id: 'geofence-migrated',
    name: 'Geocerca 1',
    sedeNombre: 'Grupo Pecuario S.A.C.',
    geometry: {
      shape: 'polygon',
      vertices: [
        { latitude: -11.97923037494553, longitude: -77.01358266169282 },
        { latitude: -11.979850934147052, longitude: -77.01392686853356 },
        { latitude: -11.98014535954674, longitude: -77.01345763588925 },
        { latitude: -11.979505172626787, longitude: -77.01312269021957 },
      ],
    },
  },
  {
    id: 'b78a83d4-5901-4287-8fa8-e71ff0e2aa5e',
    name: 'Geocerca 2',
    sedeNombre: 'Grupo Pecuario S.A.C.',
    geometry: {
      shape: 'polygon',
      vertices: [
        { latitude: -11.979937971634001, longitude: -77.01395908562407 },
        { latitude: -11.98041475811931, longitude: -77.01427064843912 },
        { latitude: -11.98076939900622, longitude: -77.01376480913024 },
        { latitude: -11.980263553885905, longitude: -77.01340723357376 },
      ],
    },
  },
];

/** Recupera la geocerca guardada en el navegador, si es válida. */
function parseRecords(value: unknown): GeofenceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const records = value.flatMap<GeofenceRecord>((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const geometry = parseGeofence(candidate.geometry);

    if (!geometry || typeof candidate.id !== 'string') {
      return [];
    }

    const name =
      typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : `Geocerca ${index + 1}`;

    const sedeNombre =
      typeof candidate.sedeNombre === 'string' && candidate.sedeNombre.trim()
        ? candidate.sedeNombre.trim()
        : (candidate.id === 'geofence-migrated' || candidate.id === 'b78a83d4-5901-4287-8fa8-e71ff0e2aa5e'
            ? 'Grupo Pecuario S.A.C.'
            : undefined);

    const purpose = candidate.purpose === 'cliente' || candidate.purpose === 'sede' || candidate.purpose === 'zona'
      ? candidate.purpose : undefined;
    return [{ id: candidate.id, name, geometry, ...(sedeNombre ? { sedeNombre } : {}),
      ...(purpose ? { purpose } : {}), ...(validGeofenceColor(candidate.color) ? { color: candidate.color } : {}) }];
  });

  return records.length > 0 ? records : DEFAULT_GRUPO_PECUARIO_GEOFENCES;
}

/** Recupera todas las geocercas y migra el formato anterior de una sola. */
export function loadGeofences(): GeofenceRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      const records = parseRecords(JSON.parse(raw) as unknown);
      // Asegurar que ambas geocercas maestras de la sede estén presentes
      const hasFirst = records.some((r) => r.id === 'geofence-migrated');
      const hasSecond = records.some((r) => r.id === 'b78a83d4-5901-4287-8fa8-e71ff0e2aa5e');
      if (!hasFirst || !hasSecond) {
        const merged = [...records];
        if (!hasFirst) merged.unshift(DEFAULT_GRUPO_PECUARIO_GEOFENCES[0]);
        if (!hasSecond) merged.push(DEFAULT_GRUPO_PECUARIO_GEOFENCES[1]);
        return merged;
      }
      return records;
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacy = legacyRaw
      ? parseGeofence(JSON.parse(legacyRaw) as unknown)
      : null;

    if (legacy) {
      return [
        { id: 'geofence-migrated', name: 'Geocerca 1', sedeNombre: 'Grupo Pecuario S.A.C.', geometry: legacy },
        DEFAULT_GRUPO_PECUARIO_GEOFENCES[1],
      ];
    }

    return DEFAULT_GRUPO_PECUARIO_GEOFENCES;
  } catch {
    return DEFAULT_GRUPO_PECUARIO_GEOFENCES;
  }
}


/** Persiste la colección completa de geocercas en el navegador. */
export function saveGeofences(geofences: GeofenceRecord[]): void {
  try {
    if (geofences.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(geofences));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // El almacenamiento puede estar bloqueado (modo privado); la geocerca
    // sigue funcionando durante la sesión actual.
  }
}
