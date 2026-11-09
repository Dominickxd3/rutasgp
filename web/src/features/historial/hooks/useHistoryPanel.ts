import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchHistoryPositions,
  fetchHistoryVehicles,
} from '../services/history.service';
import type { HistoryResult, HistoryVehicle } from '../types/history.types';
import type { HistoryPanelProps } from '../types/history-panel.types';
import { detectGeofenceTransitions } from '../../../lib/historyAnalysis';

export function useHistoryPanel({
  onVisualization,
  geofences,
}: Omit<HistoryPanelProps, 'isTab'>) {
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const [open, setOpen] = useState(true);
  const [vehicles, setVehicles] = useState<HistoryVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(today);
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [visiblePoints, setVisiblePoints] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const transitions = useMemo(
    () => (result ? detectGeofenceTransitions(result, geofences) : []),
    [result, geofences],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHistoryVehicles(controller.signal)
      .then((items) => {
        setVehicles(items);
        setVehicleId((current) => current || String(items[0]?.id ?? ''));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'No se pudieron cargar los vehículos.',
          );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (result) onVisualization({ result, visiblePoints });
  }, [result, visiblePoints, onVisualization]);

  useEffect(() => {
    if (!playing || !result) return;
    timer.current = window.setInterval(() => {
      setVisiblePoints((current) => {
        const next = Math.min(result.points.length, current + speed);
        if (next >= result.points.length) setPlaying(false);
        return next;
      });
    }, 500);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [playing, result, speed]);

  const consult = async () => {
    const id = Number(vehicleId);
    if (!id || !date) return;
    const from = new Date(`${date}T${fromTime}:00`);
    const to = new Date(`${date}T${toTime}:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setError('Selecciona una fecha y horas válidas.');
      return;
    }
    if (to <= from) {
      setError('La hora "Hasta" debe ser posterior a la hora "Desde".');
      return;
    }
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const next = await fetchHistoryPositions(id, from, to);
      setResult(next);
      setVisiblePoints(next.points.length);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo consultar el recorrido.',
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    open,
    setOpen,
    vehicles,
    vehicleId,
    setVehicleId,
    date,
    setDate,
    fromTime,
    setFromTime,
    toTime,
    setToTime,
    result,
    visiblePoints,
    setVisiblePoints,
    playing,
    setPlaying,
    speed,
    setSpeed,
    loading,
    error,
    transitions,
    consult,
  };
}
