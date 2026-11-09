export interface GeofenceEventInput {
  id_evento: number;
  id_sede: number;
  tipo_evento: 'SALIDA' | 'ENTRADA';
  fecha_gps_utc: Date;
  id_posicion: number;
}

export type TripEndReason = 'ENTRADA' | 'SIGUIENTE_SALIDA' | 'SIN_RETORNO';

export interface TripWindow {
  salida: GeofenceEventInput;
  entrada: GeofenceEventInput | null;
  endReason: TripEndReason;
  /**
   * Límite superior observado cuando no existe ENTRADA. Ocurre cuando una
   * segunda SALIDA aparece antes de que se registre el retorno: el primer
   * recorrido se cierra con la última señal disponible y se marca INCOMPLETO.
   */
  endLimit: Date | null;
}

/**
 * Empareja eventos de geocerca en orden cronológico.
 *
 * Reglas:
 * - Una ENTRADA sin SALIDA previa no inventa un origen; se ignora.
 * - Una SALIDA con otra SALIDA pendiente cierra el primer recorrido como
 *   incompleto y abre el segundo, evitando recorridos superpuestos.
 * - La última SALIDA sin ENTRADA queda abierta (EN_CURSO o INCOMPLETO según
 *   la antigüedad de su última observación).
 */
export function buildTripWindows(events: GeofenceEventInput[]): TripWindow[] {
  const ordered = [...events].sort(
    (a, b) =>
      a.fecha_gps_utc.getTime() - b.fecha_gps_utc.getTime() ||
      a.id_evento - b.id_evento,
  );

  const windows: TripWindow[] = [];
  let openExit: GeofenceEventInput | null = null;

  for (const event of ordered) {
    if (event.tipo_evento === 'SALIDA') {
      if (openExit) {
        windows.push({
          salida: openExit,
          entrada: null,
          endReason: 'SIGUIENTE_SALIDA',
          endLimit: event.fecha_gps_utc,
        });
      }
      openExit = event;
      continue;
    }

    if (!openExit) {
      // ENTRADA sin salida observada: el origen del viaje es desconocido.
      continue;
    }

    windows.push({
      salida: openExit,
      entrada: event,
      endReason: 'ENTRADA',
      endLimit: event.fecha_gps_utc,
    });
    openExit = null;
  }

  if (openExit) {
    windows.push({
      salida: openExit,
      entrada: null,
      endReason: 'SIN_RETORNO',
      endLimit: null,
    });
  }

  return windows;
}
