import { useEffect, useState } from 'react';

import { fetchMobileLive, type MobileLiveResult } from '../services/mobile-devices.service';

const REFRESH_MS = 20_000;

/** Recorrido de hoy de los celulares y sus camiones, actualizado cada 20 s mientras esté activo. */
export function useMobileLive(enabled: boolean) {
  const [data, setData] = useState<MobileLiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await fetchMobileLive(controller.signal);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el recorrido de los celulares.');
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { data, error };
}
