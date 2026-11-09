import { useEffect, useRef, useState } from 'react';
import { fetchOrderVehicles, fetchShipments } from '../services/shipments.service';
import type { LocalOrderVehicle, ShipmentPage } from '../types/shipment.types';

interface Navigation { key: string; cursors: number[]; index: number }
export function useShipmentOrders(date: string, vehicleId: number | null, pollingMs: number) {
  const key = `${date}:${vehicleId ?? 'all'}`;
  const [navigation, setNavigation] = useState<Navigation>({ key, cursors: [0], index: 0 });
  const nav = navigation.key === key ? navigation : { key, cursors: [0], index: 0 };
  const cursor = nav.cursors[nav.index];
  const requestKey = `${key}:${cursor}`;
  const [result, setResult] = useState<{ key: string; data: ShipmentPage } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [vehicles, setVehicles] = useState<LocalOrderVehicle[]>([]);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const sequence = useRef(0);
  const data = result?.key === requestKey ? result.data : null;
  const error = failure?.key === requestKey ? failure.message : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetchOrderVehicles(controller.signal).then(value => {
      if (!controller.signal.aborted) { setVehicles(value); setVehiclesError(null); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setVehiclesError(error instanceof Error ? error.message : 'No se cargó el catálogo de camiones.');
    });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    if (!date) { setLoading(false); return () => controller.abort(); }
    setLoading(true); setFailure(null);
    void fetchShipments(date, vehicleId, cursor, controller.signal).then(value => {
      if (!controller.signal.aborted && current === sequence.current) setResult({ key: requestKey, data: value });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && current === sequence.current) setFailure({ key: requestKey,
        message: error instanceof Error ? error.message : 'No se pudo conectar con el ERP.' });
    }).finally(() => {
      if (!controller.signal.aborted && current === sequence.current) setLoading(false);
    });
    return () => controller.abort();
  }, [date, vehicleId, cursor, requestKey, revision]);

  useEffect(() => {
    if (!date || !pollingMs || loading || nav.index !== 0) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') setRevision(value => value+1);
    }, pollingMs);
    const visible = () => { if (document.visibilityState === 'visible') setRevision(value => value+1); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [date, pollingMs, loading, nav.index, revision]);

  function next() {
    const value = data?.metadata.nextCursor;
    if (loading || value == null || value <= cursor) return;
    setNavigation({ key, cursors: [...nav.cursors.slice(0,nav.index+1),value], index: nav.index+1 });
  }
  function previous() { if (!loading && nav.index > 0) setNavigation({ ...nav, index: nav.index-1 }); }
  return { data, error, loading, vehicles, vehiclesError, page: nav.index+1,
    next, previous, reload: () => setRevision(value => value+1),
    refresh: () => { if (!loading) setRevision(value => value+1); } };
}
