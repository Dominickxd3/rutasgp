import { useEffect, useState } from 'react';
import { getOrders } from '../services/shipments.service';
import type { LocalOrderPage, LocalOrderProduct } from '../types/local-orders.types';

export function useLocalOrders(date: string) {
  const [navigation, setNavigation] = useState({ date, cursors: [0] });
  const cursors = navigation.date === date ? navigation.cursors : [0];
  const cursor = cursors[cursors.length - 1];
  const key = `${date}:${cursor}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: LocalOrderPage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ key: string; id: number } | null>(null);
  const [products, setProducts] = useState<{ id: number; items: LocalOrderProduct[]; truncated: boolean } | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const selectedId = selected?.key === key ? selected.id : null;
  useEffect(() => {
    const controller = new AbortController();
    if (!date) { setLoading(false); return; }
    setLoading(true); setError(null);
    void getOrders<LocalOrderPage>(`?${new URLSearchParams({ from: date, to: date, after: String(cursor) })}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se cargaron los pedidos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, cursor, key, revision]);
  useEffect(() => {
    const controller = new AbortController();
    if (selectedId === null) return;
    setProductsLoading(true);
    void getOrders<{ items: LocalOrderProduct[]; truncated: boolean }>(`products?id=${selectedId}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setProducts({ id: selectedId, ...data }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se cargaron los productos.'); })
      .finally(() => { if (!controller.signal.aborted) setProductsLoading(false); });
    return () => controller.abort();
  }, [selectedId]);
  const data = result?.key === key ? result.data : null;
  return { data, error, loading, page: cursors.length, selectedId, productsLoading,
    products: products?.id === selectedId ? products : null,
    select: (id: number) => setSelected(selectedId === id ? null : { key, id }),
    refresh: () => setRevision(value => value + 1),
    next: () => { if (data?.next) setNavigation({ date, cursors: [...cursors, data.next] }); },
    previous: () => { if (cursors.length > 1) setNavigation({ date, cursors: cursors.slice(0, -1) }); } };
}
