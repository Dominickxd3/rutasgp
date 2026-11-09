import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { distanceMeters } from '../../../lib/geo';
import { resolveRouteMarkers } from '../../../lib/historyAnalysis';
import type { HistoryVisualization } from '../../historial/types/history.types';
export function historyCollections(history: HistoryVisualization | null) {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  if (!history) return { observed: empty, gaps: empty, markers: empty };
  // 1. Asegurar orden cronológico estricto por fecha GPS (Req 10)
  const rawPoints = history.result.points.slice(0, history.visiblePoints);
  if (rawPoints.length === 0)
    return { observed: empty, gaps: empty, markers: empty };
  const points = [...rawPoints].sort(
    (a, b) => new Date(a.gpsDate).getTime() - new Date(b.gpsDate).getTime(),
  );
  const gapMap = new Map(
    history.result.gaps.map((gap) => [`${gap.from}|${gap.to}`, gap]),
  );
  const observedFeatures: Feature<LineString>[] = [];
  const gapFeatures: Feature<LineString>[] = [];
  const gapEndpoints: Feature<Point>[] = [];
  // La línea azul se reserva para geometría ajustada a calles. Si OSRM no
  // pudo resolver un segmento, se presenta discontinuo como estimado.
  const roadSegments = history.result.roadSegments ?? [];
  const isFullView = history.visiblePoints >= history.result.points.length;
  if (roadSegments.length > 0) {
    const totalCoordinates = roadSegments.reduce(
      (sum, road) => sum + road.coordinates.length,
      0,
    );
    let remaining = isFullView
      ? totalCoordinates
      : Math.max(
          2,
          Math.ceil(
            totalCoordinates *
              (rawPoints.length / history.result.points.length),
          ),
        );
    for (const road of roadSegments) {
      if (remaining < 2) break;
      const count = isFullView
        ? road.coordinates.length
        : Math.min(road.coordinates.length, remaining);
      const coordinates = road.coordinates.slice(0, Math.max(2, count));
      const feature: Feature<LineString> = {
        type: 'Feature',
        properties: {
          kind: road.role ?? road.kind,
          confidence: road.confidence,
        },
        geometry: { type: 'LineString', coordinates },
      };
      if (road.kind === 'matched') observedFeatures.push(feature);
      else gapFeatures.push(feature);
      remaining -= count;
    }
  }
  let segment: [number, number][] = [[points[0].longitude, points[0].latitude]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const coordinate: [number, number] = [current.longitude, current.latitude];
    const gapKey = `${previous.gpsDate}|${current.gpsDate}`;
    if (gapMap.has(gapKey)) {
      if (segment.length > 1 && roadSegments.length === 0) {
        gapFeatures.push({
          type: 'Feature',
          properties: { kind: 'unmatched' },
          geometry: { type: 'LineString', coordinates: segment },
        });
      }
      const gapObj = gapMap.get(gapKey);
      // Si el salto de cobertura tiene trazado vial estimado con OSRM route,
      // se utiliza esa geometría en lugar de una recta aérea que atraviese edificios.
      const endpoints = [[previous.longitude, previous.latitude], coordinate];
      const gapCoords = gapObj?.coordinates;
      const distance = distanceMeters(previous, current);
      const properties = {
        kind: 'coverage-gap',
        from: previous.gpsDate,
        to: current.gpsDate,
        seconds:
          gapObj?.seconds ??
          (Date.parse(current.gpsDate) - Date.parse(previous.gpsDate)) / 1000,
        distance,
        fromLat: previous.latitude,
        fromLng: previous.longitude,
        toLat: current.latitude,
        toLng: current.longitude,
      };
      gapEndpoints.push(
        ...endpoints.map((coordinates) => ({
          type: 'Feature' as const,
          properties,
          geometry: { type: 'Point' as const, coordinates },
        })),
      );
      if (gapCoords && gapCoords.length > 1)
        gapFeatures.push({
          type: 'Feature',
          properties,
          geometry: {
            type: 'LineString',
            coordinates: gapCoords,
          },
        });
      segment = [coordinate];
    } else {
      segment.push(coordinate);
    }
  }
  if (segment.length > 1 && roadSegments.length === 0) {
    gapFeatures.push({
      type: 'Feature',
      properties: { kind: 'unmatched' },
      geometry: { type: 'LineString', coordinates: segment },
    });
  }
  const last = points.at(-1)!;
  const visibleUntil = new Date(last.gpsDate).getTime();
  // 2. Resolver marcadores diferenciando Salida de Sede, Inicio de tramo, Fin y Retorno (Req 2, Req 3, Req 5, Req 9)
  const markers = resolveRouteMarkers({
    points,
    stops: history.result.stops,
    geofenceEvents: history.result.geofenceEvents,
    visibleUntil,
  });
  const markerFeatures: Feature<Point>[] = markers.map((m) => ({
    type: 'Feature' as const,
    properties: {
      kind: m.kind,
      label: m.sublabel ? `${m.label} (${m.sublabel})` : m.label,
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [m.longitude, m.latitude],
    },
  }));
  return {
    observed: {
      type: 'FeatureCollection' as const,
      features: observedFeatures,
    },
    gaps: { type: 'FeatureCollection' as const, features: gapFeatures },
    markers: {
      type: 'FeatureCollection' as const,
      features: [...markerFeatures, ...gapEndpoints],
    },
  };
}
