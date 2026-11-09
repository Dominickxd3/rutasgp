import type { GeofenceMapRefs } from './map.types';
import * as maplibregl from 'maplibre-gl';
import { useCallback, useRef } from 'react';
import {
  averagePoint,
  clampGeofenceRadius,
  destinationPoint,
  distanceMeters,
  type LatLng,
} from '../../../lib/geo';
import type { Geofence } from '../../sede/types/geofence.types';
import {
  createGeofenceHandle,
  setDraftSource,
  setGeofenceSource,
  toCoordinate,
  withGeofencePreview,
} from './geofence.layers';
import { GEOFENCE_HANDLE_BEARING } from './map.config';
export function useMapGeofences({
  mapRef,
  geofencesRef,
  geofenceRecordsRef,
  geofenceRef,
  draftVerticesRef,
  draftCursorRef,
  onDraftVertexMoveRef,
  onGeofenceChangeRef,
}: GeofenceMapRefs) {
  const centerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const radiusMarkerRef = useRef<maplibregl.Marker | null>(null);
  const polygonVertexMarkersRef = useRef<maplibregl.Marker[]>([]);
  const polygonMidpointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const polygonMoveMarkerRef = useRef<maplibregl.Marker | null>(null);
  const draftMarkersRef = useRef<maplibregl.Marker[]>([]);
  const syncGeofence = useCallback(
    (all: Geofence[], next: Geofence | null): void => {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      setGeofenceSource(map, all, geofenceRecordsRef.current);
      centerMarkerRef.current?.remove();
      radiusMarkerRef.current?.remove();
      centerMarkerRef.current = null;
      radiusMarkerRef.current = null;
      polygonVertexMarkersRef.current.forEach((marker) => marker.remove());
      polygonVertexMarkersRef.current = [];
      polygonMidpointMarkersRef.current.forEach((marker) => marker.remove());
      polygonMidpointMarkersRef.current = [];
      polygonMoveMarkerRef.current?.remove();
      polygonMoveMarkerRef.current = null;
      if (!next) {
        return;
      }
      if (next.shape === 'circle') {
        const center: LatLng = {
          latitude: next.latitude,
          longitude: next.longitude,
        };
        const centerMarker = new maplibregl.Marker({
          element: createGeofenceHandle(
            'center',
            'Mover el centro de la geocerca',
          ),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat([center.longitude, center.latitude])
          .addTo(map);
        centerMarker.on('drag', () => {
          const current = geofenceRef.current;
          const position = centerMarker.getLngLat();
          if (!current || current.shape !== 'circle') {
            return;
          }
          setGeofenceSource(
            map,
            withGeofencePreview(geofencesRef.current, current, {
              shape: 'circle',
              latitude: position.lat,
              longitude: position.lng,
              radius: current.radius,
            }),
            geofenceRecordsRef.current,
          );
          const handlePosition = destinationPoint(
            {
              latitude: position.lat,
              longitude: position.lng,
            },
            current.radius,
            GEOFENCE_HANDLE_BEARING,
          );
          radiusMarkerRef.current?.setLngLat([
            handlePosition.longitude,
            handlePosition.latitude,
          ]);
        });
        centerMarker.on('dragend', () => {
          const current = geofenceRef.current;
          const position = centerMarker.getLngLat();
          if (!current || current.shape !== 'circle') {
            return;
          }
          onGeofenceChangeRef.current?.({
            shape: 'circle',
            latitude: position.lat,
            longitude: position.lng,
            radius: current.radius,
          });
        });
        const handlePoint = destinationPoint(
          center,
          next.radius,
          GEOFENCE_HANDLE_BEARING,
        );
        const radiusMarker = new maplibregl.Marker({
          element: createGeofenceHandle(
            'radius',
            'Ajustar el radio de la geocerca',
          ),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat([handlePoint.longitude, handlePoint.latitude])
          .addTo(map);
        radiusMarker.on('drag', () => {
          const current = geofenceRef.current;
          const position = radiusMarker.getLngLat();
          if (!current || current.shape !== 'circle') {
            return;
          }
          const radius = clampGeofenceRadius(
            distanceMeters(
              {
                latitude: current.latitude,
                longitude: current.longitude,
              },
              {
                latitude: position.lat,
                longitude: position.lng,
              },
            ),
          );
          setGeofenceSource(
            map,
            withGeofencePreview(geofencesRef.current, current, {
              ...current,
              radius,
            }),
            geofenceRecordsRef.current,
          );
        });
        radiusMarker.on('dragend', () => {
          const current = geofenceRef.current;
          const position = radiusMarker.getLngLat();
          if (!current || current.shape !== 'circle') {
            return;
          }
          onGeofenceChangeRef.current?.({
            ...current,
            radius: clampGeofenceRadius(
              distanceMeters(
                {
                  latitude: current.latitude,
                  longitude: current.longitude,
                },
                {
                  latitude: position.lat,
                  longitude: position.lng,
                },
              ),
            ),
          });
        });
        centerMarkerRef.current = centerMarker;
        radiusMarkerRef.current = radiusMarker;
        return;
      }
      const vertices = next.vertices;
      const vertexCount = vertices.length;
      polygonVertexMarkersRef.current = vertices.map((vertex, index) => {
        const marker = new maplibregl.Marker({
          element: createGeofenceHandle(
            'vertex',
            `Mover el vértice ${index + 1}`,
          ),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat(toCoordinate(vertex))
          .addTo(map);
        marker.on('drag', () => {
          const current = geofenceRef.current;
          const position = marker.getLngLat();
          if (!current || current.shape !== 'polygon') {
            return;
          }
          setGeofenceSource(
            map,
            withGeofencePreview(geofencesRef.current, current, {
              shape: 'polygon',
              vertices: current.vertices.map((item, itemIndex) =>
                itemIndex === index
                  ? {
                      latitude: position.lat,
                      longitude: position.lng,
                    }
                  : item,
              ),
            }),
            geofenceRecordsRef.current,
          );
        });
        marker.on('dragend', () => {
          const current = geofenceRef.current;
          const position = marker.getLngLat();
          if (!current || current.shape !== 'polygon') {
            return;
          }
          onGeofenceChangeRef.current?.({
            shape: 'polygon',
            vertices: current.vertices.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    latitude: position.lat,
                    longitude: position.lng,
                  }
                : item,
            ),
          });
        });
        return marker;
      });
      polygonMidpointMarkersRef.current = vertices.map((vertex, index) => {
        const nextVertex = vertices[(index + 1) % vertexCount];
        const midpoint: LatLng = {
          latitude: (vertex.latitude + nextVertex.latitude) / 2,
          longitude: (vertex.longitude + nextVertex.longitude) / 2,
        };
        const marker = new maplibregl.Marker({
          element: createGeofenceHandle(
            'midpoint',
            `Arrastrar para agregar un vértice entre ${index + 1} y ${((index + 1) % vertexCount) + 1}`,
          ),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat(toCoordinate(midpoint))
          .addTo(map);
        const previewVertices = (position: maplibregl.LngLat): LatLng[] => {
          const current = geofenceRef.current;
          if (!current || current.shape !== 'polygon') {
            return [];
          }
          const nextVertices = [...current.vertices];
          nextVertices.splice(index + 1, 0, {
            latitude: position.lat,
            longitude: position.lng,
          });
          return nextVertices;
        };
        marker.on('drag', () => {
          const current = geofenceRef.current;
          const verticesPreview = previewVertices(marker.getLngLat());
          if (!current || verticesPreview.length === 0) {
            return;
          }
          setGeofenceSource(
            map,
            withGeofencePreview(geofencesRef.current, current, {
              shape: 'polygon',
              vertices: verticesPreview,
            }),
            geofenceRecordsRef.current,
          );
        });
        marker.on('dragend', () => {
          const verticesPreview = previewVertices(marker.getLngLat());
          if (verticesPreview.length === 0) {
            return;
          }
          onGeofenceChangeRef.current?.({
            shape: 'polygon',
            vertices: verticesPreview,
          });
        });
        return marker;
      });
      const centroid = averagePoint(vertices);
      if (centroid) {
        const moveMarker = new maplibregl.Marker({
          element: createGeofenceHandle('move', 'Mover toda la geocerca'),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat(toCoordinate(centroid))
          .addTo(map);
        const translatedVertices = (position: maplibregl.LngLat): LatLng[] => {
          const current = geofenceRef.current;
          if (!current || current.shape !== 'polygon') {
            return [];
          }
          const origin = averagePoint(current.vertices);
          if (!origin) {
            return [];
          }
          const deltaLatitude = position.lat - origin.latitude;
          const deltaLongitude = position.lng - origin.longitude;
          return current.vertices.map((vertex) => ({
            latitude: vertex.latitude + deltaLatitude,
            longitude: vertex.longitude + deltaLongitude,
          }));
        };
        moveMarker.on('drag', () => {
          const current = geofenceRef.current;
          const preview = translatedVertices(moveMarker.getLngLat());
          if (!current || preview.length === 0) {
            return;
          }
          setGeofenceSource(
            map,
            withGeofencePreview(geofencesRef.current, current, {
              shape: 'polygon',
              vertices: preview,
            }),
            geofenceRecordsRef.current,
          );
        });
        moveMarker.on('dragend', () => {
          const preview = translatedVertices(moveMarker.getLngLat());
          if (preview.length === 0) {
            return;
          }
          onGeofenceChangeRef.current?.({
            shape: 'polygon',
            vertices: preview,
          });
        });
        polygonMoveMarkerRef.current = moveMarker;
      }
    },
    [],
  );
  const syncDraft = useCallback((vertices: LatLng[], active: boolean): void => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    setDraftSource(map, vertices, active ? draftCursorRef.current : null);
    draftMarkersRef.current.forEach((marker) => marker.remove());
    draftMarkersRef.current = [];
    if (!active) {
      return;
    }
    draftMarkersRef.current = vertices.map((vertex, index) => {
      const marker = new maplibregl.Marker({
        element: createGeofenceHandle(
          'draft',
          `Mover el vértice ${index + 1} del polígono`,
        ),
        anchor: 'center',
        draggable: true,
      })
        .setLngLat(toCoordinate(vertex))
        .addTo(map);
      marker.on('drag', () => {
        const position = marker.getLngLat();
        const preview = draftVerticesRef.current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                latitude: position.lat,
                longitude: position.lng,
              }
            : item,
        );
        setDraftSource(map, preview, draftCursorRef.current);
      });
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        onDraftVertexMoveRef.current?.(index, {
          latitude: position.lat,
          longitude: position.lng,
        });
      });
      return marker;
    });
  }, []);
  const cleanupGeofences = useCallback(() => {
    centerMarkerRef.current?.remove();
    radiusMarkerRef.current?.remove();
    centerMarkerRef.current = null;
    radiusMarkerRef.current = null;
    polygonVertexMarkersRef.current.forEach((marker) => marker.remove());
    polygonVertexMarkersRef.current = [];
    polygonMidpointMarkersRef.current.forEach((marker) => marker.remove());
    polygonMidpointMarkersRef.current = [];
    polygonMoveMarkerRef.current?.remove();
    polygonMoveMarkerRef.current = null;
    draftMarkersRef.current.forEach((marker) => marker.remove());
    draftMarkersRef.current = [];
  }, []);
  return { syncGeofence, syncDraft, cleanupGeofences };
}
