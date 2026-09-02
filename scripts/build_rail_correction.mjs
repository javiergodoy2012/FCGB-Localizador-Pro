#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ramalId = process.argv[2] || 'C15';
const indexPath = process.argv[3] || 'index.html';
const samplesPath = process.argv[4] || `rail-analysis/dense/${ramalId}-samples.json`;
const outputDir = process.argv[5] || 'rail-corrections';

function extractNetwork(source) {
  const marker = 'const NETWORK=';
  const start = source.indexOf(marker) + marker.length;
  const appStart = source.indexOf('const $=', start);
  const end = source.lastIndexOf('};', appStart) + 1;
  if (start < marker.length || appStart < 0 || end <= start) {
    throw new Error('No se pudo extraer NETWORK de index.html.');
  }
  return JSON.parse(source.slice(start, end));
}

function haversine(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const p1 = aLat * rad;
  const p2 = bLat * rad;
  const dp = (bLat - aLat) * rad;
  const dl = (bLon - aLon) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

const source = fs.readFileSync(indexPath, 'utf8');
const network = extractNetwork(source);
const ramal = network[ramalId];
if (!ramal) throw new Error(`No existe el ramal ${ramalId}.`);

const samples = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));
if (samples.length < 2) throw new Error(`No hay controles suficientes para ${ramalId}.`);
for (let i = 1; i < samples.length; i += 1) {
  if (samples[i].pk <= samples[i - 1].pk) throw new Error('Los controles no están ordenados por PK.');
}

const anchors = samples.map(sample => ({
  pk: sample.pk,
  dLat: sample.lat - sample.originalLat,
  dLon: sample.lon - sample.originalLon,
  referenceDistance: sample.distance,
  wayId: sample.wayId,
}));

let anchorIndex = 0;
const corrected = ramal.puntos.map(point => {
  const [pk, lat, lon] = point;
  while (anchorIndex < anchors.length - 2 && anchors[anchorIndex + 1].pk < pk) anchorIndex += 1;
  const left = anchors[anchorIndex];
  const right = anchors[Math.min(anchorIndex + 1, anchors.length - 1)];
  const width = right.pk - left.pk;
  const ratio = width ? Math.max(0, Math.min(1, (pk - left.pk) / width)) : 0;
  const dLat = left.dLat + ratio * (right.dLat - left.dLat);
  const dLon = left.dLon + ratio * (right.dLon - left.dLon);
  return [pk, lat + dLat, lon + dLon];
});

const movement = corrected.map((point, index) => haversine(
  ramal.puntos[index][1], ramal.puntos[index][2], point[1], point[2],
)).sort((a, b) => a - b);
const steps = [];
const originalSteps = [];
for (let i = 1; i < corrected.length; i += 1) {
  steps.push(haversine(corrected[i - 1][1], corrected[i - 1][2], corrected[i][1], corrected[i][2]));
  originalSteps.push(haversine(ramal.puntos[i - 1][1], ramal.puntos[i - 1][2], ramal.puntos[i][1], ramal.puntos[i][2]));
}
const existingDiscontinuities = originalSteps.filter(value => value > 25).length;
const newDiscontinuities = steps.filter((value, index) => value > 25 && originalSteps[index] <= 25).length;

const report = {
  ramal: ramalId,
  sourcePoints: ramal.puntos.length,
  anchors: anchors.length,
  pkPreserved: corrected.every((point, index) => point[0] === ramal.puntos[index][0]),
  movementMeters: {
    median: quantile(movement, 0.5),
    p95: quantile(movement, 0.95),
    max: movement.at(-1),
  },
  segmentMeters: {
    originalMedian: quantile(originalSteps.sort((a, b) => a - b), 0.5),
    correctedMedian: quantile([...steps].sort((a, b) => a - b), 0.5),
    correctedP99: quantile([...steps].sort((a, b) => a - b), 0.99),
    correctedMax: Math.max(...steps),
    existingDiscontinuities,
    newDiscontinuities,
  },
  endpoints: {
    start: corrected[0],
    end: corrected.at(-1),
  },
};

if (!report.pkPreserved) throw new Error('La corrección alteró las progresivas PK.');
if (report.segmentMeters.newDiscontinuities) {
  throw new Error(`La corrección produjo ${report.segmentMeters.newDiscontinuities} saltos nuevos mayores a 25 m.`);
}

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, `${ramalId}.json`), `${JSON.stringify({ramal: ramalId, anchors})}\n`);
fs.writeFileSync(path.join(outputDir, `${ramalId}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
