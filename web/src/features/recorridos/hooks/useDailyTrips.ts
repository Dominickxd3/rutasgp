import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchDailyTrips,
  fetchTripsAudit,
  triggerConsolidation,
} from '../services/trips.service';
import { fetchHistoryPositions } from '../../historial/services/history.service';
import type { TripRecord, TripsAuditReport } from '../types/trip.types';
import type { DailyTripsPanelProps } from '../types/daily-trips-panel.types';

export function useDailyTrips({
  onVisualization,
  onActiveCountChange,
  onTripSelected,
  selectedTrip,
  liveEnabled = true,
}: Omit<DailyTripsPanelProps, 'isTab'>) {
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState(today);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [audit, setAudit] = useState<TripsAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(
    selectedTrip?.idRecorrido ?? null,
  );
  const [loadingTripId, setLoadingTripId] = useState<number | null>(null);
  const [liveUpdating, setLiveUpdating] = useState(false);
  const liveRequestRef = useRef(false);
  const [lastRouteUpdate, setLastRouteUpdate] = useState<string | null>(null);

  // Mantener sincronizado si la selección se cancela desde el mapa
  useEffect(() => {
    setSelectedTripId(selectedTrip?.idRecorrido ?? null);
  }, [selectedTrip]);

  const loadTrips = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchDailyTrips({ date: targetDate });
      setTrips(items);
      try {
        setAudit(await fetchTripsAudit());
      } catch {
        setAudit(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error cargando recorridos.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrips(date);
  }, [date]);

  const stats = useMemo(() => {
    const total = trips.length;
    const active = trips.filter((t) => t.estado === 'EN_CURSO').length;
    const finished = trips.filter(
      (t) => t.estado === 'FINALIZADO' || t.estado === 'OBSERVADO',
    ).length;
    const totalKm =
      trips.reduce((sum, t) => sum + (t.distanciaObservadaM ?? 0), 0) / 1000;
    const totalStops = trips.reduce((sum, t) => sum + t.cantidadParadas, 0);
    return { total, active, finished, totalKm: totalKm.toFixed(1), totalStops };
  }, [trips]);

  useEffect(() => {
    onActiveCountChange?.(stats.active);
  }, [stats.active, onActiveCountChange]);

  const handleConsolidate = async () => {
    setConsolidating(true);
    try {
      await triggerConsolidation();
      await loadTrips(date);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error durante consolidación.',
      );
    } finally {
      setConsolidating(false);
    }
  };

  const loadTripOnMap = useCallback(
    async (trip: TripRecord, silent = false) => {
      if (liveRequestRef.current) return;
      liveRequestRef.current = true;
      if (!silent) {
        setSelectedTripId(trip.idRecorrido);
        setLoadingTripId(trip.idRecorrido);
      } else {
        setLiveUpdating(true);
      }
      setError(null);
      try {
        const from = new Date(trip.fechaInicioUtc);
        const to = trip.fechaFinUtc ? new Date(trip.fechaFinUtc) : new Date();
        const result = await fetchHistoryPositions(trip.idVehiculo, from, to);
        if (!result.points.length)
          throw new Error(
            'Sin nuevas posiciones disponibles; se conserva el último trazado.',
          );
        onVisualization({ result, visiblePoints: result.points.length });
        setLastRouteUpdate(new Date().toLocaleTimeString('es-PE'));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo actualizar; se conserva el último trazado.',
        );
      } finally {
        liveRequestRef.current = false;
        setLoadingTripId(null);
        setLiveUpdating(false);
      }
    },
    [onVisualization],
  );

  const handleSelectTrip = async (trip: TripRecord) => {
    // Si se hace clic en el mismo recorrido que ya está activo, se deselecciona
    if (selectedTripId === trip.idRecorrido) {
      setSelectedTripId(null);
      onTripSelected?.(null);
      onVisualization(null);
      return;
    }
    setSelectedTripId(trip.idRecorrido);
    onTripSelected?.(trip);
    await loadTripOnMap(trip);
  };

  // Actualizar automáticamente la traza cada 15 segundos si el recorrido está EN_CURSO
  useEffect(() => {
    const selected = trips.find((trip) => trip.idRecorrido === selectedTripId);
    if (!liveEnabled || !selected || selected.estado !== 'EN_CURSO') return;

    const timer = window.setInterval(() => {
      void loadTripOnMap(selected, true);
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [trips, selectedTripId, loadTripOnMap, liveEnabled]);

  // Actualizar la lista de recorridos en vivo periódicamente para mantener métricas al día
  useEffect(() => {
    if (!liveEnabled || stats.active === 0) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchDailyTrips({ date }).then((items) => setTrips(items)).catch(() => {});
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [liveEnabled, stats.active, date]);

  return {
    open,
    setOpen,
    date,
    setDate,
    trips,
    audit,
    loading,
    consolidating,
    error,
    selectedTripId,
    loadingTripId,
    liveUpdating,
    lastRouteUpdate,
    stats,
    handleConsolidate,
    handleSelectTrip,
  };
}
