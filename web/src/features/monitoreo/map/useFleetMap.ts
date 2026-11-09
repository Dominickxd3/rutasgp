import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from 'react';
import { mapConfig } from '../../../config/map';
import { type LatLng } from '../../../lib/geo';
import type { FleetUnit } from '../../flota/types/fleet.types';
import {
  addFleetLayers,
  createCompanyMarkerElement,
  loadVehicleImages,
} from './fleet.layers';
import { buildFeatureCollection, buildPopupHtml } from './fleet.utils';
import {
  addDraftLayers,
  addGeofenceLayers,
  setDraftSource,
} from './geofence.layers';
import { addHistoryLayers, setHistorySources } from './history.layers';
import {
  CLICKABLE_LAYERS,
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_LAYER_ID,
  FOCUS_ZOOM,
  GEOFENCE_FILL_LAYER_ID,
  GEOFENCE_LINE_LAYER_ID,
  HISTORY_OBSERVED_SOURCE_ID,
  SOURCE_ID,
  UNIT_LABEL_LAYER_ID,
  UNIT_LAYER_ID,
} from './map.config';
import type { FleetMapHandle, FleetMapProps } from './map.types';
import { useMapGeofences } from './useMapGeofences';
maplibregl.setWorkerUrl(maplibreWorkerUrl);
export function useFleetMap(
  {
    units,
    onSelect,
    geofences,
    geofenceRecords,
    geofence,
    draftVertices,
    placingShape,
    onPickPoint,
    onDraftVertexMove,
    onGeofenceChange,
    history,
    showGpsGaps,
  }: FleetMapProps,
  ref: ForwardedRef<FleetMapHandle>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const activeUnitIdRef = useRef<string | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const unitsRef = useRef(units);
  const onSelectRef = useRef(onSelect);
  const geofencesRef = useRef(geofences);
  const geofenceRecordsRef = useRef(geofenceRecords);
  const geofenceRef = useRef(geofence);
  const draftVerticesRef = useRef(draftVertices);
  const placingShapeRef = useRef(placingShape);
  const onPickPointRef = useRef(onPickPoint);
  const onDraftVertexMoveRef = useRef(onDraftVertexMove);
  const onGeofenceChangeRef = useRef(onGeofenceChange);
  const historyRef = useRef(history);
  const showGpsGapsRef = useRef(showGpsGaps);
  showGpsGapsRef.current = showGpsGaps;
  const historyFitKeyRef = useRef<string | null>(null);
  const draftCursorRef = useRef<LatLng | null>(null);
  const companyMarkerRef = useRef<maplibregl.Marker | null>(null);
  unitsRef.current = units;
  geofencesRef.current = geofences;
  geofenceRecordsRef.current = geofenceRecords;
  geofenceRef.current = geofence;
  draftVerticesRef.current = draftVertices;
  placingShapeRef.current = placingShape;
  historyRef.current = history;
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onPickPointRef.current = onPickPoint;
  }, [onPickPoint]);
  useEffect(() => {
    onDraftVertexMoveRef.current = onDraftVertexMove;
  }, [onDraftVertexMove]);
  useEffect(() => {
    onGeofenceChangeRef.current = onGeofenceChange;
  }, [onGeofenceChange]);
  const { syncGeofence, syncDraft, cleanupGeofences } = useMapGeofences({
    mapRef,
    geofencesRef,
    geofenceRecordsRef,
    geofenceRef,
    draftVerticesRef,
    draftCursorRef,
    onDraftVertexMoveRef,
    onGeofenceChangeRef,
  });
  const showPopup = useCallback((unit: FleetUnit): void => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      className: 'fleet-popup',
      maxWidth: '300px',
      offset: 20,
      closeButton: true,
    })
      .setLngLat([unit.longitud, unit.latitud])
      .setHTML(buildPopupHtml(unit))
      .addTo(map);
    popup.on('close', () => {
      if (popupRef.current === popup) {
        popupRef.current = null;
        activeUnitIdRef.current = null;
      }
    });
    popupRef.current = popup;
    activeUnitIdRef.current = unit.idUnidad;
  }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }
    const map = new maplibregl.Map({
      container,
      style: mapConfig.styleUrl,
      center: [mapConfig.center.longitude, mapConfig.center.latitude],
      zoom: mapConfig.zoom,
      pitch: mapConfig.pitch,
      bearing: mapConfig.bearing,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      attributionControl: { compact: true },
      maplibreLogo: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      'bottom-right',
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }),
      'bottom-left',
    );
    mapRef.current = map;
    const handleCloseHq = (): void => {
      const el = companyMarkerRef.current?.getElement();
      const card = el?.querySelector('.company-hq-marker__card');
      card?.classList.remove('company-hq-marker__card--visible');
    };
    map.on('load', () => {
      void (async () => {
        await loadVehicleImages(map);
        if (mapRef.current !== map || map.getSource(SOURCE_ID)) {
          return;
        }
        addGeofenceLayers(map);
        addDraftLayers(map);
        addHistoryLayers(map);
        addFleetLayers(map);
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData(buildFeatureCollection(unitsRef.current));
        syncGeofence(geofencesRef.current, geofenceRef.current);
        syncDraft(
          draftVerticesRef.current,
          placingShapeRef.current === 'polygon',
        );
        setHistorySources(map, historyRef.current);
        map.setLayoutProperty(
          'history-coverage-gap-line',
          'visibility',
          showGpsGapsRef.current ? 'visible' : 'none',
        );
        companyMarkerRef.current = new maplibregl.Marker({
          element: createCompanyMarkerElement(handleCloseHq),
          anchor: 'bottom',
        })
          .setLngLat([-77.01368, -11.97998])
          .addTo(map);

        map.on('click', (event) => {
          if (placingShapeRef.current !== null) {
            const interactive = map.queryRenderedFeatures(event.point, {
              layers: CLICKABLE_LAYERS,
            });
            if (interactive.length > 0) {
              return;
            }
            onPickPointRef.current?.({
              latitude: event.lngLat.lat,
              longitude: event.lngLat.lng,
            });
            return;
          }

          // Si el click fue fuera de cualquier geocerca, ocultar el card
          const geofenceHits = map.queryRenderedFeatures(event.point, {
            layers: [GEOFENCE_FILL_LAYER_ID, GEOFENCE_LINE_LAYER_ID],
          });
          if (geofenceHits.length === 0) {
            handleCloseHq();
          }
        });
        map.on('mousemove', (event) => {
          if (placingShapeRef.current !== 'polygon') {
            return;
          }
          draftCursorRef.current = {
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          };
          setDraftSource(map, draftVerticesRef.current, draftCursorRef.current);
        });
        map.on('mouseout', () => {
          if (placingShapeRef.current !== 'polygon') {
            return;
          }
          draftCursorRef.current = null;
          setDraftSource(map, draftVerticesRef.current, null);
        });
      })();
    });
    const findUnit = (
      event: MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ): FleetUnit | null => {
      const id = event.features?.[0]?.properties?.idUnidad as
        | string
        | undefined;
      if (!id) {
        return null;
      }
      return unitsRef.current.find((item) => item.idUnidad === id) ?? null;
    };
    const handleClusterClick = (
      event: MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ): void => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id as number | undefined;
      if (clusterId === undefined) {
        return;
      }
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) {
        return;
      }
      void source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          if (mapRef.current !== map) {
            return;
          }
          map.easeTo({
            center: event.lngLat,
            zoom,
            duration: 600,
          });
        })
        .catch(() => undefined);
    };
    [CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID].forEach((layerId) => {
      map.on('click', layerId, handleClusterClick);
    });
    const handleUnitClick = (
      event: MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ): void => {
      handleCloseHq();
      const unit = findUnit(event);
      if (unit) {
        onSelectRef.current?.(unit);
      }
    };
    [UNIT_LAYER_ID, UNIT_LABEL_LAYER_ID].forEach(
      (layerId) => {
        map.on('click', layerId, handleUnitClick);
      },
    );

    const handleGeofenceClick = (
      event: MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ): void => {
      if (placingShapeRef.current !== null) {
        return;
      }
      const interactive = map.queryRenderedFeatures(event.point, {
        layers: [
          CLUSTER_LAYER_ID,
          CLUSTER_COUNT_LAYER_ID,
          UNIT_LAYER_ID,
          UNIT_LABEL_LAYER_ID,
        ],
      });
      if (interactive.length > 0) {
        return;
      }

      const feature = event.features?.[0];
      if (feature?.properties?.purpose === 'cliente') {
        popupRef.current?.remove();
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = String(feature.properties.name ?? 'Cliente');
        const label = document.createElement('p');
        label.textContent = 'Ubicación de cliente';
        content.append(title, label);
        popupRef.current = new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map);
        return;
      }
      const el = companyMarkerRef.current?.getElement();
      if (!el) return;
      const card = el.querySelector('.company-hq-marker__card');
      if (!card) return;

      const titleEl = el.querySelector('.company-hq-marker__title');
      const subtitleEl = el.querySelector('.company-hq-marker__subtitle');


      const name =
        (feature?.properties?.name as string) || 'Grupo Pecuario S.A.C.';
      const subtitle =
        (feature?.properties?.sedeNombre as string) || 'Sede Canto Bello 177';

      if (titleEl) titleEl.textContent = name;
      if (subtitleEl) subtitleEl.textContent = subtitle;

      companyMarkerRef.current?.setLngLat(event.lngLat);
      card.classList.toggle('company-hq-marker__card--visible');
    };
    [GEOFENCE_FILL_LAYER_ID, GEOFENCE_LINE_LAYER_ID].forEach((layerId) => {
      map.on('click', layerId, handleGeofenceClick);
    });
    map.on('mouseenter', CLICKABLE_LAYERS, () => {
      map.getCanvas().style.cursor =
        placingShapeRef.current !== null ? 'crosshair' : 'pointer';
    });
    map.on('mouseleave', CLICKABLE_LAYERS, () => {
      map.getCanvas().style.cursor =
        placingShapeRef.current !== null ? 'crosshair' : '';
    });
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      popupRef.current?.remove();
      popupRef.current = null;
      activeUnitIdRef.current = null;
      cleanupGeofences();
      companyMarkerRef.current?.remove();
      companyMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [syncDraft, syncGeofence, cleanupGeofences]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!map || !source) {
      return;
    }
    source.setData(buildFeatureCollection(units));
    const activeId = activeUnitIdRef.current;
    if (!activeId) {
      return;
    }
    const activeUnit = units.find((unit) => unit.idUnidad === activeId);
    if (!activeUnit) {
      popupRef.current?.remove();
      return;
    }
    popupRef.current
      ?.setLngLat([activeUnit.longitud, activeUnit.latitud])
      .setHTML(buildPopupHtml(activeUnit));
  }, [units]);
  useEffect(() => {
    syncGeofence(geofences, geofence);
  }, [geofences, geofence, geofenceRecords, syncGeofence]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(HISTORY_OBSERVED_SOURCE_ID)) return;
    setHistorySources(map, history);
    if (!history || history.result.points.length === 0) {
      historyFitKeyRef.current = null;
      return;
    }
    // En una ruta en vivo cambia `to` cada 30 s. Encuadramos solamente al
    // cargar el recorrido por primera vez para no mover el mapa al usuario.
    const key = `${history.result.vehicleId}|${history.result.interval.from}`;
    if (historyFitKeyRef.current === key) return;
    historyFitKeyRef.current = key;
    const points = history.result.points;
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 17, duration: 800 });
  }, [history]);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('history-coverage-gap-line')) {
      map.setLayoutProperty(
        'history-coverage-gap-line',
        'visibility',
        showGpsGaps ? 'visible' : 'none',
      );
    }
  }, [showGpsGaps]);
  useEffect(() => {
    if (placingShape !== 'polygon') {
      draftCursorRef.current = null;
    }
    syncDraft(draftVertices, placingShape === 'polygon');
  }, [draftVertices, placingShape, syncDraft]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.getCanvas().style.cursor = placingShape ? 'crosshair' : '';
  }, [placingShape]);
  const focusUnit = useCallback(
    (unit: FleetUnit): void => {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      map.flyTo({
        center: [unit.longitud, unit.latitud],
        zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
        duration: 800,
        essential: true,
      });
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
      }
      focusTimerRef.current = window.setTimeout(() => {
        const current =
          unitsRef.current.find((item) => item.idUnidad === unit.idUnidad) ??
          unit;
        showPopup(current);
        focusTimerRef.current = null;
      }, 850);
    },
    [showPopup],
  );
  const fitAll = useCallback((): void => {
    const map = mapRef.current;
    const allUnits = unitsRef.current;
    if (!map || allUnits.length === 0) {
      return;
    }
    popupRef.current?.remove();
    popupRef.current = null;
    activeUnitIdRef.current = null;
    const longitudes = allUnits.map((unit) => unit.longitud);
    const latitudes = allUnits.map((unit) => unit.latitud);
    const southWest: [number, number] = [
      Math.min(...longitudes),
      Math.min(...latitudes),
    ];
    const northEast: [number, number] = [
      Math.max(...longitudes),
      Math.max(...latitudes),
    ];
    if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
      map.flyTo({
        center: southWest,
        zoom: Math.max(map.getZoom(), 15),
        duration: 900,
      });
      return;
    }
    map.fitBounds([southWest, northEast], {
      padding: 72,
      maxZoom: 15,
      duration: 900,
    });
  }, []);
  const resize = useCallback((): void => {
    mapRef.current?.resize();
  }, []);
  const panTo = useCallback((lngLat: [number, number]): void => {
    mapRef.current?.panTo(lngLat, { duration: 800, essential: true });
  }, []);

  useImperativeHandle(ref, () => ({ focusUnit, fitAll, resize, panTo }), [
    focusUnit,
    fitAll,
    resize,
    panTo,
  ]);
  return containerRef;
}
