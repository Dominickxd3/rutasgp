import type { GeofenceRecord } from '../features/sede/types/geofence.types';
import type { HistoryResult } from '../features/historial/types/history.types';
import { distanceMeters, distanceToPolygonMeters, polygonContains, type LatLng } from './geo';

export interface GeofenceTransition {
  name: string;
  type: 'entrada' | 'salida';
  date: string;
}

interface GeofenceGroup {
  name: string;
  records: GeofenceRecord[];
}

function isInsideRecord(location: LatLng, record: GeofenceRecord, toleranceMeters: number): boolean {
  if (record.geometry.shape === 'circle') {
    const distance = distanceMeters(location, {
      latitude: record.geometry.latitude,
      longitude: record.geometry.longitude,
    });
    return toleranceMeters > 0
      ? distance <= record.geometry.radius + toleranceMeters
      : distance <= Math.max(0, record.geometry.radius - Math.abs(toleranceMeters));
  }

  if (polygonContains(location, record.geometry.vertices)) {
    return true;
  }

  if (toleranceMeters > 0) {
    return distanceToPolygonMeters(location, record.geometry.vertices) <= toleranceMeters;
  }

  return false;
}

export function detectGeofenceTransitions(
  result: HistoryResult,
  geofences: GeofenceRecord[],
): GeofenceTransition[] {
  // Agrupar geocercas que pertenecen a la misma sede lógica (ej. Grupo Pecuario S.A.C.)
  const groupsMap = new Map<string, GeofenceGroup>();

  for (const record of geofences) {
    if (record.purpose === 'cliente') continue;
    const groupKey = record.sedeNombre || record.id;
    const groupName = record.sedeNombre || record.name;
    const existing = groupsMap.get(groupKey);

    if (existing) {
      existing.records.push(record);
    } else {
      groupsMap.set(groupKey, { name: groupName, records: [record] });
    }
  }

  return Array.from(groupsMap.values()).flatMap((group) => {
    let stable: boolean | null = null;
    let candidate: boolean | null = null;
    let confirmations = 0;
    const events: GeofenceTransition[] = [];

    for (const point of result.points) {
      const location = { latitude: point.latitude, longitude: point.longitude };
      const tolerance = stable === true ? 20 : 0;
      const inside = group.records.some((record) =>
        isInsideRecord(location, record, tolerance),
      );

      if (stable === null) {
        stable = inside;
        continue;
      }

      if (inside === stable) {
        candidate = null;
        confirmations = 0;
        continue;
      }

      if (candidate !== inside) {
        candidate = inside;
        confirmations = 1;
      } else {
        confirmations += 1;
      }

      if (confirmations >= 3) {
        stable = inside;
        candidate = null;
        confirmations = 0;
        events.push({
          name: group.name,
          type: inside ? 'entrada' : 'salida',
          date: point.gpsDate,
        });
      }
    }

    return events;
  });
}

export interface RouteMarker {
  kind: 'departure' | 'arrival' | 'start' | 'end' | 'stop';
  label: string;
  sublabel?: string;
  latitude: number;
  longitude: number;
  date?: string;
}

export function resolveRouteMarkers(params: {
  points: HistoryResult['points'];
  stops: HistoryResult['stops'];
  geofenceEvents?: HistoryResult['geofenceEvents'];
  visibleUntil?: number;
}): RouteMarker[] {
  const rawPoints = params.points;
  if (!rawPoints || rawPoints.length === 0) return [];

  // 1. Asegurar orden cronológico estricto por fecha GPS (Req 10)
  const sortedPoints = [...rawPoints].sort(
    (a, b) => new Date(a.gpsDate).getTime() - new Date(b.gpsDate).getTime(),
  );

  const visiblePoints = params.visibleUntil
    ? sortedPoints.filter((p) => new Date(p.gpsDate).getTime() <= params.visibleUntil!)
    : sortedPoints;

  if (visiblePoints.length === 0) return [];

  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return iso;
    }
  };

  const markers: RouteMarker[] = [];
  const events = params.geofenceEvents ?? [];

  // 2. Incorporar eventos confirmados de Salida y Retorno a sede desde GPS_GeocercaEventos (Req 3, Req 6, Req 9, Req 11)
  for (const evt of events) {
    const evtTime = new Date(evt.fechaGpsUtc).getTime();
    if (params.visibleUntil && evtTime > params.visibleUntil) continue;

    // Buscar el punto coincidente en la trayectoria visible
    const matchingPt =
      visiblePoints.find((p) => p.id === evt.idPosicion) ??
      visiblePoints.find((p) => Math.abs(new Date(p.gpsDate).getTime() - evtTime) <= 120_000);

    const lat = matchingPt?.latitude ?? evt.latitude;
    const lon = matchingPt?.longitude ?? evt.longitude;

    if (lat !== undefined && lon !== undefined) {
      if (evt.tipoEvento === 'SALIDA') {
        markers.push({
          kind: 'departure',
          label: 'Salida de sede',
          sublabel: formatTime(evt.fechaGpsUtc),
          latitude: lat,
          longitude: lon,
          date: evt.fechaGpsUtc,
        });
      } else if (evt.tipoEvento === 'ENTRADA') {
        markers.push({
          kind: 'arrival',
          label: 'Retorno a sede',
          sublabel: formatTime(evt.fechaGpsUtc),
          latitude: lat,
          longitude: lon,
          date: evt.fechaGpsUtc,
        });
      }
    }
  }

  // 3. Evaluar el inicio del tramo observado (Req 2, Req 4, Req 5, Req 7)
  const first = visiblePoints[0];
  const firstTime = new Date(first.gpsDate).getTime();
  const hasDepartureAtFirst = markers.some(
    (m) =>
      m.kind === 'departure' &&
      Math.abs(new Date(m.date ?? '').getTime() - firstTime) <= 180_000 &&
      distanceMeters(
        { latitude: m.latitude, longitude: m.longitude },
        { latitude: first.latitude, longitude: first.longitude },
      ) <= 200,
  );

  // Si no coincide con una salida confirmada de sede, es la primera posición disponible fuera de sede
  if (!hasDepartureAtFirst) {
    markers.unshift({
      kind: 'start',
      label: 'Primera posición disponible',
      sublabel: formatTime(first.gpsDate),
      latitude: first.latitude,
      longitude: first.longitude,
      date: first.gpsDate,
    });
  }

  // 4. Evaluar el fin del tramo observado (Req 9)
  const last = visiblePoints[visiblePoints.length - 1];
  const lastTime = new Date(last.gpsDate).getTime();
  const hasArrivalAtLast = markers.some(
    (m) =>
      m.kind === 'arrival' &&
      Math.abs(new Date(m.date ?? '').getTime() - lastTime) <= 180_000 &&
      distanceMeters(
        { latitude: m.latitude, longitude: m.longitude },
        { latitude: last.latitude, longitude: last.longitude },
      ) <= 200,
  );

  if (!hasArrivalAtLast && (last !== first || !hasDepartureAtFirst)) {
    markers.push({
      kind: 'end',
      label: 'Última posición disponible',
      sublabel: formatTime(last.gpsDate),
      latitude: last.latitude,
      longitude: last.longitude,
      date: last.gpsDate,
    });
  }

  // 5. Paradas observadas
  const maxVisibleTime = new Date(last.gpsDate).getTime();
  for (const stop of params.stops) {
    const stopEndTime = new Date(stop.end).getTime();
    if (stopEndTime <= maxVisibleTime) {
      markers.push({
        kind: 'stop',
        label: `Parada ${Math.round(stop.seconds / 60)} min`,
        latitude: stop.latitude,
        longitude: stop.longitude,
        date: stop.start,
      });
    }
  }

  return markers;
}

