/*
  020 - Celulares GPSCamiones: asignación a camión y eventos de paradas/geocercas.

  Se ejecuta una sola vez en DB_GP_DistribucionML, ANTES de desplegar la versión
  que incluye /api/mobile/device/config y /api/mobile/events/batch.
  Es idempotente: si las tablas ya existen no hace nada.
  No modifica ni borra tablas existentes.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.GPS_DispositivosMoviles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.GPS_DispositivosMoviles (
    device_id              varchar(128)  NOT NULL CONSTRAINT PK_GPS_DispositivosMoviles PRIMARY KEY,
    id_vehiculo            int           NULL
      CONSTRAINT FK_GPS_DispositivosMoviles_Vehiculos REFERENCES dbo.Vehiculos (id_vehiculo),
    modelo                 nvarchar(120) NULL,
    ultimo_usuario         varchar(50)   NULL,
    primer_contacto_utc    datetime2(3)  NOT NULL CONSTRAINT DF_GPS_DispositivosMoviles_primer DEFAULT sysutcdatetime(),
    ultimo_contacto_utc    datetime2(3)  NOT NULL CONSTRAINT DF_GPS_DispositivosMoviles_ultimo DEFAULT sysutcdatetime(),
    asignado_por           varchar(50)   NULL,
    fecha_asignacion_utc   datetime2(3)  NULL,
    activo                 bit           NOT NULL CONSTRAINT DF_GPS_DispositivosMoviles_activo DEFAULT 1
  );
  CREATE INDEX IX_GPS_DispositivosMoviles_vehiculo ON dbo.GPS_DispositivosMoviles (id_vehiculo);
END;

IF OBJECT_ID(N'dbo.GPS_EventosMovil', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.GPS_EventosMovil (
    id_evento              uniqueidentifier NOT NULL CONSTRAINT PK_GPS_EventosMovil PRIMARY KEY,
    device_id              varchar(128)  NOT NULL,
    id_unidad_proveedor    int           NOT NULL,
    placa                  varchar(15)   NOT NULL,
    tipo                   varchar(20)   NOT NULL,  -- STOP_START, STOP_END, GEOFENCE_ENTER, GEOFENCE_EXIT
    tipo_parada            varchar(20)   NULL,      -- POSIBLE_ENTREGA, TRAFICO, NO_PROGRAMADA, BASE (inferido por GPS, no confirma entregas)
    fecha_gps_utc          datetime2(3)  NOT NULL,
    inicio_utc             datetime2(3)  NULL,
    fin_utc                datetime2(3)  NULL,
    duracion_s             int           NULL,
    latitud                decimal(10,7) NOT NULL,
    longitud               decimal(10,7) NOT NULL,
    id_ruta                bigint        NULL,
    id_parada_ruta         bigint        NULL,
    id_geocerca            nvarchar(64)  NULL,
    tipo_geocerca          varchar(20)   NULL,
    nombre_lugar           nvarchar(150) NULL,
    registrado_sin_senal   bit           NOT NULL CONSTRAINT DF_GPS_EventosMovil_sin_senal DEFAULT 0,
    fecha_recepcion_utc    datetime2(3)  NOT NULL CONSTRAINT DF_GPS_EventosMovil_recepcion DEFAULT sysutcdatetime()
  );
  CREATE INDEX IX_GPS_EventosMovil_unidad_fecha ON dbo.GPS_EventosMovil (id_unidad_proveedor, fecha_gps_utc);
END;

COMMIT TRANSACTION;
