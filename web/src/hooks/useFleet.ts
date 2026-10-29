import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFleet } from '../services/fleetApi';
import type { FleetSnapshot } from '../types/fleet';

const POLL_INTERVAL_MS = 5_000;

interface UseFleetResult {
  snapshot: FleetSnapshot | null;
  units: FleetSnapshot['units'];
  error: string | null;
  isRefreshing: boolean;
  hasLoaded: boolean;
  refresh: () => void;
}

export function useFleet(
  pollIntervalMs: number = POLL_INTERVAL_MS,
): UseFleetResult {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (force = false): Promise<void> => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setIsRefreshing(true);

    try {
      const data = await fetchFleet(controller.signal, force);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setSnapshot(data);
      setError(null);
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : 'Ocurrió un error inesperado al consultar la flota.',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsRefreshing(false);
        setHasLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, pollIntervalMs);

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controllerRef.current?.abort();
    };
  }, [load, pollIntervalMs]);

  const refresh = useCallback((): void => {
    void load(true);
  }, [load]);

  return {
    snapshot,
    units: snapshot?.units ?? [],
    error,
    isRefreshing,
    hasLoaded,
    refresh,
  };
}
