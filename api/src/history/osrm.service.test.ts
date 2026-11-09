import test from 'node:test';
import assert from 'node:assert/strict';
import { OsrmService } from './osrm.service';

test('empalme conserva geometrías originales y marca el enlace como estimado', async () => {
  const service = new OsrmService({get:(_key:string,fallback:unknown)=>fallback} as any);
  const parts = [
    {coordinates:[[-77,-12],[-77.001,-12]],kind:'matched',confidence:0.9},
    {coordinates:[[-77.002,-12],[-77.003,-12]],kind:'matched',confidence:0.8},
  ];
  (service as any).matchChunk=async()=>parts;
  service.estimateRoute=async()=>[[-77.001,-12],[-77.001,-12.001],[-77.002,-12]];
  const result=await service.matchSegments([[{latitude:-12,longitude:-77},{latitude:-12,longitude:-77.003}]]);
  assert.equal(result.length,3);
  assert.equal(result[1].role,'junction-estimate');
  assert.equal(result[1].kind,'estimated');
  assert.equal(result[1].confidence,null);
  assert.deepEqual(result[0],parts[0]);
  assert.deepEqual(result[2],parts[1]);
});

test('si OSRM no encuentra el empalme no añade una recta artificial', async () => {
  const service = new OsrmService({get:(_key:string,fallback:unknown)=>fallback} as any);
  (service as any).matchChunk=async()=>[
    {coordinates:[[-77,-12],[-77.001,-12]],kind:'matched',confidence:0.9},
    {coordinates:[[-77.002,-12],[-77.003,-12]],kind:'matched',confidence:0.8},
  ];
  service.estimateRoute=async()=>null;
  const result=await service.matchSegments([[{latitude:-12,longitude:-77},{latitude:-12,longitude:-77.003}]]);
  assert.equal(result.length,2);
  assert.ok(result.every(part=>part.role===undefined));
});
