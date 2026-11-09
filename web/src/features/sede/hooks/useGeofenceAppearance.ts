import { useState } from 'react';
import type { GeofenceAppearance, GeofencePurpose, GeofenceRecord } from '../types/geofence.types';
import { geofenceAppearance } from '../utils/geofence-appearance.utils';
import { GEOFENCE_COLORS } from '../config/geofence.config';

export function useGeofenceAppearance(record: GeofenceRecord | null) {
  const [mode, setMode] = useState<'new' | 'edit'>('new');
  const key = mode === 'edit' ? record?.id ?? 'missing' : 'new';
  const [draft, setDraft] = useState<{ key: string; value: GeofenceAppearance } | null>(null);
  const value = draft?.key === key ? draft.value : mode === 'edit' ? geofenceAppearance(record)
    : { name: '', purpose: 'cliente' as const, color: GEOFENCE_COLORS.cliente };
  function update(change: Partial<GeofenceAppearance>) { setDraft({ key, value: { ...value, ...change } }); }
  return { mode, setMode: (next: 'new' | 'edit') => { setMode(next); setDraft(null); }, value, update,
    changePurpose: (purpose: GeofencePurpose) => update({ purpose, color: GEOFENCE_COLORS[purpose] }) };
}
