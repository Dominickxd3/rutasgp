import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGps } from './gps-quality';
test('audita ausentes, conflictos, saltos e interrupciones sin alterar originales', () => {
 const points = [
  {id:1,latitude:-12,longitude:-77,speed:null,gpsDate:new Date('2026-11-02T10:00:00Z')},
  {id:2,latitude:-13,longitude:-77,speed:0,gpsDate:new Date('2026-11-02T10:00:00Z')},
  {id:3,latitude:-14,longitude:-77,speed:0,gpsDate:new Date('2026-11-02T10:00:01Z')},
  {id:4,latitude:-14,longitude:-77,speed:0,gpsDate:new Date('2026-11-02T11:00:00Z')},
 ];
 const original = JSON.stringify(points);
 const result = auditGps(points,180,130);
 for (const code of ['MISSING_SPEED','CONFLICTING_DUPLICATE','IMPLAUSIBLE_JUMP','GAP']) assert.ok(result.issues.some(i=>i.code===code));
 assert.equal(JSON.stringify(points),original);
 assert.equal(result.physicallyCorroborated,false);
});
