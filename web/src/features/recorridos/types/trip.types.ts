export interface TripRecord {
  idRecorrido: number;
  idVehiculo: number;
  placa: string;
  idSede: number | null;
  sedeNombre: string | null;
  fechaInicioUtc: string;
  fechaFinUtc: string | null;
  duracionSegundos: number | null;
  distanciaObservadaM: number | null;
  cantidadPuntos: number;
  cantidadGaps: number;
  coberturaGpsPct: number | null;
  cantidadParadas: number;
  duracionParadasSeg: number;
  estado:
    | 'EN_CURSO'
    | 'FINALIZADO'
    | 'INCOMPLETO'
    | 'OBSERVADO'
    | 'PARCIAL'
    | 'REPROCESADO';
  versionAlgoritmo: string | null;
  fechaProcesamientoUtc: string;
  origenObservado: boolean;
}

export interface TripsAuditReport {
  generadoEnUtc: string;
  estado: 'OK' | 'ADVERTENCIA' | 'ERROR';
  resumen: {
    posiciones: number;
    eventosVigentes: number;
    recorridos: number;
    paradas: number;
  };
  controles: Record<string, number>;
  distribucion: {
    estados: Array<{ valor: string; cantidad: number }>;
    confianza: Array<{ valor: string; cantidad: number }>;
    ubicacion: Array<{ valor: string; cantidad: number }>;
    versiones: Array<{ valor: string; cantidad: number }>;
  };
  incidencias: Array<{
    codigo: string;
    severidad: 'ERROR' | 'ADVERTENCIA' | 'INFO';
    descripcion: string;
    cantidad: number;
  }>;
}
