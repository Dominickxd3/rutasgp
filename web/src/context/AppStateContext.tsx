import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import type { FleetMapHandle } from '../features/monitoreo/components/FleetMap';
import { useFleet } from '../features/flota/hooks/useFleet';
import {
  clampGeofenceRadius,
  DEFAULT_GEOFENCE_RADIUS,
  distanceMeters,
  MIN_POLYGON_VERTICES,
  polygonAreaMeters,
  polygonContains,
  type LatLng,
} from '../lib/geo';
import { loadGeofences, saveGeofences } from '../lib/geofenceStorage';
import type { FleetSnapshot, FleetUnit } from '../features/flota/types/fleet.types';
import type {
  Geofence,
  GeofenceRecord,
  GeofenceShape,
  GeofenceAppearance,
} from '../features/sede/types/geofence.types';
import { validGeofenceColor } from '../features/sede/utils/geofence-appearance.utils';
import type { HistoryVisualization } from '../features/historial/types/history.types';
import type { TripRecord } from '../features/recorridos/types/trip.types';

interface AppStateValue {
  snapshot: FleetSnapshot | null;
  units: FleetUnit[];
  error: string | null;
  isRefreshing: boolean;
  hasLoaded: boolean;
  refresh: () => void;

  geofences: GeofenceRecord[];
  selectedGeofenceId: string | null;
  selectedGeofenceRecord: GeofenceRecord | null;
  geofence: Geofence | null;
  placingShape: GeofenceShape | null;
  draftVertices: LatLng[];
  unitsInsideGeofence: number;
  unitsInsideSede: number;
  geofenceArea: number;

  history: HistoryVisualization | null;
  setHistory: (value: HistoryVisualization | null) => void;
  showGpsGaps: boolean;
  setShowGpsGaps: (value: boolean) => void;
  activeTripsCount: number;
  setActiveTripsCount: (value: number) => void;
  selectedTrip: TripRecord | null;
  setSelectedTrip: (trip: TripRecord | null) => void;

  mapRef: RefObject<FleetMapHandle>;
  selectedUnit: FleetUnit | null;
  setSelectedUnit: (unit: FleetUnit | null) => void;
  focusUnit: (unit: FleetUnit) => void;
  fitAll: () => void;

  setSelectedGeofenceId: (id: string | null) => void;
  handlePickPoint: (point: LatLng) => void;
  handleDraftVertexMove: (index: number, point: LatLng) => void;
  handleFinishPolygon: () => void;
  handleCancelPlacement: () => void;
  handleUndoDraftVertex: () => void;
  handleGeofenceChange: (next: Geofence) => void;
  handleGeofenceRadiusChange: (radius: number | null | undefined) => void;
  handleStartGeofencePlacement: (shape: GeofenceShape, appearance?: GeofenceAppearance) => void;
  handleGeofenceAppearanceChange: (appearance: GeofenceAppearance) => void;
  handleClearGeofence: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function createGeofenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `geofence-${Date.now()}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { snapshot, units, error, isRefreshing, hasLoaded, refresh } =
    useFleet();
  const [geofences, setGeofences] = useState<GeofenceRecord[]>(() =>
    loadGeofences(),
  );
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<string | null>(
    null,
  );
  const [placingShape, setPlacingShape] = useState<GeofenceShape | null>(null);
  const placementAppearanceRef = useRef<GeofenceAppearance | null>(null);
  const [draftVertices, setDraftVertices] = useState<LatLng[]>([]);
  const [history, setHistory] = useState<HistoryVisualization | null>(null);
  const [showGpsGaps, setShowGpsGaps] = useState(true);
  const [activeTripsCount, setActiveTripsCount] = useState<number>(0);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
  const mapRef = useRef<FleetMapHandle>(null);

  const selectedGeofenceRecord = useMemo(
    () => geofences.find((item) => item.id === selectedGeofenceId) ?? null,
    [geofences, selectedGeofenceId],
  );

  const geofence = useMemo(
    () => selectedGeofenceRecord?.geometry ?? null,
    [selectedGeofenceRecord],
  );

  const focusUnit = useCallback((unit: FleetUnit): void => {
    setSelectedUnit(unit);
    mapRef.current?.focusUnit(unit);
  }, []);

  const fitAll = useCallback((): void => {
    mapRef.current?.fitAll();
  }, []);

  const handlePickPoint = useCallback(
    (point: LatLng): void => {
      if (placingShape === 'circle') {
        const id = createGeofenceId();
        const geometry: Geofence = {
          shape: 'circle',
          latitude: point.latitude,
          longitude: point.longitude,
          radius: DEFAULT_GEOFENCE_RADIUS,
        };

        setGeofences((current) => [
          ...current,
          {
            id,
            name: `Geocerca ${current.length + 1}`,
            ...placementAppearanceRef.current,
            geometry,
          },
        ]);
        setSelectedGeofenceId(id);
        setDraftVertices([]);
        setPlacingShape(null);
        return;
      }

      if (placingShape === 'polygon') {
        setDraftVertices((current) => [...current, point]);
      }
    },
    [placingShape],
  );

  const handleDraftVertexMove = useCallback(
    (index: number, point: LatLng): void => {
      setDraftVertices((current) =>
        current.map((vertex, vertexIndex) =>
          vertexIndex === index ? point : vertex,
        ),
      );
    },
    [],
  );

  const handleFinishPolygon = useCallback((): void => {
    if (draftVertices.length < MIN_POLYGON_VERTICES) {
      return;
    }

    const id = createGeofenceId();

    setGeofences((current) => [
      ...current,
      {
        id,
        name: `Geocerca ${current.length + 1}`,
        ...placementAppearanceRef.current,
        geometry: { shape: 'polygon', vertices: draftVertices },
      },
    ]);
    setSelectedGeofenceId(id);
    setDraftVertices([]);
    setPlacingShape(null);
  }, [draftVertices]);

  const handleCancelPlacement = useCallback((): void => {
    setPlacingShape(null);
    setDraftVertices([]);
  }, []);

  const handleUndoDraftVertex = useCallback((): void => {
    setDraftVertices((current) => current.slice(0, -1));
  }, []);

  const handleGeofenceChange = useCallback(
    (next: Geofence): void => {
      setGeofences((current) =>
        current.map((item) =>
          item.id === selectedGeofenceId
            ? {
                ...item,
                geometry:
                  next.shape === 'circle'
                    ? { ...next, radius: clampGeofenceRadius(next.radius) }
                    : next,
              }
            : item,
        ),
      );
    },
    [selectedGeofenceId],
  );

  const handleGeofenceRadiusChange = useCallback(
    (radius: number | null | undefined): void => {
      if (
        radius === null ||
        radius === undefined ||
        !Number.isFinite(radius)
      ) {
        return;
      }

      setGeofences((current) =>
        current.map((item) =>
          item.id === selectedGeofenceId && item.geometry.shape === 'circle'
            ? {
                ...item,
                geometry: {
                  ...item.geometry,
                  radius: clampGeofenceRadius(radius),
                },
              }
            : item,
        ),
      );
    },
    [selectedGeofenceId],
  );

  const handleStartGeofencePlacement = useCallback(
    (shape: GeofenceShape, appearance?: GeofenceAppearance): void => {
      if (appearance && (!appearance.name.trim() || !validGeofenceColor(appearance.color))) return;
      placementAppearanceRef.current = appearance ? { ...appearance, name: appearance.name.trim() } : null;
      setDraftVertices([]);
      setPlacingShape(shape);
    },
    [],
  );

  const handleGeofenceAppearanceChange = useCallback((appearance: GeofenceAppearance): void => {
    if (!appearance.name.trim() || !validGeofenceColor(appearance.color)) return;
    setGeofences(current => current.map(item => item.id === selectedGeofenceId ? {
      ...item, name: appearance.name.trim(), color: appearance.color,
      purpose: item.sedeNombre ? 'sede' : appearance.purpose,
    } : item));
  }, [selectedGeofenceId]);

  const handleClearGeofence = useCallback((): void => {
    setGeofences((current) =>
      current.filter((item) => item.id !== selectedGeofenceId),
    );
    setSelectedGeofenceId(null);
    setPlacingShape(null);
    setDraftVertices([]);
  }, [selectedGeofenceId]);

  useEffect(() => {
    saveGeofences(geofences);
  }, [geofences]);

  useEffect(() => {
    if (
      selectedGeofenceId &&
      geofences.some((item) => item.id === selectedGeofenceId)
    ) {
      return;
    }

    setSelectedGeofenceId(geofences[0]?.id ?? null);
  }, [geofences, selectedGeofenceId]);

  useEffect(() => {
    if (!placingShape) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleCancelPlacement();
        return;
      }

      if (event.key !== 'Enter' || placingShape !== 'polygon') {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (target?.tagName === 'INPUT') {
        return;
      }

      handleFinishPolygon();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [placingShape, handleCancelPlacement, handleFinishPolygon]);

  const unitsInsideGeofence = useMemo(() => {
    if (!geofence) {
      return 0;
    }

    return units.filter((unit) => {
      const point: LatLng = {
        latitude: unit.latitud,
        longitude: unit.longitud,
      };

      if (geofence.shape === 'circle') {
        return (
          distanceMeters(
            {
              latitude: geofence.latitude,
              longitude: geofence.longitude,
            },
            point,
          ) <= geofence.radius
        );
      }

      return polygonContains(point, geofence.vertices);
    }).length;
  }, [geofence, units]);

  const unitsInsideSede = useMemo(() => {
    const sedeGeofences = geofences.filter(
      (item) => item.sedeNombre === 'Grupo Pecuario S.A.C.',
    );
    if (sedeGeofences.length === 0) {
      return 0;
    }
    return units.filter((unit) => {
      const point: LatLng = {
        latitude: unit.latitud,
        longitude: unit.longitud,
      };
      return sedeGeofences.some((item) =>
        item.geometry.shape === 'polygon'
          ? polygonContains(point, item.geometry.vertices)
          : distanceMeters(
              {
                latitude: item.geometry.latitude,
                longitude: item.geometry.longitude,
              },
              point,
            ) <= item.geometry.radius,
      );
    }).length;
  }, [geofences, units]);

  const geofenceArea = useMemo(
    () =>
      geofence?.shape === 'polygon'
        ? polygonAreaMeters(geofence.vertices)
        : 0,
    [geofence],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      snapshot,
      units,
      error,
      isRefreshing,
      hasLoaded,
      refresh,
      geofences,
      selectedGeofenceId,
      selectedGeofenceRecord,
      geofence,
      placingShape,
      draftVertices,
      unitsInsideGeofence,
      unitsInsideSede,
      geofenceArea,
      history,
      setHistory,
      showGpsGaps,
      setShowGpsGaps,
      activeTripsCount,
      setActiveTripsCount,
      selectedTrip,
      setSelectedTrip,
      mapRef,
      selectedUnit,
      setSelectedUnit,
      focusUnit,
      fitAll,
      setSelectedGeofenceId,
      handlePickPoint,
      handleDraftVertexMove,
      handleFinishPolygon,
      handleCancelPlacement,
      handleUndoDraftVertex,
      handleGeofenceChange,
      handleGeofenceRadiusChange,
      handleStartGeofencePlacement,
      handleGeofenceAppearanceChange,
      handleClearGeofence,
    }),
    [
      snapshot,
      units,
      error,
      isRefreshing,
      hasLoaded,
      refresh,
      geofences,
      selectedGeofenceId,
      selectedGeofenceRecord,
      geofence,
      placingShape,
      draftVertices,
      unitsInsideGeofence,
      unitsInsideSede,
      geofenceArea,
      history,
      showGpsGaps,
      activeTripsCount,
      selectedTrip,
      selectedUnit,
      focusUnit,
      fitAll,
      handlePickPoint,
      handleDraftVertexMove,
      handleFinishPolygon,
      handleCancelPlacement,
      handleUndoDraftVertex,
      handleGeofenceChange,
      handleGeofenceRadiusChange,
      handleStartGeofencePlacement,
      handleGeofenceAppearanceChange,
      handleClearGeofence,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState debe usarse dentro de AppStateProvider.');
  }

  return context;
}
