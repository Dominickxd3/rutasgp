import type { TripRecord } from '../types/trip.types';

export const STATUS_LABELS: Record<TripRecord['estado'], string> = {
  EN_CURSO: 'En ruta',
  FINALIZADO: 'Finalizado',
  INCOMPLETO: 'Incompleto',
  OBSERVADO: 'Observado',
  PARCIAL: 'Parcial',
  REPROCESADO: 'Reprocesado',
};
