import type { HistoryResult } from '../types/history.types';

export function downloadCsv(result: HistoryResult): void {
  const header =
    'fecha_gps_utc,latitud,longitud,velocidad_kmh,estado_motor,orientacion';
  const rows = result.points.map((point) =>
    [
      point.gpsDate,
      point.latitude,
      point.longitude,
      point.speed ?? '',
      `"${(point.engine ?? '').replace(/"/g, '""')}"`,
      point.heading ?? '',
    ].join(','),
  );
  const blob = new Blob([[header, ...rows].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recorrido-${result.vehicleId}-${result.interval.from.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
