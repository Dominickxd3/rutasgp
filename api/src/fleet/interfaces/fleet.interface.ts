export interface RawFleetUnit {
  [key: string]: unknown;
}

export interface FleetUnit {
  idUnidad: string;
  placa: string;
  cliente: string | null;
  estadoMotor: string;
  motorEncendido: boolean;
  velocidad: number;
  latitud: number;
  longitud: number;
  orientacion: number;
  bateria: number | null;
  kilometraje: number | null;
  fecha: string | null;
  modulo: string | null;
}

export interface FleetSnapshot {
  units: FleetUnit[];
  total: number;
  moving: number;
  stopped: number;
  updatedAt: string;
  stale: boolean;
  warning?: string;
}
