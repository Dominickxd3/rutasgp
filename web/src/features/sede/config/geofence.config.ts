import type { GeofencePurpose } from '../types/geofence.types';

export const GEOFENCE_COLORS: Record<GeofencePurpose, string> = {
  cliente: '#8b5cf6', sede: '#2563eb', zona: '#0d9488',
};
export const GEOFENCE_PURPOSE_OPTIONS = [
  { label: 'Cliente', value: 'cliente' },
  { label: 'Sede', value: 'sede' },
  { label: 'Otra zona', value: 'zona' },
];
