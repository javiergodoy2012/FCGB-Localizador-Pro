#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ramalId = process.argv[2] || 'C15';
const indexPath = process.argv[3] || 'index.html';
const outputDir = process.argv[4] || 'rail-analysis';

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

function projectToSegment(lat, lon, segment) {
  const lat0 = lat * Math.PI / 180;
  const mx = 111320 * Math.cos(lat0);
  const my = 110540;
  const ax = (segment.aLon - lon) * mx;
  const ay = (segment.aLat - lat) * my;
  const bx = (segment.bLon - lon) * mx;
  const by = (segment.bLat - lat) * my;
  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  const t = denom ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return {
    distance: Math.hypot(x, y),
    lat: segment.aLat + t * (segment.bLat - segment.aLat),
    lon: segment.aLon + t * (segment.bLon - segment.aLon),
    wayId: segment.wayId,
  };
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

async function fetchOverpass(query) {
  const endpoints = [
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'referer': 'https://upsaltavision.com.ar/',
          'user-agent': 'UP-Salta-Vision/1.0 (rail alignment validation)',
        },
        body: new URLSearchParams({data: query}),
        signal: AbortSignal.timeout(240000),
      });
      if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Falló ${endpoint}: ${error.message}`);
    }
  }
  throw lastError || new Error('No respondió ningún servidor Overpass.');
}

const source = fs.readFileSync(indexPath, 'utf8');
const network = extractNetwork(source);
const ramal = network[ramalId];
if (!ramal) throw new Error(`No existe el ramal ${ramalId}.`);

const points = ramal.puntos;
const lats = points.map(point => point[1]);
const lons = points.map(point => point[2]);
const padding = 0.06;
const south = Math.min(...lats) - padding;
const west = Math.min(...lons) - padding;
const north = Math.max(...lats) + padding;
const east = Math.max(...lons) + padding;
const query = `[out:json][timeout:180];way["railway"~"^(rail|narrow_gauge|disused|abandoned|construction)$"](${south},${west},${north},${east});out tags geom;`;

console.log(`Consultando vías para ${ramalId}: ${south},${west},${north},${east}`);
const osm = await fetchOverpass(query);
const segments = [];
for (const way of osm.elements || []) {
  const geometry = way.geometry || [];
  for (let i = 1; i < geometry.length; i += 1) {
    const a = geometry[i - 1];
    const b = geometry[i];
    if (haversine(a.lat, a.lon, b.lat, b.lon) > 5000) continue;
    segments.push({aLat: a.lat, aLon: a.lon, bLat: b.lat, bLon: b.lon, wayId: way.id});
  }
}
if (!segments.length) throw new Error('Overpass no devolvió segmentos ferroviarios.');

const cellSize = 0.02;
const grid = new Map();
const cellKey = (x, y) => `${x}:${y}`;
for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  const minX = Math.floor(Math.min(segment.aLon, segment.bLon) / cellSize);
  const maxX = Math.floor(Math.max(segment.aLon, segment.bLon) / cellSize);
  const minY = Math.floor(Math.min(segment.aLat, segment.bLat) / cellSize);
  const maxY = Math.floor(Math.max(segment.aLat, segment.bLat) / cellSize);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const key = cellKey(x, y);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    }
  }
}

function nearestRail(point) {
  const [, lat, lon] = point;
  const x = Math.floor(lon / cellSize);
  const y = Math.floor(lat / cellSize);
  let best = null;
  for (let radius = 0; radius <= 3 && !best; radius += 1) {
    const candidates = new Set();
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (const index of grid.get(cellKey(x + dx, y + dy)) || []) candidates.add(index);
      }
    }
    for (const index of candidates) {
      const projected = projectToSegment(lat, lon, segments[index]);
      if (!best || projected.distance < best.distance) best = projected;
    }
  }
  return best;
}

const sampleEvery = Math.max(1, Math.round(points.length / Math.max(700, (ramal.km_fin - ramal.km_inicio) * 2)));
const samples = [];
for (let i = 0; i < points.length; i += sampleEvery) {
  const point = points[i];
  const nearest = nearestRail(point);
  if (nearest) samples.push({pk: point[0], originalLat: point[1], originalLon: point[2], ...nearest});
}
if ((points.length - 1) % sampleEvery) {
  const point = points.at(-1);
  const nearest = nearestRail(point);
  if (nearest) samples.push({pk: point[0], originalLat: point[1], originalLon: point[2], ...nearest});
}

const distances = samples.map(item => item.distance).sort((a, b) => a - b);
const report = {
  ramal: ramalId,
  nombre: ramal.nombre,
  kmInicio: ramal.km_inicio,
  kmFin: ramal.km_fin,
  sourcePoints: points.length,
  osmWays: (osm.elements || []).length,
  osmSegments: segments.length,
  samples: samples.length,
  distanceMeters: {
    median: quantile(distances, 0.5),
    p90: quantile(distances, 0.9),
    p95: quantile(distances, 0.95),
    max: distances.at(-1),
  },
  thresholds: {
    within15m: distances.filter(value => value <= 15).length,
    within30m: distances.filter(value => value <= 30).length,
    within60m: distances.filter(value => value <= 60).length,
    over100m: distances.filter(value => value > 100).length,
    over250m: distances.filter(value => value > 250).length,
  },
  worst: [...samples].sort((a, b) => b.distance - a.distance).slice(0, 50),
};

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, `${ramalId}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, `${ramalId}-samples.json`), `${JSON.stringify(samples)}\n`);
console.log(JSON.stringify(report, null, 2));
