export interface QualityPoint {
  id: number; latitude: number; longitude: number; speed: number | null; gpsDate: Date;
}
export function auditGps(points: QualityPoint[], gapSeconds: number, maximumKmh: number) {
  const issues: Array<{ code: string; positionIds: number[] }> = [];
  const seen = new Map<number, QualityPoint>();
  let previous: QualityPoint | undefined;
  let missingSeconds = 0;
  for (const point of points) {
    const time = point.gpsDate.getTime();
    if (!Number.isFinite(time)) { issues.push({ code: 'INVALID_DATE', positionIds: [point.id] }); continue; }
    if (point.speed === null) issues.push({ code: 'MISSING_SPEED', positionIds: [point.id] });
    const duplicate = seen.get(time);
    if (duplicate) issues.push({ code: duplicate.latitude !== point.latitude || duplicate.longitude !== point.longitude || duplicate.speed !== point.speed ? 'CONFLICTING_DUPLICATE' : 'DUPLICATE', positionIds: [duplicate.id, point.id] });
    seen.set(time, point);
    if (previous) {
      const seconds = (time - previous.gpsDate.getTime()) / 1000;
      if (seconds < 0) issues.push({ code: 'OUT_OF_ORDER', positionIds: [previous.id, point.id] });
      if (seconds > gapSeconds) { missingSeconds += seconds; issues.push({ code: 'GAP', positionIds: [previous.id, point.id] }); }
      const rad = Math.PI / 180;
      const h = Math.sin((point.latitude - previous.latitude)*rad/2)**2 + Math.cos(previous.latitude*rad)*Math.cos(point.latitude*rad)*Math.sin((point.longitude-previous.longitude)*rad/2)**2;
      const distance = 6371000 * 2 * Math.asin(Math.min(1,Math.sqrt(h)));
      if (seconds > 0 && distance / seconds * 3.6 > maximumKmh) issues.push({ code: 'IMPLAUSIBLE_JUMP', positionIds: [previous.id, point.id] });
    }
    previous = point;
  }
  return { version: 'gps-quality-v1', scope: 'returned-page', points: points.length,
    policy: { gapSeconds, maximumKmh, status: 'REQUIRES_EXTERNAL_VALIDATION' },
    missingSeconds, issues, trainingStatus: issues.length ? 'REVIEW_REQUIRED' : 'CONSISTENT_NOT_CORROBORATED',
    physicallyCorroborated: false };
}
