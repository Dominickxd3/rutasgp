import { ApiProperty } from '@nestjs/swagger';

export class FleetUnitDto {
  @ApiProperty({
    description: 'Identificador interno de la unidad en el proveedor GPS.',
    example: '1084',
  })
  idUnidad!: string;

  @ApiProperty({ description: 'Placa del vehículo.', example: 'CJS-722' })
  placa!: string;

  @ApiProperty({
    description:
      'Cliente asociado. Es null cuando la unidad nunca ha reportado en el feed de posiciones actuales.',
    example: 'GRUPO PECUARIO SAC',
    type: String,
    nullable: true,
  })
  cliente!: string | null;

  @ApiProperty({ description: 'Estado del motor tal como lo entrega el GPS.', example: 'Encendido' })
  estadoMotor!: string;

  @ApiProperty({ description: 'true si el motor está encendido.', example: true })
  motorEncendido!: boolean;

  @ApiProperty({ description: 'Velocidad en km/h.', example: 22 })
  velocidad!: number;

  @ApiProperty({ description: 'Latitud en grados decimales (WGS84).', example: -12.0700016 })
  latitud!: number;

  @ApiProperty({ description: 'Longitud en grados decimales (WGS84).', example: -76.9726266 })
  longitud!: number;

  @ApiProperty({ description: 'Rumbo en grados (0-359).', example: 22 })
  orientacion!: number;

  @ApiProperty({ description: 'Voltaje de batería.', example: 13.53, type: Number, nullable: true })
  bateria!: number | null;

  @ApiProperty({ description: 'Kilometraje acumulado.', example: 0, type: Number, nullable: true })
  kilometraje!: number | null;

  @ApiProperty({
    description: 'Última lectura del GPS (hora del proveedor).',
    example: '2026-10-21 12:35:13',
    type: String,
    nullable: true,
  })
  fecha!: string | null;

  @ApiProperty({ description: 'Módulo GPS reportado.', example: '1234567890', type: String, nullable: true })
  modulo!: string | null;
}

export class FleetSnapshotDto {
  @ApiProperty({ description: 'Unidades con posición válida, ordenadas por placa.', type: [FleetUnitDto] })
  units!: FleetUnitDto[];

  @ApiProperty({ description: 'Cantidad de unidades en el snapshot.', example: 27 })
  total!: number;

  @ApiProperty({ description: 'Unidades en movimiento (velocidad > 0).', example: 3 })
  moving!: number;

  @ApiProperty({ description: 'Unidades detenidas.', example: 24 })
  stopped!: number;

  @ApiProperty({
    description: 'Momento en que la API generó esta respuesta (ISO 8601, UTC).',
    example: '2026-10-21T17:37:06.000Z',
  })
  updatedAt!: string;

  @ApiProperty({
    description:
      'true cuando el proveedor GPS falló y se devolvió la última copia en cache.',
    example: false,
  })
  stale!: boolean;

  @ApiProperty({
    description: 'Detalle del problema cuando stale es true.',
    example: 'El proveedor GPS no responde. Se muestra la última posición conocida.',
    type: String,
    required: false,
  })
  warning?: string;
}
