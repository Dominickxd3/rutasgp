import { useEffect, useRef, useState } from 'react';
import { confirmOrderLink, fetchOrderCandidates, revokeOrderLink } from '../services/order-links.service';
import type { CandidatePage, ConfirmOrderLink } from '../types/order-links.types';

export function useOrderLinks(guideId: number, onChanged: () => void) {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: CandidatePage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const key = `${guideId}:${orderId}`;
  useEffect(() => () => mutation.current?.abort(), [guideId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void fetchOrderCandidates(guideId, orderId, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se cargaron los pedidos.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [guideId, orderId, key, revision]);

  async function mutate(operation: (signal: AbortSignal) => Promise<void>) {
    if (mutation.current) return false;
    const controller = new AbortController();
    mutation.current = controller; setSaving(true); setError(null);
    try {
      await operation(controller.signal);
      if (!controller.signal.aborted) { setRevision(value => value + 1); onChanged(); }
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se guardó el vínculo.');
      return false;
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }
  return { data: result?.key === key ? result.data : null, error, loading, saving,
    save: (body: ConfirmOrderLink) => mutate(signal => confirmOrderLink(guideId, body, signal)),
    revoke: (id: number, evidence: string, reviewer: string) => mutate(signal => revokeOrderLink(guideId, id, evidence, reviewer, signal)),
    search: (id: number | null) => { setOrderId(id); setRevision(value => value + 1); } };
}
